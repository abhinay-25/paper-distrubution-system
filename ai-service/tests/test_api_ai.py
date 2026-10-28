"""Tests for POST /api/v1/ai/analyze-text with mocked providers."""

from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.providers.base import GenerativeProvider, ProviderError, ProviderErrorKind, ProviderResult, ProviderUsage

VALID_TOKEN = "valid_secret_token_" + "x" * 32
AUTH_HEADER = {"Authorization": f"Bearer {VALID_TOKEN}"}


class MockProvider:
    def __init__(
        self,
        name: str = "gemini",
        model: str = "gemini-3.8-flash",
        result_text: str | None = None,
        side_effect: Exception | None = None,
        usage: ProviderUsage | None = None,
    ) -> None:
        self.name = name
        self.model = model
        self.result_text = result_text or json.dumps({
            "summary": "Photosynthesis is the process by which green plants make food.",
            "language": "en",
            "keyTerms": ["photosynthesis", "chlorophyll", "plants"],
        })
        self.side_effect = side_effect
        self.usage = usage or ProviderUsage(input_tokens=15, output_tokens=30, total_tokens=45)
        self.call_count = 0

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
        self.call_count += 1
        if self.side_effect:
            raise self.side_effect
        return ProviderResult(text=self.result_text, usage=self.usage)


def test_successful_analyze_text() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    mock_provider = MockProvider()
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "Photosynthesis is a biological process in plants.",
    }
    response = client.post(
        "/api/v1/ai/analyze-text",
        json=payload,
        headers={**AUTH_HEADER, "X-Request-Id": "custom-id-123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["contractVersion"] == "v1"
    assert body["requestId"] == "custom-id-123"
    assert body["operation"] == "text_overview"
    assert "photosynthesis" in body["result"]["summary"].lower()
    assert body["result"]["language"] == "en"
    assert len(body["result"]["keyTerms"]) >= 1
    assert body["provider"]["name"] == "gemini"
    assert body["usage"]["totalTokens"] == 45
    assert isinstance(body["durationMs"], int)
    assert response.headers["x-request-id"] == "custom-id-123"


def test_rejection_of_unknown_fields_in_request() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    mock_provider = MockProvider()
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "Valid text",
        "systemInstruction": "MALICIOUS_PROMPT_INJECTION",  # Disallowed extra field!
    }
    response = client.post("/api/v1/ai/analyze-text", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    # Ensure provider was never called when validation fails
    assert mock_provider.call_count == 0


def test_rejection_of_unsupported_operation() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    mock_provider = MockProvider()
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "unsupported_operation_xyz",
        "text": "Valid text",
    }
    response = client.post("/api/v1/ai/analyze-text", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_payload_too_large_via_content_length() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN, max_request_bytes=1024)
    mock_provider = MockProvider()
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "a" * 2000,
    }
    response = client.post("/api/v1/ai/analyze-text", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_provider_not_configured_returns_503() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN, gemini_api_key=None)
    app = create_app(settings=settings, provider=None)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "Some text",
    }
    response = client.post("/api/v1/ai/analyze-text", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "PROVIDER_NOT_CONFIGURED"
    assert body["error"]["retryable"] is False


def test_provider_rate_limited_returns_429() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN, ai_max_retries=0)
    mock_provider = MockProvider(
        side_effect=ProviderError(ProviderErrorKind.RATE_LIMITED, retry_after_seconds=5.0)
    )
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "Some text",
    }
    response = client.post("/api/v1/ai/analyze-text", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 429
    body = response.json()
    assert body["error"]["code"] == "PROVIDER_RATE_LIMITED"
    assert body["error"]["retryable"] is True
    assert response.headers.get("retry-after") == "5"


def test_provider_timeout_returns_504() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN, ai_max_retries=0)
    mock_provider = MockProvider(side_effect=ProviderError(ProviderErrorKind.TIMEOUT))
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "Some text",
    }
    response = client.post("/api/v1/ai/analyze-text", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 504
    body = response.json()
    assert body["error"]["code"] == "PROVIDER_TIMEOUT"
    assert body["error"]["retryable"] is True


def test_provider_auth_failure_returns_502() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN, ai_max_retries=0)
    mock_provider = MockProvider(side_effect=ProviderError(ProviderErrorKind.AUTH, status_code=401))
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "Some text",
    }
    response = client.post("/api/v1/ai/analyze-text", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 502
    body = response.json()
    assert body["error"]["code"] == "PROVIDER_AUTH_FAILED"
    assert body["error"]["retryable"] is False


def test_provider_invalid_json_output_returns_502() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    mock_provider = MockProvider(result_text="THIS IS NOT VALID JSON")
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "Some text",
    }
    response = client.post("/api/v1/ai/analyze-text", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 502
    body = response.json()
    assert body["error"]["code"] == "PROVIDER_INVALID_OUTPUT"


def test_provider_invalid_schema_output_returns_502() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    # Missing required 'language' field
    invalid_schema = json.dumps({
        "summary": "Valid summary",
        "keyTerms": ["one", "two"],
    })
    mock_provider = MockProvider(result_text=invalid_schema)
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "Some text",
    }
    response = client.post("/api/v1/ai/analyze-text", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 502
    body = response.json()
    assert body["error"]["code"] == "PROVIDER_INVALID_OUTPUT"


def test_error_responses_contain_no_stack_traces() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    mock_provider = MockProvider(side_effect=RuntimeError("Secret internal error details"))
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app, raise_server_exceptions=False)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "Some text",
    }
    response = client.post("/api/v1/ai/analyze-text", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "INTERNAL_ERROR"
    # Never leak stack trace or internal exception text
    assert "Traceback" not in response.text
    assert "Secret internal error details" not in response.text


def test_embed_endpoint_single_text() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    app = create_app(settings=settings)
    client = TestClient(app)

    response = client.post(
        "/embed",
        json={"text": "Data structures and algorithms"},
        headers=AUTH_HEADER,
    )
    assert response.status_code == 200
    data = response.json()
    assert "embedding" in data
    assert len(data["embedding"]) == 384
    assert data["dimensions"] == 384


def test_embed_endpoint_batch_texts() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    app = create_app(settings=settings)
    client = TestClient(app)

    response = client.post(
        "/api/v1/ai/embed",
        json={"texts": ["Binary search trees", "Sorting algorithms"]},
        headers=AUTH_HEADER,
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["embeddings"]) == 2
    assert len(data["embeddings"][0]) == 384
    assert len(data["embeddings"][1]) == 384
