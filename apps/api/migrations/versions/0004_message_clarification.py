"""message clarification

反问 (intent-clarify spec): a 拿不准 message keeps the 反问 and its options
(clarify_json); a message typed as the answer points at it (clarification_of); the 反问 is
settled at clarification_resolved_at. Columns only; existing messages are left as they are.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-18 20:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("clarify_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column("messages", sa.Column("clarification_of", sa.Uuid(), nullable=True))
    op.add_column(
        "messages",
        sa.Column("clarification_resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "messages_clarification_of_fkey",
        "messages",
        "messages",
        ["clarification_of"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("messages_clarification_of_fkey", "messages", type_="foreignkey")
    op.drop_column("messages", "clarification_resolved_at")
    op.drop_column("messages", "clarification_of")
    op.drop_column("messages", "clarify_json")
