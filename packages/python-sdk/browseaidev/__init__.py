"""BrowseAI Dev — Reliable research infrastructure for AI agents."""

from .client import AsyncBrowseAIDev, BrowseAIDev
from .exceptions import (
    AuthenticationError,
    BrowseAIDevError,
    InsufficientCreditsError,
    RateLimitError,
    ServerError,
    ValidationError,
)
from .models import (
    BrowseClaim,
    BrowseResult,
    BrowseSource,
    CompareResult,
    Contradiction,
    KnowledgeEntry,
    NLIScore,
    PageResult,
    PremiumQuota,
    ReasoningStep,
    RecallResult,
    SearchProviderConfig,
    SearchResult,
    Session,
    SessionAskResult,
    TraceStep,
)

__all__ = [
    "BrowseAIDev",
    "AsyncBrowseAIDev",
    "BrowseAIDevError",
    "AuthenticationError",
    "RateLimitError",
    "InsufficientCreditsError",
    "ValidationError",
    "ServerError",
    "BrowseResult",
    "BrowseSource",
    "BrowseClaim",
    "Contradiction",
    "ReasoningStep",
    "TraceStep",
    "SearchResult",
    "PageResult",
    "CompareResult",
    "Session",
    "KnowledgeEntry",
    "SessionAskResult",
    "RecallResult",
    "PremiumQuota",
    "SearchProviderConfig",
    "NLIScore",
]

__version__ = "0.1.7"
