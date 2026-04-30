from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.db import get_db
from src.deps import verify_api_key
from src.models import Agent, AgentVersion, Run
from src.schemas import AgentCreate, AgentRead, AgentUpdate, AgentVersionRead

router = APIRouter(
    prefix="/agents",
    tags=["agents"],
    dependencies=[Depends(verify_api_key)],
)

# Fields whose change creates a new version. Name changes do NOT bump version.
VERSIONED_FIELDS = ("system_prompt", "model", "temperature", "max_tokens")


def _agent_to_read(agent: Agent) -> AgentRead:
    current_version = max((v.version for v in agent.versions), default=1)
    data = AgentRead.model_validate(agent).model_dump()
    data["current_version"] = current_version
    return AgentRead.model_validate(data)


def _next_version(agent: Agent) -> int:
    return max((v.version for v in agent.versions), default=0) + 1


def _make_version(agent: Agent, version: int) -> AgentVersion:
    return AgentVersion(
        agent_id=agent.id,
        version=version,
        system_prompt=agent.system_prompt,
        model=agent.model,
        temperature=agent.temperature,
        max_tokens=agent.max_tokens,
    )


@router.get("", response_model=list[AgentRead])
async def list_agents(db: AsyncSession = Depends(get_db)) -> list[AgentRead]:
    stmt = (
        select(Agent)
        .options(selectinload(Agent.versions))
        .order_by(Agent.created_at.desc())
    )
    result = await db.execute(stmt)
    return [_agent_to_read(a) for a in result.scalars().all()]


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
    await db.flush()  # so agent.id is available for the version row
    db.add(_make_version(agent, version=1))
    await db.commit()
    agent = await db.scalar(
        select(Agent).options(selectinload(Agent.versions)).where(Agent.id == agent.id),
    )
    assert agent is not None
    return _agent_to_read(agent)


@router.get("/{agent_id}", response_model=AgentRead)
async def get_agent(agent_id: UUID, db: AsyncSession = Depends(get_db)) -> AgentRead:
    agent = await db.scalar(
        select(Agent).options(selectinload(Agent.versions)).where(Agent.id == agent_id),
    )
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _agent_to_read(agent)


@router.get("/{agent_id}/versions", response_model=list[AgentVersionRead])
async def list_agent_versions(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> list[AgentVersionRead]:
    agent = await db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    stmt = (
        select(AgentVersion)
        .where(AgentVersion.agent_id == agent_id)
        .order_by(AgentVersion.version.desc())
    )
    versions = (await db.execute(stmt)).scalars().all()
    return [AgentVersionRead.model_validate(v) for v in versions]


@router.patch("/{agent_id}", response_model=AgentRead)
async def update_agent(
    agent_id: UUID,
    body: AgentUpdate,
    db: AsyncSession = Depends(get_db),
) -> AgentRead:
    agent = await db.scalar(
        select(Agent).options(selectinload(Agent.versions)).where(Agent.id == agent_id),
    )
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Detect whether any prompt-shaping field actually changes.
    bumps_version = False
    for field in VERSIONED_FIELDS:
        new_value = getattr(body, field, None)
        if new_value is None:
            continue
        if getattr(agent, field) != new_value:
            bumps_version = True
            break

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

    if bumps_version:
        db.add(_make_version(agent, version=_next_version(agent)))

    await db.commit()
    agent = await db.scalar(
        select(Agent).options(selectinload(Agent.versions)).where(Agent.id == agent_id),
    )
    assert agent is not None
    return _agent_to_read(agent)


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
