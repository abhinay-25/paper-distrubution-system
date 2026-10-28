"""Internal API route definitions."""

from app.api.routes.ai import router as ai_router
from app.api.routes.health import router as health_router

__all__ = ["ai_router", "health_router"]
