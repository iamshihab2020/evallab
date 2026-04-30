"""test_sets.domain_context: free-text domain hint passed to judge/cluster/diff prompts

Revision ID: 0005_test_set_domain_context
Revises: 0004_agent_versions
Create Date: 2026-05-01

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_test_set_domain_context"
down_revision: str | None = "0004_agent_versions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "test_sets",
        sa.Column("domain_context", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("test_sets", "domain_context")
