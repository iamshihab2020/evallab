"""Calibration endpoints: human scores per case_result + agreement metrics per run."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db
from src.deps import verify_api_key
from src.models import CaseResult, HumanScore
from src.schemas import (
    CalibrationItem,
    HumanScoreRead,
    HumanScoreUpsert,
    RunCalibration,
)
from src.services.calibration import compute_agreement, empty_confusion_matrix

router = APIRouter(tags=["calibration"], dependencies=[Depends(verify_api_key)])


@router.put(
    "/case-results/{case_result_id}/human-score",
    response_model=HumanScoreRead,
)
async def upsert_human_score(
    case_result_id: UUID,
    body: HumanScoreUpsert,
    db: AsyncSession = Depends(get_db),
) -> HumanScoreRead:
    cr = await db.get(CaseResult, case_result_id)
    if cr is None:
        raise HTTPException(404, "Case result not found")

    existing = (
        await db.execute(
            select(HumanScore).where(HumanScore.case_result_id == case_result_id),
        )
    ).scalar_one_or_none()

    if existing is None:
        existing = HumanScore(
            case_result_id=case_result_id,
            score=body.score,
            note=body.note,
        )
        db.add(existing)
    else:
        existing.score = body.score
        existing.note = body.note

    await db.commit()
    await db.refresh(existing)
    return HumanScoreRead.model_validate(existing)


@router.delete(
    "/case-results/{case_result_id}/human-score",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_human_score(
    case_result_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    existing = (
        await db.execute(
            select(HumanScore).where(HumanScore.case_result_id == case_result_id),
        )
    ).scalar_one_or_none()
    if existing is None:
        return
    await db.delete(existing)
    await db.commit()


@router.get("/runs/{run_id}/calibration", response_model=RunCalibration)
async def get_run_calibration(
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> RunCalibration:
    stmt = (
        select(CaseResult, HumanScore)
        .join(HumanScore, HumanScore.case_result_id == CaseResult.id, isouter=True)
        .where(CaseResult.run_id == run_id)
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        return RunCalibration(
            total_cases=0,
            scored_cases=0,
            percent_agreement=0.0,
            cohens_kappa=None,
            confusion_matrix=empty_confusion_matrix(),
            items=[],
        )

    items: list[CalibrationItem] = []
    pairs: list[tuple[int, int]] = []
    for cr, hs in rows:
        if hs is None or cr.judge_score is None:
            continue
        items.append(
            CalibrationItem(
                case_result_id=cr.id,
                judge_score=cr.judge_score,
                human_score=hs.score,
                agree=cr.judge_score == hs.score,
            ),
        )
        pairs.append((cr.judge_score, hs.score))

    metrics = compute_agreement(pairs)
    return RunCalibration(
        total_cases=len(rows),
        scored_cases=metrics["scored_cases"],
        percent_agreement=metrics["percent_agreement"],
        cohens_kappa=metrics["cohens_kappa"],
        confusion_matrix=metrics["confusion_matrix"],
        items=items,
    )
