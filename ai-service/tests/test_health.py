"""Tests for health and readiness endpoints."""

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

VALID_TOKEN = "test_token_" + "x" * 32


def test_health_liveness() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    app = create_app(settings=settings)
    client = TestClient(app)

    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "pds-ai-service"
    assert "timestamp" in body
    assert "x-request-id" in response.headers


def test_health_echoes_provided_request_id() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    app = create_app(settings=settings)
    client = TestClient(app)

    custom_id = "test-corr-id-999"
    response = client.get("/health", headers={"X-Request-Id": custom_id})
    assert response.status_code == 200
    assert response.headers["x-request-id"] == custom_id


def test_ready_degraded_when_no_api_key() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN, gemini_api_key=None)
    app = create_app(settings=settings)
    client = TestClient(app)

    response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["providerConfigured"] is False
    assert body["provider"] == "gemini"


def test_ready_when_api_key_configured() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN, gemini_api_key="mock_key")
    app = create_app(settings=settings)
    client = TestClient(app)

    response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["providerConfigured"] is True
