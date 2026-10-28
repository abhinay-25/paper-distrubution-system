"""Ollama local LLM provider adapter."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from app.core.logging import get_logger
from app.providers.base import ProviderError, ProviderErrorKind, ProviderResult, ProviderUsage

logger = get_logger()


class OllamaProvider:
    name = "ollama"

    def __init__(
        self,
        *,
        base_url: str = "http://127.0.0.1:11434",
        model: str = "qwen2.5:7b",
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._custom_client = client is not None
        self._client = client or httpx.AsyncClient(base_url=self.base_url)

    async def close(self) -> None:
        if not self._custom_client and self._client is not None:
            await self._client.aclose()

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
        start_time = time.perf_counter()
        endpoint = f"{self.base_url}/api/chat"

        augmented_system = (
            f"{system_instruction}\n\n"
            f"You MUST output valid, parseable JSON conforming strictly to this JSON schema:\n"
            f"{response_schema}"
        )

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": augmented_system},
                {"role": "user", "content": user_content},
            ],
            "format": "json",
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_output_tokens,
            },
        }

        try:
            response = await self._client.post(
                endpoint,
                json=payload,
                timeout=timeout_seconds,
            )
        except (httpx.TimeoutException, asyncio.TimeoutError):
            logger.warning(
                "Ollama provider call timed out",
                extra={"event": "provider_timeout", "provider": self.name, "model": self.model},
            )
            raise ProviderError(ProviderErrorKind.TIMEOUT) from None
        except httpx.ConnectError:
            logger.error(
                "Ollama service unavailable / connection refused",
                extra={"event": "provider_unavailable", "provider": self.name, "base_url": self.base_url},
            )
            raise ProviderError(ProviderErrorKind.UNAVAILABLE) from None
        except Exception as exc:
            logger.error(
                "Ollama request error",
                extra={"event": "provider_error", "error": str(exc)},
            )
            raise ProviderError(ProviderErrorKind.UNAVAILABLE) from exc

        if response.status_code == 404:
            raise ProviderError(ProviderErrorKind.CONFIGURATION, status_code=404)
        if response.status_code >= 500:
            raise ProviderError(ProviderErrorKind.UNAVAILABLE, status_code=response.status_code)
        if response.status_code != 200:
            raise ProviderError(ProviderErrorKind.BAD_REQUEST, status_code=response.status_code)

        try:
            data = response.json()
        except Exception:
            raise ProviderError(ProviderErrorKind.INVALID_OUTPUT) from None

        raw_text = data.get("message", {}).get("content", "").strip()
        if not raw_text:
            raise ProviderError(ProviderErrorKind.INVALID_OUTPUT)

        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        prompt_eval = data.get("prompt_eval_count")
        eval_count = data.get("eval_count")
        usage = ProviderUsage(
            input_tokens=prompt_eval,
            output_tokens=eval_count,
            total_tokens=(prompt_eval or 0) + (eval_count or 0),
        )

        return ProviderResult(text=raw_text, usage=usage, model=self.model)

