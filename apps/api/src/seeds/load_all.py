"""Convenience loader that runs all demo seeds in one transaction-per-seed.

Used by:
- The "/seeds/all" endpoint (one click in the UI loads all three datasets).
- The lifespan hook in main.py that auto-seeds on every startup so a freshly
  deployed Render instance comes up with demo data ready.

Each individual seed function is idempotent (checks for an existing test set
by name), so calling this on every cold start is safe and cheap.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src.db import AsyncSessionLocal
from src.schemas import SeedLoadResult

from .code_review_v1 import seed_code_review_v1
from .mental_health_v1 import seed_mental_health_v1
from .sms_support_v1 import seed_sms_support_v1

logger = logging.getLogger(__name__)


async def seed_all_demo_data(db: AsyncSession) -> list[SeedLoadResult]:
    """Run every demo seeder. Returns one SeedLoadResult per seed in order."""
    return [
        await seed_sms_support_v1(db),
        await seed_code_review_v1(db),
        await seed_mental_health_v1(db),
    ]


async def auto_seed_on_startup() -> None:
    """Run every demo seeder using a fresh session. Designed to be called
    from FastAPI's lifespan. Logs but does not raise — a transient DB error
    on cold-start should never prevent the API from coming up."""
    try:
        async with AsyncSessionLocal() as db:
            results = await seed_all_demo_data(db)
        new_count = sum(1 for r in results if not r.already_loaded)
        if new_count:
            logger.info("auto_seed: created %d new seed(s)", new_count)
        else:
            logger.info("auto_seed: all demo seeds already present")
    except Exception:
        logger.exception("auto_seed failed; API will start without demo data")


async def _run_cli() -> None:
    async with AsyncSessionLocal() as db:
        results = await seed_all_demo_data(db)
        for r in results:
            label = "already loaded" if r.already_loaded else "loaded"
            print(f"{label} — test_set_id={r.test_set_id}")


if __name__ == "__main__":
    asyncio.run(_run_cli())
