from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db
from src.deps import verify_api_key
from src.schemas import SeedLoadResult
from src.seeds.sms_support_v1 import seed_sms_support_v1

router = APIRouter(prefix="/seeds", tags=["seeds"], dependencies=[Depends(verify_api_key)])


@router.post("/sms-support-v1", response_model=SeedLoadResult)
async def load_sms_support_v1(db: AsyncSession = Depends(get_db)) -> SeedLoadResult:
    return await seed_sms_support_v1(db)
