"""Safe, stable error codes for the internal AI API.

Every error response has the shape::

    {"error": {"code": "...", "message": "...", "retryable": bool}, "requestId": "..."}

Messages are fixed, human-readable strings. They never contain provider response
bodies, stack traces, prompts, or credentials.
"""

from __future__ import annotations

from enum import Enum


class ErrorCode(str, Enum):
    VALIDATION_ERROR = "VALIDATION_ERROR"
    UNAUTHORIZED = "UNAUTHORIZED"
    NOT_FOUND = "NOT_FOUND"
    METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"
    PROVIDER_NOT_CONFIGURED = "PROVIDER_NOT_CONFIGURED"
    PROVIDER_CONFIGURATION_ERROR = "PROVIDER_CONFIGURATION_ERROR"
    PROVIDER_AUTH_FAILED = "PROVIDER_AUTH_FAILED"
    PROVIDER_RATE_LIMITED = "PROVIDER_RATE_LIMITED"
    PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    PROVIDER_REJECTED_REQUEST = "PROVIDER_REJECTED_REQUEST"
    PROVIDER_INVALID_OUTPUT = "PROVIDER_INVALID_OUTPUT"
    INTERNAL_ERROR = "INTERNAL_ERROR"


# (http_status, retryable, safe message)
_ERROR_TABLE: dict[ErrorCode, tuple[int, bool, str]] = {
    ErrorCode.VALIDATION_ERROR: (422, False, "The request is invalid."),
    ErrorCode.UNAUTHORIZED: (401, False, "Missing or invalid internal service credentials."),
    ErrorCode.NOT_FOUND: (404, False, "Not found."),
    ErrorCode.METHOD_NOT_ALLOWED: (405, False, "Method not allowed."),
    ErrorCode.PAYLOAD_TOO_LARGE: (413, False, "The request body exceeds the permitted size."),
    ErrorCode.PROVIDER_NOT_CONFIGURED: (503, False, "The AI provider is not configured on this service."),
    ErrorCode.PROVIDER_CONFIGURATION_ERROR: (
        503,
        False,
        "The AI provider rejected the service configuration (for example, an unavailable model).",
    ),
    ErrorCode.PROVIDER_AUTH_FAILED: (502, False, "The AI provider rejected the service credentials."),
    ErrorCode.PROVIDER_RATE_LIMITED: (429, True, "The AI provider rate limit or quota was exceeded."),
    ErrorCode.PROVIDER_TIMEOUT: (504, True, "The AI provider did not respond in time."),
    ErrorCode.PROVIDER_UNAVAILABLE: (503, True, "The AI provider is temporarily unavailable."),
    ErrorCode.PROVIDER_REJECTED_REQUEST: (502, False, "The AI provider rejected the request."),
    ErrorCode.PROVIDER_INVALID_OUTPUT: (
        502,
        False,
        "The AI provider returned output that did not match the expected structure.",
    ),
    ErrorCode.INTERNAL_ERROR: (500, False, "An unexpected internal error occurred."),
}


class AIServiceError(Exception):
    """An operational error that maps to a safe API error response."""

    def __init__(self, code: ErrorCode, *, retry_after_seconds: float | None = None) -> None:
        status, retryable, message = _ERROR_TABLE[code]
        super().__init__(message)
        self.code = code
        self.status_code = status
        self.retryable = retryable
        self.message = message
        self.retry_after_seconds = retry_after_seconds


def error_body(code: ErrorCode, request_id: str | None, message: str | None = None) -> dict[str, object]:
    status, retryable, default_message = _ERROR_TABLE[code]
    return {
        "error": {"code": code.value, "message": message or default_message, "retryable": retryable},
        "requestId": request_id,
    }


def status_for(code: ErrorCode) -> int:
    return _ERROR_TABLE[code][0]
