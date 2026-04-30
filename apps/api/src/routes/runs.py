"""Runs endpoints: start, list, detail, delete."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.db import AsyncSessionLocal, get_db
from src.deps import verify_api_key
from src.models import Agent, AgentVersion, CaseResult, CompareInsight, Run, TestSet
from src.schemas import (
    CaseResultRead,
    CompareInsightContent,
    FailureCluster,
    RunCompare,
    RunDetail,
    RunListItem,
    RunRead,
    RunStart,
)
from src.services.clustering import cluster_failures
from src.services.diff_analyzer import explain_diff
from src.services.exporter import export_run_md
from src.services.runner import execute_run
from src.services.stats import compute_stats

router = APIRouter(
    prefix="/runs",
    tags=["runs"],
    dependencies=[Depends(verify_api_key)],
)


@router.post("", response_model=RunRead, status_code=status.HTTP_201_CREATED)
async def start_run(
    body: RunStart,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> RunRead:
    test_set = await db.get(TestSet, body.test_set_id)
    if test_set is None:
        raise HTTPException(404, "Test set not found")
    agent = await db.get(Agent, body.agent_id)
    if agent is None:
        raise HTTPException(404, "Agent not found")

    # Resolve which version this run pins to. Default = latest version of the agent.
    if body.agent_version_id is not None:
        version = await db.get(AgentVersion, body.agent_version_id)
        if version is None or version.agent_id != body.agent_id:
            raise HTTPException(400, "agent_version_id does not belong to this agent")
    else:
        version = await db.scalar(
            select(AgentVersion)
            .where(AgentVersion.agent_id == body.agent_id)
            .order_by(AgentVersion.version.desc())
            .limit(1),
        )
        if version is None:
            raise HTTPException(500, "Agent has no versions; data is inconsistent.")

    run = Run(
        test_set_id=body.test_set_id,
        agent_id=body.agent_id,
        agent_version_id=version.id,
        judge_model=body.judge_model,
        status="pending",
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    background.add_task(execute_run, run.id, AsyncSessionLocal)

    return RunRead(
        id=run.id,
        test_set_id=run.test_set_id,
        agent_id=run.agent_id,
        agent_version_id=run.agent_version_id,
        agent_version=version.version,
        judge_model=run.judge_model,
        status=run.status,
        started_at=run.started_at,
        completed_at=run.completed_at,
        total_cases=run.total_cases,
        completed_cases=run.completed_cases,
        errored_cases=run.errored_cases,
        error=run.error,
    )


@router.get("", response_model=list[RunListItem])
async def list_runs(
    db: AsyncSession = Depends(get_db),
    test_set_id: UUID | None = None,
    agent_id: UUID | None = None,
) -> list[RunListItem]:
    stmt = (
        select(Run, TestSet.name, Agent.name, AgentVersion.version)
        .join(TestSet, TestSet.id == Run.test_set_id)
        .join(Agent, Agent.id == Run.agent_id)
        .join(AgentVersion, AgentVersion.id == Run.agent_version_id, isouter=True)
        .order_by(Run.started_at.desc())
    )
    if test_set_id is not None:
        stmt = stmt.where(Run.test_set_id == test_set_id)
    if agent_id is not None:
        stmt = stmt.where(Run.agent_id == agent_id)

    result = await db.execute(stmt)
    rows = result.all()
    if not rows:
        return []

    completed_ids = [r.Run.id for r in rows if r.Run.status == "completed"]
    pass_rates: dict[UUID, float] = {}
    if completed_ids:
        cr_stmt = (
            select(CaseResult)
            .options(selectinload(CaseResult.test_case))
            .where(CaseResult.run_id.in_(completed_ids))
        )
        cr_results = (await db.execute(cr_stmt)).scalars().all()
        by_run: dict[UUID, list[CaseResult]] = {}
        for cr in cr_results:
            by_run.setdefault(cr.run_id, []).append(cr)
        for run_id, cr_list in by_run.items():
            stats = compute_stats(cr_list)
            pass_rates[run_id] = stats.pass_rate

    return [
        RunListItem(
            id=r.Run.id,
            test_set_id=r.Run.test_set_id,
            test_set_name=r[1],
            agent_id=r.Run.agent_id,
            agent_name=r[2],
            agent_version=r[3],
            judge_model=r.Run.judge_model,
            status=r.Run.status,
            started_at=r.Run.started_at,
            completed_at=r.Run.completed_at,
            total_cases=r.Run.total_cases,
            completed_cases=r.Run.completed_cases,
            errored_cases=r.Run.errored_cases,
            pass_rate=pass_rates.get(r.Run.id) if r.Run.status == "completed" else None,
        )
        for r in rows
    ]


async def _build_run_detail(run_id: UUID, db: AsyncSession) -> RunDetail:
    run = await db.get(Run, run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    test_set = await db.get(TestSet, run.test_set_id)
    agent = await db.get(Agent, run.agent_id)
    version = (
        await db.get(AgentVersion, run.agent_version_id)
        if run.agent_version_id is not None
        else None
    )

    cr_stmt = (
        select(CaseResult)
        .options(selectinload(CaseResult.test_case))
        .where(CaseResult.run_id == run_id)
        .order_by(CaseResult.created_at.asc())
    )
    case_results = (await db.execute(cr_stmt)).scalars().all()
    stats = compute_stats(case_results) if run.status == "completed" else None

    clusters: list[FailureCluster] | None = None
    if run.failure_clusters is not None:
        clusters = [FailureCluster.model_validate(c) for c in run.failure_clusters]

    return RunDetail(
        id=run.id,
        test_set_id=run.test_set_id,
        agent_id=run.agent_id,
        agent_version_id=run.agent_version_id,
        agent_version=version.version if version else None,
        judge_model=run.judge_model,
        status=run.status,
        started_at=run.started_at,
        completed_at=run.completed_at,
        total_cases=run.total_cases,
        completed_cases=run.completed_cases,
        errored_cases=run.errored_cases,
        error=run.error,
        test_set_name=test_set.name if test_set else "",
        test_set_domain_context=test_set.domain_context if test_set else None,
        agent_name=agent.name if agent else "",
        case_results=[CaseResultRead.model_validate(cr) for cr in case_results],
        stats=stats,
        failure_clusters=clusters,
    )


@router.get("/compare", response_model=RunCompare)
async def compare_runs(
    a: UUID = Query(...),
    b: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
) -> RunCompare:
    run_a = await _build_run_detail(a, db)
    run_b = await _build_run_detail(b, db)

    if run_a.test_set_id != run_b.test_set_id:
        raise HTTPException(
            400,
            f"Cannot compare runs from different test sets. "
            f"Run A used test set {run_a.test_set_name}; "
            f"Run B used test set {run_b.test_set_name}.",
        )
    if run_a.status != "completed" or run_b.status != "completed":
        raise HTTPException(409, "Both runs must be completed before comparison.")

    a_by_case = {cr.test_case_id: cr for cr in run_a.case_results}
    b_by_case = {cr.test_case_id: cr for cr in run_b.case_results}
    shared_case_ids = set(a_by_case) & set(b_by_case)

    improved: list[UUID] = []
    regressed: list[UUID] = []
    unchanged: list[UUID] = []
    errored: list[UUID] = []

    for cid in shared_case_ids:
        ca, cb = a_by_case[cid], b_by_case[cid]
        if ca.error or cb.error or ca.judge_score is None or cb.judge_score is None:
            errored.append(cid)
            continue
        delta = cb.judge_score - ca.judge_score
        if delta > 0:
            improved.append(cid)
        elif delta < 0:
            regressed.append(cid)
        else:
            unchanged.append(cid)

    pa = run_a.stats.pass_rate if run_a.stats else 0.0
    pb = run_b.stats.pass_rate if run_b.stats else 0.0

    return RunCompare(
        run_a=run_a,
        run_b=run_b,
        pass_rate_delta=pb - pa,
        cases_improved=improved,
        cases_regressed=regressed,
        cases_unchanged=unchanged,
        cases_errored=errored,
    )


@router.get("/{run_id}", response_model=RunDetail)
async def get_run(run_id: UUID, db: AsyncSession = Depends(get_db)) -> RunDetail:
    return await _build_run_detail(run_id, db)


@router.get("/{run_id}/export")
async def export_run(
    run_id: UUID,
    format: str = Query("md"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    if format != "md":
        raise HTTPException(400, "Only format=md is supported.")
    run = await _build_run_detail(run_id, db)
    if run.status != "completed":
        raise HTTPException(409, "Run is not completed yet.")
    md = export_run_md(run)
    return Response(
        content=md,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="evallab-run-{run_id}.md"',
        },
    )


@router.post("/{run_id}/cluster-failures", response_model=list[FailureCluster])
async def cluster_run_failures(
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> list[FailureCluster]:
    run = await db.get(Run, run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    if run.status != "completed":
        raise HTTPException(409, "Run must be completed before clustering.")

    if run.failure_clusters is not None:
        return [FailureCluster.model_validate(c) for c in run.failure_clusters]

    cr_stmt = (
        select(CaseResult)
        .options(selectinload(CaseResult.test_case))
        .where(
            CaseResult.run_id == run_id,
            CaseResult.error.is_(None),
            CaseResult.judge_score.is_not(None),
            CaseResult.judge_score <= 3,
        )
        .order_by(CaseResult.judge_score.asc())
    )
    failures = list((await db.execute(cr_stmt)).scalars().all())
    if not failures:
        run.failure_clusters = []
        await db.commit()
        return []

    test_set = await db.get(TestSet, run.test_set_id)
    clusters = await cluster_failures(
        model=run.judge_model,
        failures=failures,
        domain_context=test_set.domain_context if test_set else None,
    )
    run.failure_clusters = [c.model_dump(mode="json") for c in clusters]
    await db.commit()
    return clusters


@router.post("/compare/explain", response_model=CompareInsightContent)
async def explain_compare(
    a: UUID = Query(...),
    b: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
) -> CompareInsightContent:
    cached = await db.get(CompareInsight, (a, b))
    if cached is not None:
        return CompareInsightContent.model_validate(cached.content)

    run_a = await db.get(Run, a)
    run_b = await db.get(Run, b)
    if run_a is None or run_b is None:
        raise HTTPException(404, "One or both runs not found")
    if run_a.test_set_id != run_b.test_set_id:
        raise HTTPException(400, "Cannot explain runs from different test sets.")
    if run_a.status != "completed" or run_b.status != "completed":
        raise HTTPException(409, "Both runs must be completed.")

    agent_a = await db.get(Agent, run_a.agent_id)
    agent_b = await db.get(Agent, run_b.agent_id)
    if agent_a is None or agent_b is None:
        raise HTTPException(404, "Agent for one or both runs not found")

    # Use the pinned versions' prompts so the explanation matches what actually
    # ran, even if the live agents have since been edited. Expunge the agents
    # from the session before mutating so SQLAlchemy doesn't UPDATE them on
    # commit.
    db.expunge(agent_a)
    db.expunge(agent_b)
    for agent_obj, run_obj in ((agent_a, run_a), (agent_b, run_b)):
        if run_obj.agent_version_id is None:
            continue
        version = await db.get(AgentVersion, run_obj.agent_version_id)
        if version is not None:
            agent_obj.system_prompt = version.system_prompt
            agent_obj.model = version.model
            agent_obj.temperature = version.temperature
            agent_obj.max_tokens = version.max_tokens

    cr_stmt = (
        select(CaseResult)
        .options(selectinload(CaseResult.test_case))
        .where(CaseResult.run_id.in_([a, b]))
    )
    all_results = list((await db.execute(cr_stmt)).scalars().all())
    by_run: dict[UUID, list[CaseResult]] = {}
    for cr in all_results:
        by_run.setdefault(cr.run_id, []).append(cr)
    a_by_case = {cr.test_case_id: cr for cr in by_run.get(a, [])}
    b_by_case = {cr.test_case_id: cr for cr in by_run.get(b, [])}

    improved_pairs: list[tuple[CaseResult, CaseResult]] = []
    regressed_pairs: list[tuple[CaseResult, CaseResult]] = []
    for tc_id, ca in a_by_case.items():
        cb = b_by_case.get(tc_id)
        if cb is None or ca.judge_score is None or cb.judge_score is None:
            continue
        if ca.error or cb.error:
            continue
        delta = cb.judge_score - ca.judge_score
        if delta > 0:
            improved_pairs.append((ca, cb))
        elif delta < 0:
            regressed_pairs.append((ca, cb))

    improved_pairs.sort(
        key=lambda p: (p[1].judge_score or 0) - (p[0].judge_score or 0), reverse=True,
    )
    regressed_pairs.sort(
        key=lambda p: (p[0].judge_score or 0) - (p[1].judge_score or 0), reverse=True,
    )

    stats_a = compute_stats(by_run.get(a, []))
    stats_b = compute_stats(by_run.get(b, []))

    test_set = await db.get(TestSet, run_a.test_set_id)
    insight = await explain_diff(
        model=run_a.judge_model,
        agent_a=agent_a,
        agent_b=agent_b,
        pass_rate_a=stats_a.pass_rate,
        pass_rate_b=stats_b.pass_rate,
        avg_score_a=stats_a.avg_score,
        avg_score_b=stats_b.avg_score,
        improved_pairs=improved_pairs[:3],
        regressed_pairs=regressed_pairs[:3],
        domain_context=test_set.domain_context if test_set else None,
    )

    db.add(
        CompareInsight(
            run_a_id=a,
            run_b_id=b,
            content=insight.model_dump(mode="json"),
        ),
    )
    await db.commit()
    return insight


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_run(run_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    run = await db.get(Run, run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    await db.delete(run)
    await db.commit()


async def heal_orphaned_runs() -> None:
    """On startup, mark any 'running' runs as failed (worker restarted mid-run)."""
    async with AsyncSessionLocal() as db:
        stmt = select(Run).where(Run.status.in_(["pending", "running"]))
        rows = (await db.execute(stmt)).scalars().all()
        for run in rows:
            run.status = "failed"
            run.error = "Server restarted mid-run"
            run.completed_at = datetime.now(UTC)
        if rows:
            await db.commit()
