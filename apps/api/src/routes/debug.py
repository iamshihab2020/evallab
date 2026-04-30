"""Debug endpoints for sanity-checking prompts. No DB writes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db
from src.deps import verify_api_key
from src.models import Agent
from src.schemas import DebugTestPromptIn, DebugTestPromptOut
from src.services.llm import call_llm

router = APIRouter(
    prefix="/debug",
    tags=["debug"],
    dependencies=[Depends(verify_api_key)],
)


@router.post("/test-prompt", response_model=DebugTestPromptOut)
async def test_prompt(
    body: DebugTestPromptIn,
    db: AsyncSession = Depends(get_db),
) -> DebugTestPromptOut:
    try:
        body.validate_target()
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e

    if body.agent_id is not None:
        agent = await db.get(Agent, body.agent_id)
        if agent is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
        system = agent.system_prompt
        model = agent.model
        temperature = body.temperature if body.temperature is not None else agent.temperature
        max_tokens = body.max_tokens if body.max_tokens is not None else agent.max_tokens
    else:
        assert body.system_prompt is not None and body.model is not None  # validate_target
        system = body.system_prompt
        model = body.model
        temperature = body.temperature if body.temperature is not None else 0.7
        max_tokens = body.max_tokens if body.max_tokens is not None else 512

    try:
        output, latency_ms = await call_llm(
            model=model,
            system=system,
            user=body.input,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except RuntimeError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e)) from e

    return DebugTestPromptOut(output=output, latency_ms=latency_ms, model_used=model)
