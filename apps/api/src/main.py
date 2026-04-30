from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.routes import agents, calibration, debug, health, runs, seeds, test_cases, test_sets
from src.routes.runs import heal_orphaned_runs


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await heal_orphaned_runs()
    yield


app = FastAPI(title="EvalLab API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(test_sets.router, prefix="/api/v1")
app.include_router(test_cases.router, prefix="/api/v1")
app.include_router(agents.router, prefix="/api/v1")
app.include_router(seeds.router, prefix="/api/v1")
app.include_router(debug.router, prefix="/api/v1")
app.include_router(runs.router, prefix="/api/v1")
app.include_router(calibration.router, prefix="/api/v1")
