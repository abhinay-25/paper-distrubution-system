"""Optional real-provider smoke test.

Requires a real GEMINI_API_KEY to be set in environment.
Automatically skipped during normal CI / unit test runs so no paid credits
or rate limits are consumed without explicit user intent.

To run:
    GEMINI_API_KEY="your-key" pytest -k "test_real_gemini"
"""

import asyncio
import os
import pytest
from app.core.config import Settings
from app.providers.gemini import GeminiProvider
from app.schemas.ai import TextOverviewResult

_settings_key = None
try:
    _loaded = Settings()
    if _loaded.gemini_api_key:
        _settings_key = _loaded.gemini_api_key.get_secret_value()
except Exception:
    _settings_key = None

API_KEY = os.environ.get("GEMINI_API_KEY") or (
    _settings_key if os.environ.get("RUN_REAL_GEMINI_TESTS") == "1" else None
)


@pytest.mark.skipif(not API_KEY, reason="GEMINI_API_KEY environment variable not set; skipping live provider call.")
def test_real_gemini_smoke_test() -> None:
    async def _run() -> None:
        settings = Settings(
            internal_service_token="test_token_" + "x" * 32,
            gemini_api_key=API_KEY,
        )
        provider = GeminiProvider(api_key=API_KEY, model=settings.gemini_model)

        user_text = (
            "Operating systems provide process management, memory virtualisation, and file systems. "
            "The kernel serves as the central control program managing hardware resources."
        )

        result = await provider.generate_structured(
            system_instruction="Analyze this text and output a JSON summary adhering to the schema.",
            user_content=user_text,
            response_schema=TextOverviewResult.model_json_schema(),
            max_output_tokens=500,
            temperature=0.1,
            timeout_seconds=30.0,
        )

        assert result.text is not None
        parsed = TextOverviewResult.model_validate_json(result.text)
        assert len(parsed.summary) > 5
        assert parsed.language == "en"
        assert len(parsed.key_terms) >= 1

    asyncio.run(_run())
