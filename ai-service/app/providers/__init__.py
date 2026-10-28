"""Generative AI provider adapters."""

from __future__ import annotations

from app.core.config import Settings
from app.providers.base import GenerativeProvider


def build_provider(settings: Settings) -> GenerativeProvider | None:
    """Return the configured provider, or ``None`` when credentials are absent.

    No network call is made here.
    """
    if settings.ai_provider == "gemini" and settings.gemini_api_key is not None:
        from app.providers.gemini import GeminiProvider

        return GeminiProvider(
            api_key=settings.gemini_api_key.get_secret_value(),
            model=settings.gemini_model,
            fallback_models=settings.gemini_fallback_models,
        )
    return None
