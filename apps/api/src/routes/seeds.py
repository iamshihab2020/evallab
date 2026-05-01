from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db
from src.deps import verify_api_key
from src.schemas import SeedLoadResult
from src.seeds.code_review_v1 import seed_code_review_v1
from src.seeds.load_all import seed_all_demo_data
from src.seeds.mental_health_v1 import seed_mental_health_v1
from src.seeds.sms_support_v1 import seed_sms_support_v1

router = APIRouter(prefix="/seeds", tags=["seeds"], dependencies=[Depends(verify_api_key)])


@router.post("/sms-support-v1", response_model=SeedLoadResult)
async def load_sms_support_v1(db: AsyncSession = Depends(get_db)) -> SeedLoadResult:
    return await seed_sms_support_v1(db)


@router.post("/code-review-v1", response_model=SeedLoadResult)
async def load_code_review_v1(db: AsyncSession = Depends(get_db)) -> SeedLoadResult:
    return await seed_code_review_v1(db)


@router.post("/mental-health-v1", response_model=SeedLoadResult)
async def load_mental_health_v1(db: AsyncSession = Depends(get_db)) -> SeedLoadResult:
    return await seed_mental_health_v1(db)


@router.post("/all", response_model=list[SeedLoadResult])
async def load_all(db: AsyncSession = Depends(get_db)) -> list[SeedLoadResult]:
    """Run every demo seeder in one request. Each seed is idempotent."""
    return await seed_all_demo_data(db)
