"""Tests for service configuration and secret handling."""

import os
from unittest.mock import patch

import pytest
from pydantic import SecretStr

from app.core.config import ConfigurationError, Settings, load_settings

VALID_TOKEN = "a" * 32


def test_valid_settings_defaults() -> None:
    settings = load_settings(_env_file=None, internal_service_token=VALID_TOKEN)
    assert settings.app_env == "development"
    assert settings.port == 8000
    assert settings.internal_service_token.get_secret_value() == VALID_TOKEN
    assert settings.ai_provider == "gemini"
    assert settings.gemini_model == "gemini-3.6-flash"
    assert settings.gemini_fallback_models == ("gemini-3.5-flash", "gemini-2.5-flash")
    assert settings.ai_request_timeout_seconds == 25.0
    assert settings.ai_max_retries == 1
    assert settings.ai_retry_max_delay_seconds == 4.0
    assert settings.ai_max_output_tokens == 8192
    assert settings.provider_configured is False


def test_token_too_short_raises_configuration_error() -> None:
    with pytest.raises(ConfigurationError) as exc_info:
        load_settings(internal_service_token="short_token")
    err_msg = str(exc_info.value)
    assert "INTERNAL_SERVICE_TOKEN" in err_msg
    # Ensure raw token value is not exposed in error message
    assert "short_token" not in err_msg


def test_secret_repr_does_not_leak() -> None:
    secret_val = "super_secret_value_12345678901234567890"
    settings = load_settings(
        internal_service_token=secret_val,
        gemini_api_key=secret_val,
    )
    settings_repr = repr(settings)
    assert secret_val not in settings_repr
    assert "**********" in settings_repr


def test_production_mode_requires_gemini_api_key() -> None:
    with pytest.raises(ConfigurationError) as exc_info:
        load_settings(
            app_env="production",
            internal_service_token=VALID_TOKEN,
            gemini_api_key=None,
        )
    assert "GEMINI_API_KEY" in str(exc_info.value)


def test_production_mode_with_key_succeeds() -> None:
    settings = load_settings(
        app_env="production",
        internal_service_token=VALID_TOKEN,
        gemini_api_key="valid_production_api_key",
    )
    assert settings.is_production is True
    assert settings.provider_configured is True
