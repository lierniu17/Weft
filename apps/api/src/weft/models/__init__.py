"""Data shapes: SQLAlchemy table definitions (``tables``) and Pydantic contracts.

The Draft contract lives in ``weft.domain.draft`` (pure, no I/O) and is re-exported here.
"""

from weft.domain.draft import Draft, DraftStatus

__all__ = ["Draft", "DraftStatus"]
