"""Environment-based configuration for the AI service.

Settings are loaded from process environment variables (and a local, Git-ignored
``.env`` file during development) and validated once at startup.

Security notes:
- Secrets use ``SecretStr`` so they are never rendered by ``repr``/logging.
- ``load_settings`` converts validation failures into a ``ConfigurationError``
  whose message lists only field names and reasons, never the offending values
  (Pydantic's default error text would echo the rejected input, which may be a
  secret).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_INTERNAL_TOKEN_LENGTH = 32


class ConfigurationError(RuntimeError):
    """Raised when the service configuration is missing or invalid."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Service -----------------------------------------------------------
    app_env: Literal["development", "test", "production"] = "development"
    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # --- Internal service authentication (Node.js backend -> AI service) ----
    # Required. No default: a universal development secret is never shipped.
    internal_service_token: SecretStr

    # --- Generative AI provider -------------------------------------------
    ai_provider: Literal["gemini"] = "gemini"
    gemini_api_key: SecretStr | None = None
    gemini_model: str = Field(default="gemini-3.6-flash", min_length=1, max_length=100)
    gemini_fallback_models: tuple[str, ...] = Field(
        default=("gemini-3.5-flash", "gemini-2.5-flash"),
    )

    # --- Limits and failure handling (server policy; never caller-controlled)
    # Timeout budget: max 2 attempts (1 initial + 1 retry) * 25s + <=4s backoff + ~3s overhead = ~57s,
    # safely below the Node.js backend AI_GENERATION_TIMEOUT_MS (70000ms).
    ai_request_timeout_seconds: float = Field(default=25.0, ge=1.0, le=120.0)
    ai_max_retries: int = Field(default=1, ge=0, le=5)
    ai_retry_base_delay_seconds: float = Field(default=0.5, ge=0.0, le=10.0)
    ai_retry_max_delay_seconds: float = Field(default=4.0, ge=0.0, le=60.0)
    ai_max_output_tokens: int = Field(default=8192, ge=64, le=32768)
    max_request_bytes: int = Field(default=65_536, ge=1_024, le=1_048_576)
    max_input_chars: int = Field(default=8_000, ge=100, le=100_000)

    @field_validator("internal_service_token")
    @classmethod
    def _token_strength(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value().strip()) < MIN_INTERNAL_TOKEN_LENGTH:
            raise ValueError(
                f"must be at least {MIN_INTERNAL_TOKEN_LENGTH} characters "
                "(generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\")"
            )
        return value

    @field_validator("gemini_api_key", mode="before")
    @classmethod
    def _blank_key_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def _production_requirements(self) -> "Settings":
        if self.app_env == "production" and self.ai_provider == "gemini" and self.gemini_api_key is None:
            raise ValueError("GEMINI_API_KEY is required when APP_ENV=production and AI_PROVIDER=gemini")
        if self.ai_retry_max_delay_seconds < self.ai_retry_base_delay_seconds:
            raise ValueError("AI_RETRY_MAX_DELAY_SECONDS must be >= AI_RETRY_BASE_DELAY_SECONDS")
        return self

    @property
    def provider_configured(self) -> bool:
        if self.ai_provider == "gemini":
            return self.gemini_api_key is not None
        return False

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


def _format_validation_error(exc: ValidationError) -> str:
    lines = []
    for err in exc.errors(include_input=False, include_url=False):
        field = ".".join(str(p) for p in err.get("loc", ())) or "settings"
        lines.append(f"  - {field.upper()}: {err.get('msg', 'invalid value')}")
    return "Invalid AI service configuration:\n" + "\n".join(lines)


def load_settings(**overrides: object) -> Settings:
    """Load and validate settings, raising a secret-safe ``ConfigurationError``."""
    try:
        return Settings(**overrides)  # type: ignore[arg-type]
    except ValidationError as exc:
        raise ConfigurationError(_format_validation_error(exc)) from None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()
