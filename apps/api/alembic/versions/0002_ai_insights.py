"""ai insights: failure clusters + compare insights

Revision ID: 0002_ai_insights
Revises: 0001_initial_schema
Create Date: 2026-04-30

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0002_ai_insights"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "runs",
        sa.Column("failure_clusters", JSONB(), nullable=True),
    )
    op.create_table(
        "compare_insights",
        sa.Column(
            "run_a_id",
            UUID(as_uuid=True),
            sa.ForeignKey("runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "run_b_id",
            UUID(as_uuid=True),
            sa.ForeignKey("runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content", JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("run_a_id", "run_b_id"),
    )


def downgrade() -> None:
    op.drop_table("compare_insights")
    op.drop_column("runs", "failure_clusters")
