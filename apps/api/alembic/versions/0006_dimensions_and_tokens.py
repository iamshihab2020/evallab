"""case_results: per-dimension judge sub-scores + agent/judge token counters

Revision ID: 0006_dimensions_and_tokens
Revises: 0005_test_set_domain_context
Create Date: 2026-05-01

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_dimensions_and_tokens"
down_revision: str | None = "0005_test_set_domain_context"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("case_results", sa.Column("dim_accuracy", sa.SmallInteger(), nullable=True))
    op.add_column("case_results", sa.Column("dim_completeness", sa.SmallInteger(), nullable=True))
    op.add_column("case_results", sa.Column("dim_tone", sa.SmallInteger(), nullable=True))
    op.add_column("case_results", sa.Column("dim_safety", sa.SmallInteger(), nullable=True))
    op.add_column("case_results", sa.Column("agent_input_tokens", sa.Integer(), nullable=True))
    op.add_column("case_results", sa.Column("agent_output_tokens", sa.Integer(), nullable=True))
    op.add_column("case_results", sa.Column("judge_input_tokens", sa.Integer(), nullable=True))
    op.add_column("case_results", sa.Column("judge_output_tokens", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("case_results", "judge_output_tokens")
    op.drop_column("case_results", "judge_input_tokens")
    op.drop_column("case_results", "agent_output_tokens")
    op.drop_column("case_results", "agent_input_tokens")
    op.drop_column("case_results", "dim_safety")
    op.drop_column("case_results", "dim_tone")
    op.drop_column("case_results", "dim_completeness")
    op.drop_column("case_results", "dim_accuracy")
