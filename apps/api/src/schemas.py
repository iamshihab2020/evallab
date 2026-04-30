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


# --- Debug: test-prompt ---


class DebugTestPromptIn(BaseModel):
    agent_id: UUID | None = None
    system_prompt: str | None = None
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=8192)
    input: str = Field(..., min_length=1)

    def validate_target(self) -> None:
        if self.agent_id is None:
            if not (self.system_prompt and self.model):
                raise ValueError(
                    "Provide either agent_id, or both system_prompt and model.",
                )


class DebugTestPromptOut(BaseModel):
    output: str
    latency_ms: int
    model_used: str


# --- Runs ---


class RunStart(BaseModel):
    test_set_id: UUID
    agent_id: UUID
    judge_model: str = "llama-3.3-70b-versatile"


class CaseResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_id: UUID
    test_case_id: UUID
    agent_prompt_sent: str | None
    agent_output: str | None
    agent_latency_ms: int | None
    judge_prompt_sent: str | None
    judge_score: int | None
    judge_reasoning: str | None
    judge_latency_ms: int | None
    error: str | None
    created_at: datetime


class WorstCase(BaseModel):
    case_result_id: UUID
    test_case_id: UUID
    input: str
    judge_score: int
    judge_reasoning: str | None


class CategoryStat(BaseModel):
    count: int
    pass_rate: float
    avg_score: float


class RunStats(BaseModel):
    total_cases: int
    successful_cases: int
    errored_cases: int
    pass_rate: float
    avg_score: float
    score_distribution: dict[int, int]
    per_category: dict[str, CategoryStat]
    worst_cases: list[WorstCase]


class RunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    test_set_id: UUID
    agent_id: UUID
    judge_model: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    total_cases: int
    completed_cases: int
    errored_cases: int
    error: str | None


class RunListItem(BaseModel):
    """List shape extends SPEC with denormalized names + computed pass_rate."""

    id: UUID
    test_set_id: UUID
    test_set_name: str
    agent_id: UUID
    agent_name: str
    judge_model: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    total_cases: int
    completed_cases: int
    errored_cases: int
    pass_rate: float | None


class RunDetail(RunRead):
    test_set_name: str
    agent_name: str
    case_results: list[CaseResultRead]
    stats: RunStats | None


class RunCompare(BaseModel):
    run_a: RunDetail
    run_b: RunDetail
    pass_rate_delta: float
    cases_improved: list[UUID]
    cases_regressed: list[UUID]
    cases_unchanged: list[UUID]
    cases_errored: list[UUID]
