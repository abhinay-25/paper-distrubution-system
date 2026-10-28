"""Structured, privacy-conscious JSON logging.

Only explicitly passed ``extra`` fields from an allow-list are emitted. This keeps
prompts, question text, credentials, and raw provider bodies out of the logs even
if a caller accidentally passes them.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

LOGGER_NAME = "pds_ai"

# Fields that may appear in log records. Anything else passed via ``extra`` is dropped.
ALLOWED_FIELDS = frozenset(
    {
        "event",
        "request_id",
        "operation",
        "provider",
        "model",
        "duration_ms",
        "outcome",
        "error_code",
        "attempt",
        "retry_in_ms",
        "status_code",
        "method",
        "path",
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "provider_status",
        "app_env",
        "provider_configured",
    }
)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in ALLOWED_FIELDS:
            if key in record.__dict__:
                payload[key] = record.__dict__[key]
        if record.exc_info and record.levelno >= logging.ERROR:
            # Exception type only; tracebacks can embed request data.
            payload["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> logging.Logger:
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(level)
    if not any(getattr(h, "_pds_handler", False) for h in logger.handlers):
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        handler._pds_handler = True  # type: ignore[attr-defined]
        logger.addHandler(handler)
    logger.propagate = True  # allows pytest caplog to observe records
    return logger


def get_logger() -> logging.Logger:
    return logging.getLogger(LOGGER_NAME)
