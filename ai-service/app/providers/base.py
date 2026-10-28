"""Provider-neutral interface for generative AI providers.

Only one provider (Gemini) exists today. This module defines the small surface the
service layer depends on, so provider SDK details stay inside ``providers/``.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Protocol


class ProviderErrorKind(str, Enum):
    AUTH = "auth"                   # invalid/missing API key, permission denied
    CONFIGURATION = "configuration" # e.g. unknown or unavailable model
    RATE_LIMITED = "rate_limited"   # 429 / quota exhausted
    TIMEOUT = "timeout"
    UNAVAILABLE = "unavailable"     # 5xx, network failure
    BAD_REQUEST = "bad_request"     # other 4xx (e.g. rejected content)
    INVALID_OUTPUT = "invalid_output"  # empty, blocked, or truncated output


class ProviderError(Exception):
    """Normalized provider failure. ``str(self)`` never includes provider bodies."""

    def __init__(
        self,
        kind: ProviderErrorKind,
        *,
        status_code: int | None = None,
        retry_after_seconds: float | None = None,
    ) -> None:
        super().__init__(f"provider error: {kind.value}")
        self.kind = kind
        self.status_code = status_code
        self.retry_after_seconds = retry_after_seconds


@dataclass(frozen=True)
class ProviderUsage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


@dataclass(frozen=True)
class ProviderResult:
    text: str
    usage: ProviderUsage | None = None
    model: str | None = None


class GenerativeProvider(Protocol):
    name: str
    model: str

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
        """Return the raw JSON text produced by the model, or raise ``ProviderError``."""
        ...
