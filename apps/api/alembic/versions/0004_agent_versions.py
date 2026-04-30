"""agent versions: pin runs to immutable prompt snapshots

Revision ID: 0004_agent_versions
Revises: 0003_human_scores
Create Date: 2026-05-01

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0004_agent_versions"
down_revision: str | None = "0003_human_scores"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("agents.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("temperature", sa.Float(), nullable=False),
        sa.Column("max_tokens", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("agent_id", "version", name="uq_agent_versions_agent_version"),
    )

    # Add nullable FK column to runs first so backfill can populate it.
    op.add_column(
        "runs",
        sa.Column("agent_version_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_runs_agent_version_id",
        "runs",
        "agent_versions",
        ["agent_version_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Backfill: one v1 row per existing agent, linking every existing run.
    op.execute(
        """
        INSERT INTO agent_versions (id, agent_id, version, system_prompt, model, temperature, max_tokens, created_at)
        SELECT gen_random_uuid(), id, 1, system_prompt, model, temperature, max_tokens, created_at
        FROM agents
        """,
    )
    op.execute(
        """
        UPDATE runs
        SET agent_version_id = av.id
        FROM agent_versions av
        WHERE runs.agent_id = av.agent_id AND av.version = 1
        """,
    )


def downgrade() -> None:
    op.drop_constraint("fk_runs_agent_version_id", "runs", type_="foreignkey")
    op.drop_column("runs", "agent_version_id")
    op.drop_table("agent_versions")
