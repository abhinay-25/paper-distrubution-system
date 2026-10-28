"""Tests for internal service authentication (Node.js -> AI service)."""

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

VALID_TOKEN = "valid_secret_token_" + "x" * 32
OTHER_TOKEN = "other_secret_token_" + "y" * 32


def test_missing_auth_header_rejected() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    app = create_app(settings=settings)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "Hello world",
    }
    response = client.post("/api/v1/ai/analyze-text", json=payload)
    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "UNAUTHORIZED"
    assert "x-request-id" in response.headers


def test_invalid_bearer_token_rejected() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    app = create_app(settings=settings)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "Hello world",
    }
    response = client.post(
        "/api/v1/ai/analyze-text",
        json=payload,
        headers={"Authorization": f"Bearer {OTHER_TOKEN}"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_malformed_auth_header_rejected() -> None:
    settings = Settings(internal_service_token=VALID_TOKEN)
    app = create_app(settings=settings)
    client = TestClient(app)

    payload = {
        "contractVersion": "v1",
        "operation": "text_overview",
        "text": "Hello world",
    }
    # Non-bearer schemes
    for header in ["Basic xyz", "Token xyz", "Bearer", ""]:
        res = client.post(
            "/api/v1/ai/analyze-text",
            json=payload,
            headers={"Authorization": header},
        )
        assert res.status_code == 401
