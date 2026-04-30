from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.db import get_db
from src.deps import verify_api_key
from src.models import TestCase, TestSet
from src.schemas import TestCaseRead, TestSetCreate, TestSetDetail, TestSetRead, TestSetUpdate

router = APIRouter(
    prefix="/test-sets",
    tags=["test-sets"],
    dependencies=[Depends(verify_api_key)],
)


def _to_read(ts: TestSet, case_count: int) -> TestSetRead:
    return TestSetRead(
        id=ts.id,
        name=ts.name,
        description=ts.description,
        domain_context=ts.domain_context,
        case_count=case_count,
        created_at=ts.created_at,
        updated_at=ts.updated_at,
    )


@router.get("", response_model=list[TestSetRead])
async def list_test_sets(db: AsyncSession = Depends(get_db)) -> list[TestSetRead]:
    case_count_subq = (
        select(TestCase.test_set_id, func.count(TestCase.id).label("c"))
        .group_by(TestCase.test_set_id)
        .subquery()
    )
    stmt = (
        select(TestSet, func.coalesce(case_count_subq.c.c, 0))
        .outerjoin(case_count_subq, case_count_subq.c.test_set_id == TestSet.id)
        .order_by(TestSet.created_at.desc())
    )
    result = await db.execute(stmt)
    return [_to_read(ts, count) for ts, count in result.all()]


@router.post("", response_model=TestSetRead, status_code=status.HTTP_201_CREATED)
async def create_test_set(
    body: TestSetCreate, db: AsyncSession = Depends(get_db)
) -> TestSetRead:
    ts = TestSet(
        name=body.name,
        description=body.description,
        domain_context=body.domain_context,
    )
    db.add(ts)
    await db.commit()
    await db.refresh(ts)
    return _to_read(ts, case_count=0)


@router.get("/{test_set_id}", response_model=TestSetDetail)
async def get_test_set(
    test_set_id: UUID, db: AsyncSession = Depends(get_db)
) -> TestSetDetail:
    stmt = (
        select(TestSet)
        .options(selectinload(TestSet.cases))
        .where(TestSet.id == test_set_id)
    )
    ts = (await db.execute(stmt)).scalar_one_or_none()
    if ts is None:
        raise HTTPException(status_code=404, detail="Test set not found")
    return TestSetDetail(
        id=ts.id,
        name=ts.name,
        description=ts.description,
        domain_context=ts.domain_context,
        case_count=len(ts.cases),
        created_at=ts.created_at,
        updated_at=ts.updated_at,
        cases=[TestCaseRead.model_validate(c) for c in ts.cases],
    )


@router.patch("/{test_set_id}", response_model=TestSetRead)
async def update_test_set(
    test_set_id: UUID,
    body: TestSetUpdate,
    db: AsyncSession = Depends(get_db),
) -> TestSetRead:
    ts = await db.get(TestSet, test_set_id)
    if ts is None:
        raise HTTPException(status_code=404, detail="Test set not found")
    if body.name is not None:
        ts.name = body.name
    if body.description is not None:
        ts.description = body.description
    if body.domain_context is not None:
        ts.domain_context = body.domain_context
    await db.commit()
    await db.refresh(ts)
    count = await db.scalar(
        select(func.count(TestCase.id)).where(TestCase.test_set_id == test_set_id)
    )
    return _to_read(ts, count or 0)


@router.delete("/{test_set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test_set(
    test_set_id: UUID, db: AsyncSession = Depends(get_db)
) -> None:
    ts = await db.get(TestSet, test_set_id)
    if ts is None:
        raise HTTPException(status_code=404, detail="Test set not found")
    await db.delete(ts)
    await db.commit()
