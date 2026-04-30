"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-04-30

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "test_sets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
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
    )

    op.create_table(
        "test_cases",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "test_set_id",
            UUID(as_uuid=True),
            sa.ForeignKey("test_sets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("input", sa.Text(), nullable=False),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("expected_behavior", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_test_cases_test_set_id", "test_cases", ["test_set_id"])

    op.create_table(
        "agents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column(
            "model",
            sa.String(),
            nullable=False,
            server_default="llama-3.3-70b-versatile",
        ),
        sa.Column("temperature", sa.Float(), nullable=False, server_default="0.7"),
        sa.Column("max_tokens", sa.Integer(), nullable=False, server_default="512"),
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
    )

    op.create_table(
        "runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "test_set_id",
            UUID(as_uuid=True),
            sa.ForeignKey("test_sets.id"),
            nullable=False,
        ),
        sa.Column(
            "agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("agents.id"),
            nullable=False,
        ),
        sa.Column(
            "judge_model",
            sa.String(),
            nullable=False,
            server_default="llama-3.3-70b-versatile",
        ),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_cases", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_cases", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("errored_cases", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.create_index("ix_runs_test_set_id", "runs", ["test_set_id"])
    op.create_index("ix_runs_agent_id", "runs", ["agent_id"])

    op.create_table(
        "case_results",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "run_id",
            UUID(as_uuid=True),
            sa.ForeignKey("runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "test_case_id",
            UUID(as_uuid=True),
            sa.ForeignKey("test_cases.id"),
            nullable=False,
        ),
        sa.Column("agent_prompt_sent", sa.Text(), nullable=True),
        sa.Column("agent_output", sa.Text(), nullable=True),
        sa.Column("agent_latency_ms", sa.Integer(), nullable=True),
        sa.Column("judge_prompt_sent", sa.Text(), nullable=True),
        sa.Column("judge_score", sa.Integer(), nullable=True),
        sa.Column("judge_reasoning", sa.Text(), nullable=True),
        sa.Column("judge_latency_ms", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_case_results_run_id_judge_score",
        "case_results",
        ["run_id", "judge_score"],
    )
    op.create_index("ix_case_results_test_case_id", "case_results", ["test_case_id"])


def downgrade() -> None:
    op.drop_index("ix_case_results_test_case_id", table_name="case_results")
    op.drop_index("ix_case_results_run_id_judge_score", table_name="case_results")
    op.drop_table("case_results")
    op.drop_index("ix_runs_agent_id", table_name="runs")
    op.drop_index("ix_runs_test_set_id", table_name="runs")
    op.drop_table("runs")
    op.drop_table("agents")
    op.drop_index("ix_test_cases_test_set_id", table_name="test_cases")
    op.drop_table("test_cases")
    op.drop_table("test_sets")
