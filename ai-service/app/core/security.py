"""Internal service authentication (Node.js backend -> AI service).

The backend sends ``Authorization: Bearer <INTERNAL_SERVICE_TOKEN>``. The token is a
shared secret configured on both services via server-side environment variables.

This is *service* authentication only. It proves the caller is the trusted backend;
it says nothing about which end user or institution the request is for. User and
institution authorization remain the backend's responsibility.
"""

from __future__ import annotations

import hmac

from fastapi import Request

from app.core.errors import AIServiceError, ErrorCode

_SCHEME = "bearer"


def _extract_bearer(header_value: str | None) -> str | None:
    if not header_value:
        return None
    parts = header_value.strip().split(None, 1)
    if len(parts) != 2 or parts[0].lower() != _SCHEME:
        return None
    token = parts[1].strip()
    return token or None


def require_internal_service(request: Request) -> None:
    """FastAPI dependency that rejects requests without a valid service token."""
    expected = request.app.state.settings.internal_service_token.get_secret_value()
    presented = _extract_bearer(request.headers.get("authorization"))
    # Constant-time comparison on bytes; a missing token is compared against a
    # dummy value so timing does not reveal whether the header was present.
    candidate = (presented or "\x00").encode("utf-8")
    if not hmac.compare_digest(candidate, expected.encode("utf-8")) or presented is None:
        raise AIServiceError(ErrorCode.UNAUTHORIZED)
