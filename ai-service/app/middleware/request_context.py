"""Request correlation, payload bounding, and operational access logging middleware."""

from __future__ import annotations

import time
import uuid
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.errors import ErrorCode, error_body
from app.core.logging import get_logger

logger = get_logger()


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Response]) -> Response:
        start_time = time.perf_counter()

        # 1. Resolve request correlation ID
        incoming_id = request.headers.get("x-request-id")
        request_id = incoming_id.strip() if incoming_id and incoming_id.strip() else str(uuid.uuid4())
        request.state.request_id = request_id

        # 2. Enforce request payload size ceiling if content-length header is present
        content_length = request.headers.get("content-length")
        settings = getattr(request.app.state, "settings", None)
        max_bytes = settings.max_request_bytes if settings else 65_536

        if content_length:
            try:
                length_int = int(content_length)
                if length_int > max_bytes:
                    body = error_body(
                        ErrorCode.PAYLOAD_TOO_LARGE,
                        request_id,
                        f"Request size {length_int} exceeds limit of {max_bytes} bytes.",
                    )
                    response = JSONResponse(status_code=413, content=body)
                    response.headers["X-Request-Id"] = request_id
                    return response
            except ValueError:
                pass

        # 3. Process request
        try:
            response = await call_next(request)
        except Exception:
            # Let the exception handlers format the response; they will attach X-Request-Id
            raise

        # 4. Attach request ID to response header
        response.headers["X-Request-Id"] = request_id

        duration_ms = int((time.perf_counter() - start_time) * 1000)

        # Do not log health checks at INFO to avoid log pollution
        if not request.url.path.endswith("/health"):
            logger.info(
                "HTTP request handled",
                extra={
                    "event": "http_request",
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": duration_ms,
                },
            )

        return response
