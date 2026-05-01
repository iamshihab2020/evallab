"""Run executor: orchestrates one full eval run with concurrency + per-case error isolation."""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import selectinload

from src.models import Agent, AgentVersion, CaseResult, Run, TestSet

from .judge import judge_response
from .llm import call_llm

logger = logging.getLogger(__name__)

MAX_CONCURRENT_CASES = 5


async def execute_run(run_id: UUID, db_factory: async_sessionmaker) -> None:  # type: ignore[type-arg]
    """Execute a run end-to-end. Per-case errors don't fail the run."""
    try:
        async with db_factory() as db:
            run = await db.get(Run, run_id)
            if run is None:
                logger.error("execute_run: run %s not found", run_id)
                return

            test_set = await db.scalar(
                select(TestSet)
                .where(TestSet.id == run.test_set_id)
                .options(selectinload(TestSet.cases)),
            )
            agent = await db.get(Agent, run.agent_id)
            # Read prompt-shaping fields from the pinned version, not the live
            # agent. This is the whole point of versioning: a run's prompt is
            # immutable even if the agent is later edited.
            version = (
                await db.get(AgentVersion, run.agent_version_id)
                if run.agent_version_id is not None
                else None
            )
            if test_set is None or agent is None or version is None:
                run.status = "failed"
                run.error = "Test set, agent, or pinned agent version not found"
                run.completed_at = datetime.now(UTC)
                await db.commit()
                return

            cases = list(test_set.cases)
            run.status = "running"
            run.total_cases = len(cases)
            await db.commit()

            judge_model = run.judge_model
            agent_system = version.system_prompt
            agent_model = version.model
            agent_temp = version.temperature
            agent_max_tokens = version.max_tokens
            domain_context = test_set.domain_context
            case_payloads = [
                (c.id, c.input, c.expected_behavior) for c in cases
            ]

        semaphore = asyncio.Semaphore(MAX_CONCURRENT_CASES)

        async def run_one_case(case_id: UUID, case_input: str, expected: str) -> None:
            async with semaphore:
                agent_full_prompt = f"SYSTEM:\n{agent_system}\n\nUSER:\n{case_input}"
                errored = False
                result_kwargs: dict[str, object] = {
                    "run_id": run_id,
                    "test_case_id": case_id,
                }
                # Two nested try blocks so we can capture the agent's token
                # spend even when the judge call later errors. Costs reflect what
                # the run actually spent, not what it usefully measured.
                try:
                    agent_output, agent_latency, agent_usage = await call_llm(
                        model=agent_model,
                        system=agent_system,
                        user=case_input,
                        temperature=agent_temp,
                        max_tokens=agent_max_tokens,
                    )
                    result_kwargs.update(
                        agent_prompt_sent=agent_full_prompt,
                        agent_output=agent_output,
                        agent_latency_ms=agent_latency,
                        agent_input_tokens=agent_usage["prompt_tokens"],
                        agent_output_tokens=agent_usage["completion_tokens"],
                    )
                    try:
                        (
                            score,
                            dim_scores,
                            reasoning,
                            judge_full_prompt,
                            judge_latency,
                            judge_usage,
                        ) = await judge_response(
                            model=judge_model,
                            input=case_input,
                            agent_output=agent_output,
                            expected_behavior=expected,
                            domain_context=domain_context,
                        )
                        result_kwargs.update(
                            judge_prompt_sent=judge_full_prompt,
                            judge_score=score,
                            judge_reasoning=reasoning,
                            judge_latency_ms=judge_latency,
                            judge_input_tokens=judge_usage["prompt_tokens"],
                            judge_output_tokens=judge_usage["completion_tokens"],
                            dim_accuracy=dim_scores["accuracy"],
                            dim_completeness=dim_scores["completeness"],
                            dim_tone=dim_scores["tone"],
                            dim_safety=dim_scores["safety"],
                        )
                    except Exception as je:
                        errored = True
                        err_str = f"{type(je).__name__}: {str(je)[:500]}"
                        result_kwargs["error"] = err_str
                        logger.warning("case %s judge errored: %s", case_id, err_str)
                except Exception as ae:
                    errored = True
                    err_str = f"{type(ae).__name__}: {str(ae)[:500]}"
                    result_kwargs["error"] = err_str
                    logger.warning("case %s agent errored: %s", case_id, err_str)

                async with db_factory() as db:
                    db.add(CaseResult(**result_kwargs))
                    stmt = (
                        update(Run)
                        .where(Run.id == run_id)
                        .values(
                            completed_cases=Run.completed_cases + 1,
                            errored_cases=Run.errored_cases + (1 if errored else 0),
                        )
                    )
                    await db.execute(stmt)
                    await db.commit()

        await asyncio.gather(
            *(run_one_case(cid, text, exp) for cid, text, exp in case_payloads),
        )

        async with db_factory() as db:
            run = await db.get(Run, run_id)
            if run is not None:
                run.status = "completed"
                run.completed_at = datetime.now(UTC)
                await db.commit()
        logger.info("run %s completed", run_id)

    except Exception as e:
        logger.exception("execute_run %s outer failure", run_id)
        try:
            async with db_factory() as db:
                run = await db.get(Run, run_id)
                if run is not None:
                    run.status = "failed"
                    run.error = f"{type(e).__name__}: {str(e)[:500]}"
                    run.completed_at = datetime.now(UTC)
                    await db.commit()
        except Exception:
            logger.exception("failed to mark run %s as failed", run_id)
