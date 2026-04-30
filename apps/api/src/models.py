import uuid
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# All timestamp columns use TIMESTAMP WITH TIME ZONE (timestamptz) per
# CLAUDE.md schema invariant. The frontend renders in browser-local time.
TS_TZ = DateTime(timezone=True)


class Base(DeclarativeBase):
    pass


class TestSet(Base):
    __tablename__ = "test_sets"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(nullable=False)
    description: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS_TZ, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        TS_TZ, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    cases: Mapped[list["TestCase"]] = relationship(
        back_populates="test_set", cascade="all, delete-orphan", order_by="TestCase.position"
    )


class TestCase(Base):
    __tablename__ = "test_cases"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_set_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("test_sets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    input: Mapped[str] = mapped_column(nullable=False)
    category: Mapped[str | None] = mapped_column(nullable=True)
    expected_behavior: Mapped[str] = mapped_column(nullable=False)
    position: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(TS_TZ, nullable=False, server_default=func.now())

    test_set: Mapped["TestSet"] = relationship(back_populates="cases")


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(nullable=False)
    system_prompt: Mapped[str] = mapped_column(nullable=False)
    model: Mapped[str] = mapped_column(nullable=False, default="llama-3.3-70b-versatile")
    temperature: Mapped[float] = mapped_column(nullable=False, default=0.7)
    max_tokens: Mapped[int] = mapped_column(nullable=False, default=512)
    created_at: Mapped[datetime] = mapped_column(TS_TZ, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        TS_TZ, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_set_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("test_sets.id"), nullable=False, index=True
    )
    agent_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False, index=True
    )
    judge_model: Mapped[str] = mapped_column(nullable=False, default="llama-3.3-70b-versatile")
    status: Mapped[str] = mapped_column(nullable=False, default="pending")
    started_at: Mapped[datetime] = mapped_column(TS_TZ, nullable=False, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(TS_TZ, nullable=True)
    total_cases: Mapped[int] = mapped_column(nullable=False, default=0)
    completed_cases: Mapped[int] = mapped_column(nullable=False, default=0)
    errored_cases: Mapped[int] = mapped_column(nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(nullable=True)
    failure_clusters: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)


class CompareInsight(Base):
    """Cached LLM explanation of why two runs differ. Keyed by the run pair."""

    __tablename__ = "compare_insights"

    run_a_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("runs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    run_b_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("runs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TS_TZ, nullable=False, server_default=func.now())


class CaseResult(Base):
    __tablename__ = "case_results"
    __table_args__ = (Index("ix_case_results_run_id_judge_score", "run_id", "judge_score"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    test_case_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("test_cases.id"), nullable=False, index=True
    )
    agent_prompt_sent: Mapped[str | None] = mapped_column(nullable=True)
    agent_output: Mapped[str | None] = mapped_column(nullable=True)
    agent_latency_ms: Mapped[int | None] = mapped_column(nullable=True)
    judge_prompt_sent: Mapped[str | None] = mapped_column(nullable=True)
    judge_score: Mapped[int | None] = mapped_column(nullable=True)
    judge_reasoning: Mapped[str | None] = mapped_column(nullable=True)
    judge_latency_ms: Mapped[int | None] = mapped_column(nullable=True)
    error: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS_TZ, nullable=False, server_default=func.now())

    test_case: Mapped["TestCase"] = relationship(lazy="joined")
