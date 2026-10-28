"""Unit and regression tests for Step 7 & Step 3 Question Generation API, Service, and Provider Reliability."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.genai import errors as genai_errors

from app.core.config import Settings
from app.main import create_app
from app.providers.base import ProviderError, ProviderErrorKind, ProviderResult, ProviderUsage
from app.providers.gemini import GeminiProvider
from app.schemas.ai import GenerateQuestionsResult, GeneratedQuestionItem

VALID_TOKEN = "valid_secret_token_" + "x" * 32
AUTH_HEADER = {"Authorization": f"Bearer {VALID_TOKEN}"}


def _make_question_dict(idx: int) -> dict[str, Any]:
    return {
        "questionText": (
            f"Q{idx}: What is the primary role of protocol mechanism #{idx} in the OSI transport layer?\n"
            "A) Packet routing\nB) Process-to-process delivery\nC) Bit framing\nD) Encryption"
        ),
        "suggestedAnswer": "B",
        "explanation": f"Mechanism #{idx} ensures reliable end-to-end delivery.",
        "difficulty": "MEDIUM",
        "bloomsLevel": "understand",
        "subjectTags": ["networking", "transport-layer"],
    }


class MockGenerationProvider:
    def __init__(
        self,
        name: str = "gemini",
        model: str = "gemini-3.6-flash",
        questions: list[dict[str, Any]] | None = None,
        raw_text: str | None = None,
        side_effect: Exception | list[Exception | ProviderResult] | None = None,
    ) -> None:
        self.name = name
        self.model = model
        self.call_count = 0
        self.recorded_calls: list[dict[str, Any]] = []
        self.side_effect = side_effect
        if raw_text is not None:
            self.result_text = raw_text
        elif questions is None:
            self.result_text = json.dumps({
                "questions": [
                    {
                        "questionText": "What is the primary function of the transport layer in the OSI model?\nA) Packet routing\nB) Process-to-process communication\nC) Physical bit transmission\nD) Data encryption",
                        "suggestedAnswer": "B",
                        "explanation": "The transport layer provides end-to-end process-to-process communication.",
                        "difficulty": "EASY",
                        "bloomsLevel": "remember",
                        "subjectTags": ["networking", "osi-model", "transport-layer"],
                    },
                    {
                        "questionText": "Explain how TCP handles flow control using the sliding window mechanism.",
                        "suggestedAnswer": "TCP uses a receiver-advertised window (rwnd) to prevent sender from overflowing the receiver's buffer.",
                        "explanation": "Evaluates understanding of dynamic window sizing and ACK acknowledgment numbers.",
                        "difficulty": "MEDIUM",
                        "bloomsLevel": "understand",
                        "subjectTags": ["networking", "tcp", "flow-control"],
                    },
                ],
                "totalRequested": 2,
                "totalGenerated": 2,
            })
        else:
            self.result_text = json.dumps({
                "questions": questions,
                "totalRequested": len(questions),
                "totalGenerated": len(questions),
            })
        self.usage = ProviderUsage(input_tokens=120, output_tokens=340, total_tokens=460)

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
        self.recorded_calls.append({
            "max_output_tokens": max_output_tokens,
            "temperature": temperature,
            "timeout_seconds": timeout_seconds,
        })
        if isinstance(self.side_effect, list):
            idx = min(self.call_count - 1, len(self.side_effect) - 1)
            effect = self.side_effect[idx]
            if isinstance(effect, Exception):
                raise effect
            return effect
        if isinstance(self.side_effect, Exception):
            raise self.side_effect
        return ProviderResult(text=self.result_text, usage=self.usage, model=self.model)


def test_successful_generate_questions() -> None:
    """Scenario 1 & 7 & 9: Primary-model success returns validated structured questions and passes configured max_output_tokens."""
    settings = Settings(_env_file=None, internal_service_token=VALID_TOKEN)
    mock_provider = MockGenerationProvider()
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "generate_questions",
        "subjectName": "Computer Networks",
        "subjectCode": "CS401",
        "topicName": "Transport Layer Protocols",
        "questionType": "MULTIPLE_CHOICE",
        "difficulty": "MEDIUM",
        "count": 2,
        "language": "en",
        "contextHint": "Focus on TCP vs UDP differences",
    }

    response = client.post("/api/v1/ai/generate-questions", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["contractVersion"] == "v1"
    assert data["operation"] == "generate_questions"
    assert data["provider"]["name"] == "gemini"
    assert data["provider"]["model"] == "gemini-3.6-flash"
    assert "requestId" in data
    assert data["durationMs"] >= 0

    result = data["result"]
    assert result["totalRequested"] == 2
    assert result["totalGenerated"] == 2
    assert len(result["questions"]) == 2
    assert result["questions"][0]["difficulty"] == "EASY"
    assert result["questions"][0]["bloomsLevel"] == "remember"
    assert "OSI model" in result["questions"][0]["questionText"]

    # Scenario 9: Verify sufficient max_output_tokens (8192) and timeout_seconds (25.0) were passed to provider
    assert mock_provider.call_count == 1
    assert mock_provider.recorded_calls[0]["max_output_tokens"] == 8192
    assert mock_provider.recorded_calls[0]["timeout_seconds"] == 25.0


def test_transient_failure_followed_by_retry_success() -> None:
    """Scenario 2: Transient provider failure followed by successful retry returns valid generated questions."""
    settings = Settings(
        _env_file=None,
        internal_service_token=VALID_TOKEN,
        ai_max_retries=1,
        ai_retry_base_delay_seconds=0.01,
        ai_retry_max_delay_seconds=0.05,
    )
    valid_result = ProviderResult(
        text=json.dumps({
            "questions": [_make_question_dict(1), _make_question_dict(2)],
            "totalRequested": 2,
            "totalGenerated": 2,
        }),
        usage=ProviderUsage(input_tokens=100, output_tokens=250, total_tokens=350),
        model="gemini-3.6-flash",
    )
    mock_provider = MockGenerationProvider(
        side_effect=[
            ProviderError(ProviderErrorKind.UNAVAILABLE, status_code=503),
            valid_result,
        ]
    )
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "generate_questions",
        "subjectName": "Computer Networks",
        "subjectCode": "CS401",
        "questionType": "MULTIPLE_CHOICE",
        "count": 2,
    }
    response = client.post("/api/v1/ai/generate-questions", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 200
    assert mock_provider.call_count == 2
    assert len(response.json()["result"]["questions"]) == 2


def test_primary_model_failure_falls_back_to_valid_model() -> None:
    """Scenario 3: Primary-model 404/503 failure followed by valid fallback model succeeds within budget."""
    valid_json = json.dumps({
        "questions": [_make_question_dict(1)],
        "totalRequested": 1,
        "totalGenerated": 1,
    })
    called_models: list[str] = []

    class FakeAioModels:
        async def generate_content(self, *, model: str, contents: str, config: Any) -> Any:
            called_models.append(model)
            if model == "gemini-invalid-preview":
                raise genai_errors.ClientError(404, {"error": {"message": "Model not found", "status": "NOT_FOUND"}})
            return SimpleNamespace(
                text=valid_json,
                candidates=[SimpleNamespace(finish_reason="STOP")],
                usage_metadata=SimpleNamespace(
                    prompt_token_count=50, candidates_token_count=120, total_token_count=170
                ),
            )

    fake_client = SimpleNamespace(aio=SimpleNamespace(models=FakeAioModels()))
    provider = GeminiProvider(
        api_key="fake_key_never_logged",
        model="gemini-invalid-preview",
        fallback_models=("gemini-3.6-flash", "gemini-2.5-flash"),
        client=fake_client,
    )
    settings = Settings(_env_file=None, internal_service_token=VALID_TOKEN)
    app = create_app(settings=settings, provider=provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "generate_questions",
        "subjectName": "Computer Networks",
        "subjectCode": "CS401",
        "questionType": "MULTIPLE_CHOICE",
        "count": 1,
    }
    response = client.post("/api/v1/ai/generate-questions", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 200
    body = response.json()
    assert called_models == ["gemini-invalid-preview", "gemini-3.6-flash"]
    assert body["provider"]["model"] == "gemini-3.6-flash"
    # Primary model attribute on provider was not permanently mutated
    assert provider.model == "gemini-invalid-preview"


def test_permanent_model_or_auth_error_does_not_retry() -> None:
    """Scenario 4: Permanent model/configuration/auth error fails immediately without pointless retries."""
    settings = Settings(
        _env_file=None,
        internal_service_token=VALID_TOKEN,
        ai_max_retries=3,
        ai_retry_base_delay_seconds=0.01,
    )
    for kind, expected_status, expected_code in [
        (ProviderErrorKind.CONFIGURATION, 503, "PROVIDER_CONFIGURATION_ERROR"),
        (ProviderErrorKind.AUTH, 502, "PROVIDER_AUTH_FAILED"),
        (ProviderErrorKind.BAD_REQUEST, 502, "PROVIDER_REJECTED_REQUEST"),
    ]:
        mock_provider = MockGenerationProvider(side_effect=ProviderError(kind, status_code=400))
        app = create_app(settings=settings, provider=mock_provider)
        client = TestClient(app)

        payload = {
            "contractVersion": "v1",
            "operation": "generate_questions",
            "subjectName": "Math",
            "subjectCode": "MATH101",
            "questionType": "SHORT_ANSWER",
            "count": 1,
        }
        response = client.post("/api/v1/ai/generate-questions", json=payload, headers=AUTH_HEADER)
        assert response.status_code == expected_status
        assert response.json()["error"]["code"] == expected_code
        assert response.json()["error"]["retryable"] is False
        assert mock_provider.call_count == 1


def test_retry_exhaustion_returns_structured_error() -> None:
    """Scenario 5: Retry exhaustion returns a safe, structured error response after (1 + ai_max_retries) attempts."""
    settings = Settings(
        _env_file=None,
        internal_service_token=VALID_TOKEN,
        ai_max_retries=2,
        ai_retry_base_delay_seconds=0.01,
        ai_retry_max_delay_seconds=0.02,
    )
    mock_provider = MockGenerationProvider(
        side_effect=ProviderError(ProviderErrorKind.UNAVAILABLE, status_code=503)
    )
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "generate_questions",
        "subjectName": "Operating Systems",
        "subjectCode": "CS302",
        "questionType": "SHORT_ANSWER",
        "count": 2,
    }
    response = client.post("/api/v1/ai/generate-questions", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "PROVIDER_UNAVAILABLE"
    assert body["error"]["retryable"] is True
    assert mock_provider.call_count == 3


def test_provider_timeout_respects_configured_timeout() -> None:
    """Scenario 6: Provider timeout is enforced via asyncio.wait_for and returns 504 PROVIDER_TIMEOUT."""
    class SlowAioModels:
        async def generate_content(self, *, model: str, contents: str, config: Any) -> Any:
            await asyncio.sleep(0.5)
            return SimpleNamespace(text="{}")

    fake_client = SimpleNamespace(aio=SimpleNamespace(models=SlowAioModels()))
    provider = GeminiProvider(
        api_key="fake_key_never_logged",
        model="gemini-3.6-flash",
        client=fake_client,
    )
    settings = Settings(
        _env_file=None,
        internal_service_token=VALID_TOKEN,
        ai_request_timeout_seconds=1.0,
        ai_max_retries=0,
    )
    # Test direct provider timeout enforcement with a tight 0.05s timeout
    with pytest.raises(ProviderError) as exc_info:
        asyncio.run(
            provider.generate_structured(
                system_instruction="sys",
                user_content="user",
                response_schema={},
                max_output_tokens=1024,
                temperature=0.1,
                timeout_seconds=0.05,
            )
        )
    assert exc_info.value.kind == ProviderErrorKind.TIMEOUT

    # And verify route translates TIMEOUT to 504 PROVIDER_TIMEOUT
    timeout_provider = MockGenerationProvider(side_effect=ProviderError(ProviderErrorKind.TIMEOUT))
    app = create_app(settings=settings, provider=timeout_provider)
    client = TestClient(app)
    response = client.post(
        "/api/v1/ai/generate-questions",
        json={
            "contractVersion": "v1",
            "operation": "generate_questions",
            "subjectName": "OS",
            "subjectCode": "CS302",
            "questionType": "SHORT_ANSWER",
            "count": 1,
        },
        headers=AUTH_HEADER,
    )
    assert response.status_code == 504
    assert response.json()["error"]["code"] == "PROVIDER_TIMEOUT"


def test_truncated_json_and_max_tokens_finish_reason_rejected() -> None:
    """Scenario 8: Truncated JSON, MAX_TOKENS finish reason, or malformed structured output is rejected as 502 PROVIDER_INVALID_OUTPUT."""
    # 8a: MAX_TOKENS finish_reason in GeminiProvider even if partial text exists
    class TruncatedAioModels:
        async def generate_content(self, *, model: str, contents: str, config: Any) -> Any:
            return SimpleNamespace(
                text=json.dumps({
                    "questions": [_make_question_dict(1)],
                    "totalRequested": 1,
                    "totalGenerated": 1,
                }),
                candidates=[SimpleNamespace(finish_reason=SimpleNamespace(name="MAX_TOKENS"))],
                usage_metadata=None,
            )

    fake_client = SimpleNamespace(aio=SimpleNamespace(models=TruncatedAioModels()))
    provider = GeminiProvider(
        api_key="fake_key_never_logged",
        model="gemini-3.6-flash",
        client=fake_client,
    )
    settings = Settings(_env_file=None, internal_service_token=VALID_TOKEN)
    app = create_app(settings=settings, provider=provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "generate_questions",
        "subjectName": "Networks",
        "subjectCode": "CS401",
        "questionType": "MULTIPLE_CHOICE",
        "count": 1,
    }
    res_max_tokens = client.post("/api/v1/ai/generate-questions", json=payload, headers=AUTH_HEADER)
    assert res_max_tokens.status_code == 502
    assert res_max_tokens.json()["error"]["code"] == "PROVIDER_INVALID_OUTPUT"

    # 8b: Truncated mid-JSON string
    truncated_provider = MockGenerationProvider(
        raw_text='{"questions": [{"questionText": "What is TCP?", "suggestedAnswer": "Transmission'
    )
    app_trunc = create_app(settings=settings, provider=truncated_provider)
    client_trunc = TestClient(app_trunc)
    res_trunc = client_trunc.post("/api/v1/ai/generate-questions", json=payload, headers=AUTH_HEADER)
    assert res_trunc.status_code == 502
    assert res_trunc.json()["error"]["code"] == "PROVIDER_INVALID_OUTPUT"


def test_max_batch_size_20_questions_and_partial_batch_rejection() -> None:
    """Scenario 10 & 11: Batch size of 20 succeeds when complete; partial batches or missing required fields are rejected."""
    settings = Settings(_env_file=None, internal_service_token=VALID_TOKEN)

    # 10: Full 20-question batch succeeds
    twenty_questions = [_make_question_dict(i) for i in range(1, 21)]
    full_batch_provider = MockGenerationProvider(questions=twenty_questions)
    app_full = create_app(settings=settings, provider=full_batch_provider)
    client_full = TestClient(app_full)

    res_full = client_full.post(
        "/api/v1/ai/generate-questions",
        json={
            "contractVersion": "v1",
            "operation": "generate_questions",
            "subjectName": "Computer Networks",
            "subjectCode": "CS401",
            "questionType": "MULTIPLE_CHOICE",
            "count": 20,
        },
        headers=AUTH_HEADER,
    )
    assert res_full.status_code == 200
    assert len(res_full.json()["result"]["questions"]) == 20

    # 11a: Partial batch (requested 5, provider returned only 3) -> rejected with 502 PROVIDER_INVALID_OUTPUT
    partial_provider = MockGenerationProvider(questions=[_make_question_dict(1), _make_question_dict(2), _make_question_dict(3)])
    app_partial = create_app(settings=settings, provider=partial_provider)
    client_partial = TestClient(app_partial)

    res_partial = client_partial.post(
        "/api/v1/ai/generate-questions",
        json={
            "contractVersion": "v1",
            "operation": "generate_questions",
            "subjectName": "Computer Networks",
            "subjectCode": "CS401",
            "questionType": "MULTIPLE_CHOICE",
            "count": 5,
        },
        headers=AUTH_HEADER,
    )
    assert res_partial.status_code == 502
    assert res_partial.json()["error"]["code"] == "PROVIDER_INVALID_OUTPUT"

    # 11b: Question missing required valid questionText (whitespace only) -> rejected with 502 PROVIDER_INVALID_OUTPUT
    malformed_q_provider = MockGenerationProvider(
        questions=[{"questionText": "     ", "suggestedAnswer": "A"}]
    )
    app_malformed = create_app(settings=settings, provider=malformed_q_provider)
    client_malformed = TestClient(app_malformed)

    res_malformed = client_malformed.post(
        "/api/v1/ai/generate-questions",
        json={
            "contractVersion": "v1",
            "operation": "generate_questions",
            "subjectName": "Computer Networks",
            "subjectCode": "CS401",
            "questionType": "MULTIPLE_CHOICE",
            "count": 1,
        },
        headers=AUTH_HEADER,
    )
    assert res_malformed.status_code == 502
    assert res_malformed.json()["error"]["code"] == "PROVIDER_INVALID_OUTPUT"


def test_secrets_never_included_in_error_messages_or_logs(caplog: pytest.LogCaptureFixture) -> None:
    """Scenario 12: Secrets (API key and internal service token) are never included in error messages or logs."""
    secret_api_key = "AIzaSy_SUPER_SECRET_GEMINI_KEY_DO_NOT_LEAK_999"
    secret_service_token = "internal_service_secret_token_do_not_leak_888888"

    class FailingAioModels:
        async def generate_content(self, *, model: str, contents: str, config: Any) -> Any:
            raise genai_errors.ClientError(
                400,
                {"error": {"message": f"API key not valid: {secret_api_key}", "status": "INVALID_ARGUMENT"}},
            )

    fake_client = SimpleNamespace(aio=SimpleNamespace(models=FailingAioModels()))
    provider = GeminiProvider(
        api_key=secret_api_key,
        model="gemini-3.6-flash",
        client=fake_client,
    )
    settings = Settings(
        _env_file=None,
        internal_service_token=secret_service_token,
        gemini_api_key=secret_api_key,
        ai_max_retries=0,
    )
    app = create_app(settings=settings, provider=provider)
    client = TestClient(app)

    response = client.post(
        "/api/v1/ai/generate-questions",
        json={
            "contractVersion": "v1",
            "operation": "generate_questions",
            "subjectName": "Security",
            "subjectCode": "CS501",
            "questionType": "SHORT_ANSWER",
            "count": 1,
        },
        headers={"Authorization": f"Bearer {secret_service_token}"},
    )
    assert response.status_code == 502
    assert secret_api_key not in response.text
    assert secret_service_token not in response.text
    for record in caplog.records:
        assert secret_api_key not in record.getMessage()
        assert secret_service_token not in record.getMessage()


def test_generate_questions_unauthenticated() -> None:
    settings = Settings(_env_file=None, internal_service_token=VALID_TOKEN)
    app = create_app(settings=settings, provider=MockGenerationProvider())
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "generate_questions",
        "subjectName": "Computer Networks",
        "subjectCode": "CS401",
        "questionType": "SHORT_ANSWER",
        "count": 1,
    }

    response = client.post("/api/v1/ai/generate-questions", json=payload)
    assert response.status_code == 401


def test_generate_questions_invalid_payload() -> None:
    settings = Settings(_env_file=None, internal_service_token=VALID_TOKEN)
    app = create_app(settings=settings, provider=MockGenerationProvider())
    client = TestClient(app)

    # Count out of bounds (> 20)
    payload = {
        "contractVersion": "v1",
        "operation": "generate_questions",
        "subjectName": "Math",
        "subjectCode": "MATH101",
        "questionType": "SHORT_ANSWER",
        "count": 50,
    }
    response = client.post("/api/v1/ai/generate-questions", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 422


def test_generate_questions_provider_error() -> None:
    settings = Settings(_env_file=None, internal_service_token=VALID_TOKEN)
    mock_provider = MockGenerationProvider(
        side_effect=ProviderError(ProviderErrorKind.AUTH, status_code=401)
    )
    app = create_app(settings=settings, provider=mock_provider)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "generate_questions",
        "subjectName": "Math",
        "subjectCode": "MATH101",
        "questionType": "SHORT_ANSWER",
        "count": 2,
    }
    response = client.post("/api/v1/ai/generate-questions", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 502
    err = response.json()
    assert err["error"]["code"] == "PROVIDER_AUTH_FAILED"
