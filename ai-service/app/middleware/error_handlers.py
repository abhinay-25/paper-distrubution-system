"""Global exception handlers for the FastAPI application.

Ensures that:
- Every error response strictly follows {"error": {"code": ..., "message": ..., "retryable": ...}, "requestId": ...}
- Provider stack traces, raw DB errors, or secrets are NEVER returned to the client
- X-Request-Id header is always attached to error responses
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.errors import AIServiceError, ErrorCode, error_body
from app.core.logging import get_logger

logger = get_logger()


def _get_request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None) or request.headers.get("x-request-id")


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AIServiceError)
    async def ai_service_error_handler(request: Request, exc: AIServiceError) -> JSONResponse:
        request_id = _get_request_id(request)
        headers: dict[str, str] = {}
        if request_id:
            headers["X-Request-Id"] = request_id
        if exc.retry_after_seconds is not None:
            headers["Retry-After"] = str(int(exc.retry_after_seconds))

        body = error_body(exc.code, request_id, exc.message)
        return JSONResponse(status_code=exc.status_code, content=body, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        request_id = _get_request_id(request)
        headers = {"X-Request-Id": request_id} if request_id else {}

        # Safe summary without echoing raw invalid input payloads
        error_count = len(exc.errors())
        message = f"Request validation failed ({error_count} error{'s' if error_count != 1 else ''})."

        body = error_body(ErrorCode.VALIDATION_ERROR, request_id, message)
        return JSONResponse(status_code=422, content=body, headers=headers)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        request_id = _get_request_id(request)
        headers = {"X-Request-Id": request_id} if request_id else {}

        code = ErrorCode.INTERNAL_ERROR
        if exc.status_code == 404:
            code = ErrorCode.NOT_FOUND
        elif exc.status_code == 405:
            code = ErrorCode.METHOD_NOT_ALLOWED
        elif exc.status_code == 401:
            code = ErrorCode.UNAUTHORIZED

        message = str(exc.detail) if isinstance(exc.detail, str) else None
        body = error_body(code, request_id, message)
        return JSONResponse(status_code=exc.status_code, content=body, headers=headers)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = _get_request_id(request)
        headers = {"X-Request-Id": request_id} if request_id else {}

        logger.error(
            "Unhandled exception in request processing",
            extra={
                "event": "unhandled_exception",
                "request_id": request_id,
                "error_code": ErrorCode.INTERNAL_ERROR.value,
                "path": request.url.path,
                "method": request.method,
            },
            exc_info=True,
        )

        body = error_body(ErrorCode.INTERNAL_ERROR, request_id, "An unexpected internal error occurred.")
        return JSONResponse(status_code=500, content=body, headers=headers)
