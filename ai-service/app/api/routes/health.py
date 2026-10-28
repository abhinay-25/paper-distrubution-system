"""Health, liveness, and readiness endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    status: Literal["ok"]
    service: str
    timestamp: datetime


class ReadyResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    status: Literal["ready", "degraded"]
    service: str
    environment: str
    provider: str
    model: str
    provider_configured: bool
    timestamp: datetime


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness check — returns 200 as long as the process is running."""
    return HealthResponse(
        status="ok",
        service="pds-ai-service",
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/ready", response_model=ReadyResponse)
def ready(request: Request) -> ReadyResponse:
    """Readiness check — reports operational state and provider configuration status.

    Never makes an external provider call during readiness check to prevent
    wasting quota or incurring API charges.
    """
    settings = request.app.state.settings
    is_configured = settings.provider_configured

    return ReadyResponse(
        status="ready" if is_configured else "degraded",
        service="pds-ai-service",
        environment=settings.app_env,
        provider=settings.ai_provider,
        model=settings.gemini_model,
        provider_configured=is_configured,
        timestamp=datetime.now(timezone.utc),
    )
