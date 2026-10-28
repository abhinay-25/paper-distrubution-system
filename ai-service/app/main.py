"""FastAPI entry point for the Paper Distribution System AI service."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import Depends, FastAPI, Request

from app.api.routes import ai_router, health_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging, get_logger
from app.core.security import require_internal_service
from app.middleware import RequestContextMiddleware, register_error_handlers
from app.providers import build_provider
from app.providers.base import GenerativeProvider
from app.schemas.ai import CONTRACT_VERSION, EmbedRequest, EmbedResponse
from app.services.ai_service import AIService
from app.services.embedding_service import embedding_service


def create_app(
    settings: Settings | None = None,
    provider: GenerativeProvider | None = None,
) -> FastAPI:
    """Application factory for testing and production runtime."""
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.log_level)
    logger = get_logger()

    resolved_provider = provider if provider is not None else build_provider(resolved_settings)

    @asynccontextmanager
    async def lifespan(app_instance: FastAPI) -> AsyncIterator[None]:
        logger.info(
            "Starting PDS AI service",
            extra={
                "event": "service_startup",
                "app_env": resolved_settings.app_env,
                "provider": resolved_settings.ai_provider,
                "model": resolved_settings.gemini_model,
                "provider_configured": resolved_provider is not None,
            },
        )
        # Warm up the local embedding model in a background thread so the first
        # question-analysis request does not incur cold-start latency.
        import asyncio  # noqa: PLC0415
        asyncio.get_event_loop().run_in_executor(None, embedding_service.warm_up)
        yield
        logger.info("Stopping PDS AI service", extra={"event": "service_shutdown"})

    app = FastAPI(
        title="Paper Distribution System AI Service",
        description="Internal AI processing microservice for the Paper Distribution System.",
        version="0.1.0",
        docs_url="/docs" if not resolved_settings.is_production else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    # Attach shared state
    app.state.settings = resolved_settings
    app.state.provider = resolved_provider
    app.state.ai_service = AIService(resolved_settings, resolved_provider, embedding_service)

    # Register middleware
    app.add_middleware(RequestContextMiddleware)

    # Register error handlers
    register_error_handlers(app)

    # Mount routes
    app.include_router(health_router)
    app.include_router(ai_router)

    @app.post(
        "/embed",
        response_model=EmbedResponse,
        dependencies=[Depends(require_internal_service)],
    )
    async def root_embed(
        payload: EmbedRequest,
        request: Request,
    ) -> EmbedResponse:
        texts: list[str] = []
        if payload.texts is not None and len(payload.texts) > 0:
            texts = [t for t in payload.texts if t]
        elif payload.text is not None and len(payload.text.strip()) > 0:
            texts = [payload.text.strip()]

        if not texts:
            return EmbedResponse(
                contract_version=CONTRACT_VERSION,
                embedding=[],
                embeddings=[],
                dimensions=384,
            )

        ai_service: AIService = request.app.state.ai_service
        embeddings_arr = ai_service._emb.encode(texts)
        embeddings = [row.tolist() for row in embeddings_arr]
        single = embeddings[0] if embeddings else []

        return EmbedResponse(
            contract_version=CONTRACT_VERSION,
            embedding=single,
            embeddings=embeddings,
            dimensions=len(single) if single else 384,
        )

    return app


# Default instance for ASGI servers (Uvicorn)
app = create_app()
