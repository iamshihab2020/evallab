import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db
from src.deps import verify_api_key
from src.models import TestCase, TestSet
from src.schemas import (
    CSVUploadResult,
    CSVUploadRowError,
    TestCaseCreate,
    TestCaseRead,
    TestCaseUpdate,
)

router = APIRouter(tags=["test-cases"], dependencies=[Depends(verify_api_key)])

REQUIRED_CSV_FIELDS = {"input", "expected_behavior"}
ALL_CSV_FIELDS = {"input", "category", "expected_behavior"}


async def _next_position(db: AsyncSession, test_set_id: UUID) -> int:
    current_max = await db.scalar(
        select(func.coalesce(func.max(TestCase.position), 0)).where(
            TestCase.test_set_id == test_set_id
        )
    )
    return int(current_max or 0) + 1


@router.post(
    "/test-sets/{test_set_id}/cases",
    response_model=TestCaseRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_case(
    test_set_id: UUID,
    body: TestCaseCreate,
    db: AsyncSession = Depends(get_db),
) -> TestCaseRead:
    ts = await db.get(TestSet, test_set_id)
    if ts is None:
        raise HTTPException(status_code=404, detail="Test set not found")
    case = TestCase(
        test_set_id=test_set_id,
        input=body.input,
        category=body.category,
        expected_behavior=body.expected_behavior,
        position=await _next_position(db, test_set_id),
    )
    db.add(case)
    await db.commit()
    await db.refresh(case)
    return TestCaseRead.model_validate(case)


@router.post(
    "/test-sets/{test_set_id}/cases/bulk",
    response_model=CSVUploadResult,
)
async def bulk_upload_cases(
    test_set_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> CSVUploadResult:
    ts = await db.get(TestSet, test_set_id)
    if ts is None:
        raise HTTPException(status_code=404, detail="Test set not found")

    raw = await file.read()
    # Strip UTF-8 BOM (Excel-saved CSVs include it).
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))

    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV is empty or missing a header row.")
    headers = {h.strip() for h in reader.fieldnames}
    missing = REQUIRED_CSV_FIELDS - headers
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"CSV missing required headers: {sorted(missing)}",
        )

    rows: list[dict[str, str]] = []
    errors: list[CSVUploadRowError] = []
    for i, row in enumerate(reader, start=2):  # row 1 is the header
        cleaned = {k: (v or "").strip() for k, v in row.items() if k in ALL_CSV_FIELDS}
        if not cleaned.get("input"):
            errors.append(CSVUploadRowError(row=i, message="`input` is required"))
            continue
        if not cleaned.get("expected_behavior"):
            errors.append(
                CSVUploadRowError(row=i, message="`expected_behavior` is required")
            )
            continue
        rows.append(cleaned)

    if errors:
        # All-or-nothing: reject the entire upload so the user can fix the file
        # and retry without partial state.
        return CSVUploadResult(created=0, errors=errors)

    start_pos = await _next_position(db, test_set_id)
    for offset, r in enumerate(rows):
        db.add(
            TestCase(
                test_set_id=test_set_id,
                input=r["input"],
                category=r.get("category") or None,
                expected_behavior=r["expected_behavior"],
                position=start_pos + offset,
            )
        )
    await db.commit()
    return CSVUploadResult(created=len(rows), errors=[])


@router.patch("/test-cases/{case_id}", response_model=TestCaseRead)
async def update_case(
    case_id: UUID,
    body: TestCaseUpdate,
    db: AsyncSession = Depends(get_db),
) -> TestCaseRead:
    case = await db.get(TestCase, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Test case not found")
    if body.input is not None:
        case.input = body.input
    if body.category is not None:
        case.category = body.category
    if body.expected_behavior is not None:
        case.expected_behavior = body.expected_behavior
    await db.commit()
    await db.refresh(case)
    return TestCaseRead.model_validate(case)


@router.delete("/test-cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case(case_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    case = await db.get(TestCase, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Test case not found")
    await db.delete(case)
    await db.commit()
