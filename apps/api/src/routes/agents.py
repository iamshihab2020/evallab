from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db
from src.deps import verify_api_key
from src.models import Agent, Run
from src.schemas import AgentCreate, AgentRead, AgentUpdate

router = APIRouter(
    prefix="/agents",
    tags=["agents"],
    dependencies=[Depends(verify_api_key)],
)


@router.get("", response_model=list[AgentRead])
async def list_agents(db: AsyncSession = Depends(get_db)) -> list[AgentRead]:
    stmt = select(Agent).order_by(Agent.created_at.desc())
    result = await db.execute(stmt)
    return [AgentRead.model_validate(a) for a in result.scalars().all()]


@router.post("", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
async def create_agent(body: AgentCreate, db: AsyncSession = Depends(get_db)) -> AgentRead:
    agent = Agent(
        name=body.name,
        system_prompt=body.system_prompt,
        model=body.model,
        temperature=body.temperature,
        max_tokens=body.max_tokens,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return AgentRead.model_validate(agent)


@router.get("/{agent_id}", response_model=AgentRead)
async def get_agent(agent_id: UUID, db: AsyncSession = Depends(get_db)) -> AgentRead:
    agent = await db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return AgentRead.model_validate(agent)


@router.patch("/{agent_id}", response_model=AgentRead)
async def update_agent(
    agent_id: UUID,
    body: AgentUpdate,
    db: AsyncSession = Depends(get_db),
) -> AgentRead:
    agent = await db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if body.name is not None:
        agent.name = body.name
    if body.system_prompt is not None:
        agent.system_prompt = body.system_prompt
    if body.model is not None:
        agent.model = body.model
    if body.temperature is not None:
        agent.temperature = body.temperature
    if body.max_tokens is not None:
        agent.max_tokens = body.max_tokens
    await db.commit()
    await db.refresh(agent)
    return AgentRead.model_validate(agent)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    agent = await db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    run_count = await db.scalar(
        select(func.count(Run.id)).where(Run.agent_id == agent_id)
    )
    if run_count and run_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete agent with {run_count} existing run(s).",
        )
    await db.delete(agent)
    await db.commit()
