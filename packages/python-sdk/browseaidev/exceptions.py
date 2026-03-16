"""Exception classes for BrowseAI Dev SDK."""


class BrowseAIDevError(Exception):
    """Base exception for BrowseAI Dev SDK."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class AuthenticationError(BrowseAIDevError):
    """Raised on 401 responses."""


class RateLimitError(BrowseAIDevError):
    """Raised on 429 responses."""


class InsufficientCreditsError(BrowseAIDevError):
    """Raised on 402 responses."""


class ValidationError(BrowseAIDevError):
    """Raised on 400 responses."""


class ServerError(BrowseAIDevError):
    """Raised on 5xx responses."""
