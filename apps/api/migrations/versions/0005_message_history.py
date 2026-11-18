"""message history

上文 (conversation-context spec AC-10): the ids of the earlier asking messages an answer was
read with (history_used_of, a JSON list). 指代确认 reuses clarify_json with a new key
``source`` (intent | ask); rows without it are 反问 from intent recognition. Columns and
JSON keys only; existing messages are left as they are.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-19 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("history_used_of", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("messages", "history_used_of")
