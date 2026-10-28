"""Gemini provider adapter using the official ``google-genai`` SDK.

Verified against google-genai 2.33.0:
- ``client.aio.models.generate_content(model=..., contents=..., config=GenerateContentConfig(...))``
- ``GenerateContentConfig`` fields: ``system_instruction``, ``response_mime_type``,
  ``response_json_schema``, ``max_output_tokens``, ``temperature``, ``http_options``
- ``HttpOptions.timeout`` is in **milliseconds**; ``HttpRetryOptions(attempts=1)`` disables
  SDK retries (the default would be 5). Retries are owned by the service layer.
- Errors: ``google.genai.errors.ClientError`` (4xx) / ``ServerError`` (5xx), both
  subclasses of ``APIError`` with ``.code`` and ``.status``.

Creating the client does not make a network call, so startup never spends quota.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Sequence
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.core.logging import get_logger
from app.providers.base import ProviderError, ProviderErrorKind, ProviderResult, ProviderUsage

logger = get_logger()

DEFAULT_FALLBACK_MODELS: tuple[str, ...] = (
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
)


def _retry_after_seconds(exc: genai_errors.APIError) -> float | None:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers is None:
        return None
    try:
        raw = headers.get("retry-after")
    except Exception:  # pragma: no cover - defensive against unusual response types
        return None
    if not raw:
        return None
    raw = str(raw).strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        pass
    try:
        when = parsedate_to_datetime(raw)
        return max(0.0, (when - datetime.now(timezone.utc)).total_seconds())
    except (TypeError, ValueError):
        return None


def _classify_api_error(exc: genai_errors.APIError) -> ProviderError:
    code = int(getattr(exc, "code", 0) or 0)
    status = str(getattr(exc, "status", "") or "").upper()
    message = str(getattr(exc, "message", "") or "").lower()

    if code in (401, 403) or status in ("UNAUTHENTICATED", "PERMISSION_DENIED"):
        return ProviderError(ProviderErrorKind.AUTH, status_code=code)
    if code == 400 and ("api key" in message or "api_key" in message):
        # The Gemini API reports invalid keys as 400 INVALID_ARGUMENT / API_KEY_INVALID.
        return ProviderError(ProviderErrorKind.AUTH, status_code=code)
    if code == 429 or status == "RESOURCE_EXHAUSTED":
        return ProviderError(
            ProviderErrorKind.RATE_LIMITED, status_code=code, retry_after_seconds=_retry_after_seconds(exc)
        )
    if code == 404 or status == "NOT_FOUND":
        return ProviderError(ProviderErrorKind.CONFIGURATION, status_code=code)
    if code in (408, 504) or status == "DEADLINE_EXCEEDED":
        return ProviderError(ProviderErrorKind.TIMEOUT, status_code=code)
    if code >= 500:
        return ProviderError(
            ProviderErrorKind.UNAVAILABLE, status_code=code, retry_after_seconds=_retry_after_seconds(exc)
        )
    logger.error("Gemini API error details: %s", str(exc))
    return ProviderError(ProviderErrorKind.BAD_REQUEST, status_code=code)


class GeminiProvider:
    name = "gemini"

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        fallback_models: Sequence[str] | None = None,
        client: Any | None = None,
    ) -> None:
        self.model = model
        raw_fallbacks = fallback_models if fallback_models is not None else DEFAULT_FALLBACK_MODELS
        self.fallback_models: tuple[str, ...] = tuple(
            m for m in raw_fallbacks if m and m != model
        )
        self._api_key = api_key
        self._custom_client = client is not None
        self._client = client or self._build_client()

    def _build_client(self) -> Any:
        return genai.Client(
            api_key=self._api_key,
            http_options=types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1)),
        )

    async def _call_model(
        self,
        *,
        model: str,
        user_content: str,
        config: types.GenerateContentConfig,
        timeout_seconds: float,
    ) -> Any:
        try:
            return await asyncio.wait_for(
                self._client.aio.models.generate_content(
                    model=model, contents=user_content, config=config
                ),
                timeout=timeout_seconds,
            )
        except RuntimeError as exc:
            if "Event loop is closed" in str(exc) and not self._custom_client:
                self._client = self._build_client()
                return await asyncio.wait_for(
                    self._client.aio.models.generate_content(
                        model=model, contents=user_content, config=config
                    ),
                    timeout=timeout_seconds,
                )
            raise

    @staticmethod
    def _validate_response_completeness(
        response: Any,
        *,
        model: str,
        max_output_tokens: int,
        elapsed_ms: int,
    ) -> str:
        """Verify candidate finish_reason and non-empty text before accepting output."""
        candidates = getattr(response, "candidates", None)
        if isinstance(candidates, list) and len(candidates) == 0:
            logger.warning(
                "Provider returned empty candidates list",
                extra={
                    "event": "provider_empty_candidates",
                    "provider": "gemini",
                    "model": model,
                    "elapsed_ms": elapsed_ms,
                },
            )
            raise ProviderError(ProviderErrorKind.INVALID_OUTPUT)

        if isinstance(candidates, (list, tuple)) and len(candidates) > 0:
            first_cand = candidates[0]
            finish_reason = getattr(first_cand, "finish_reason", None)
            if finish_reason is not None:
                reason_str = getattr(finish_reason, "name", str(finish_reason)).upper().strip()
                if reason_str not in ("STOP", "FINISHREASON.STOP", "1", "NONE", ""):
                    is_truncated = "MAX_TOKENS" in reason_str
                    logger.warning(
                        "Provider generation stopped with non-STOP finish reason",
                        extra={
                            "event": (
                                "provider_output_truncated"
                                if is_truncated
                                else "provider_incomplete_finish_reason"
                            ),
                            "provider": "gemini",
                            "model": model,
                            "finish_reason": reason_str,
                            "max_output_tokens": max_output_tokens,
                            "elapsed_ms": elapsed_ms,
                        },
                    )
                    raise ProviderError(ProviderErrorKind.INVALID_OUTPUT)

        try:
            text = response.text
        except Exception:
            text = None
        if not text or not text.strip():
            logger.warning(
                "Provider returned empty or blocked text output",
                extra={
                    "event": "provider_empty_output",
                    "provider": "gemini",
                    "model": model,
                    "elapsed_ms": elapsed_ms,
                },
            )
            raise ProviderError(ProviderErrorKind.INVALID_OUTPUT)

        return text

    async def generate_structured(
        self,
        *,
        system_instruction: str,
        user_content: str,
        response_schema: dict[str, Any],
        max_output_tokens: int,
        temperature: float,
        timeout_seconds: float,
    ) -> ProviderResult:
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_json_schema=response_schema,
            max_output_tokens=max_output_tokens,
            temperature=temperature,
            http_options=types.HttpOptions(
                timeout=int(timeout_seconds * 1000),
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )
        start_time = time.perf_counter()
        active_model = self.model

        try:
            try:
                response = await self._call_model(
                    model=active_model,
                    user_content=user_content,
                    config=config,
                    timeout_seconds=timeout_seconds,
                )
            except genai_errors.APIError as first_exc:
                code = int(getattr(first_exc, "code", 0) or 0)
                status = str(getattr(first_exc, "status", "") or "").upper()
                is_not_found = code == 404 or status == "NOT_FOUND"
                is_unavailable = code == 503 or status == "UNAVAILABLE"

                # Only fall back on 404 NOT_FOUND (model unavailable in region/account)
                # or 503 UNAVAILABLE (transient model overload), and bound 503 fallback
                # to at most 1 backup model so timeout budgets do not multiply.
                candidate_fallbacks = (
                    self.fallback_models
                    if is_not_found
                    else (self.fallback_models[:1] if is_unavailable else ())
                )
                if candidate_fallbacks:
                    last_exc: genai_errors.APIError = first_exc
                    response = None
                    for fallback_model in candidate_fallbacks:
                        logger.warning(
                            "Primary Gemini model failed; attempting fallback model",
                            extra={
                                "event": "provider_model_fallback",
                                "provider": self.name,
                                "primary_model": self.model,
                                "fallback_model": fallback_model,
                                "reason_code": code or status,
                            },
                        )
                        try:
                            response = await self._call_model(
                                model=fallback_model,
                                user_content=user_content,
                                config=config,
                                timeout_seconds=timeout_seconds,
                            )
                            active_model = fallback_model
                            break
                        except genai_errors.APIError as fb_exc:
                            last_exc = fb_exc
                    if response is None:
                        raise last_exc
                else:
                    raise
        except genai_errors.APIError as exc:
            raise _classify_api_error(exc) from None
        except (asyncio.TimeoutError, httpx.TimeoutException):
            raise ProviderError(ProviderErrorKind.TIMEOUT) from None
        except httpx.TransportError:
            raise ProviderError(ProviderErrorKind.UNAVAILABLE) from None

        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        text = self._validate_response_completeness(
            response,
            model=active_model,
            max_output_tokens=max_output_tokens,
            elapsed_ms=elapsed_ms,
        )

        usage = None
        meta = getattr(response, "usage_metadata", None)
        if meta is not None:
            usage = ProviderUsage(
                input_tokens=getattr(meta, "prompt_token_count", None),
                output_tokens=getattr(meta, "candidates_token_count", None),
                total_tokens=getattr(meta, "total_token_count", None),
            )
        return ProviderResult(text=text, usage=usage, model=active_model)
