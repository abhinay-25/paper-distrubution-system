"""Backward-compatibility re-export for app.core.config."""

from app.core.config import ConfigurationError, Settings, get_settings, load_settings

__all__ = ["ConfigurationError", "Settings", "get_settings", "load_settings"]
