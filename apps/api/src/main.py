from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.routes import agents, debug, health, seeds, test_cases, test_sets

app = FastAPI(title="EvalLab API", version="1.0.0")

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
