"""human scores: per-case-result human ratings for judge calibration

Revision ID: 0003_human_scores
Revises: 0002_ai_insights
Create Date: 2026-05-01

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0003_human_scores"
down_revision: str | None = "0002_ai_insights"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "human_scores",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "case_result_id",
            UUID(as_uuid=True),
            sa.ForeignKey("case_results.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("score >= 1 AND score <= 5", name="ck_human_scores_range"),
    )


def downgrade() -> None:
    op.drop_table("human_scores")
