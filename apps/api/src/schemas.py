from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# --- Test cases ---


class TestCaseBase(BaseModel):
    input: str = Field(..., min_length=1)
    category: str | None = None
    expected_behavior: str = Field(..., min_length=1)


class TestCaseCreate(TestCaseBase):
    pass


class TestCaseUpdate(BaseModel):
    input: str | None = Field(default=None, min_length=1)
    category: str | None = None
    expected_behavior: str | None = Field(default=None, min_length=1)


class TestCaseRead(TestCaseBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    test_set_id: UUID
    position: int
    created_at: datetime


# --- Test sets ---


class TestSetCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: str | None = None


class TestSetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None


class TestSetRead(BaseModel):
    """List/summary read model. Includes `updated_at` even though SPEC §"Pydantic schemas"
    omits it — the model has the column and the UI renders "last edited"."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    case_count: int
    created_at: datetime
    updated_at: datetime


class TestSetDetail(TestSetRead):
    cases: list[TestCaseRead]


# --- Agents ---


class AgentBase(BaseModel):
    name: str = Field(..., min_length=1)
    system_prompt: str = Field(..., min_length=1)
    model: str = "llama-3.3-70b-versatile"
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=512, ge=1, le=8192)


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    system_prompt: str | None = Field(default=None, min_length=1)
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1, le=8192)


class AgentRead(AgentBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


# --- CSV bulk upload ---


class CSVUploadRowError(BaseModel):
    row: int
    message: str


class CSVUploadResult(BaseModel):
    created: int
    errors: list[CSVUploadRowError] = []


# --- Seed loader ---


class SeedLoadResult(BaseModel):
    already_loaded: bool
    test_set_id: UUID | None = None
    agent_ids: list[UUID] = []
