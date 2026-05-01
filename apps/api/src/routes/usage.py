"""Daily token-usage aggregator for the quota meter."""
from __future__ import annotations

from datetime import UTC, datetime, time

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db
from src.deps import verify_api_key
from src.models import CaseResult
from src.schemas import RunUsage

# Groq's published llama-3.3-70b-versatile free-tier daily token cap.
# Used only as the denominator on the meter — not enforced server-side.
DAILY_QUOTA_TOKENS = 100_000

router = APIRouter(
    prefix="/usage",
    tags=["usage"],
    dependencies=[Depends(verify_api_key)],
)


@router.get("/today", response_model=RunUsage)
async def usage_today(db: AsyncSession = Depends(get_db)) -> RunUsage:
    # Day boundary in UTC. We don't try to be clever about the user's
    # timezone — Groq's quota also resets on UTC midnight, so this matches
    # what the quota meter conceptually represents.
    today_start = datetime.combine(datetime.now(UTC).date(), time.min, tzinfo=UTC)

    stmt = select(
        func.coalesce(func.sum(CaseResult.agent_input_tokens), 0),
        func.coalesce(func.sum(CaseResult.agent_output_tokens), 0),
        func.coalesce(func.sum(CaseResult.judge_input_tokens), 0),
        func.coalesce(func.sum(CaseResult.judge_output_tokens), 0),
        func.count(func.distinct(CaseResult.run_id)),
    ).where(CaseResult.created_at >= today_start)

    row = (await db.execute(stmt)).one()
    agent_in, agent_out, judge_in, judge_out, runs_today = row
    tokens_in = int(agent_in) + int(judge_in)
    tokens_out = int(agent_out) + int(judge_out)
    total = tokens_in + tokens_out
    pct = (total / DAILY_QUOTA_TOKENS) if DAILY_QUOTA_TOKENS > 0 else 0.0

    return RunUsage(
        tokens_in_today=tokens_in,
        tokens_out_today=tokens_out,
        tokens_total_today=total,
        runs_today=int(runs_today),
        daily_quota_tokens=DAILY_QUOTA_TOKENS,
        percent_used=pct,
    )
