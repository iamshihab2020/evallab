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
    domain_context: str | None = None


class TestSetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    domain_context: str | None = None


class TestSetRead(BaseModel):
    """List/summary read model. Includes `updated_at` even though SPEC §"Pydantic schemas"
    omits it — the model has the column and the UI renders "last edited"."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    domain_context: str | None
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
    current_version: int = 1


class AgentVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    agent_id: UUID
    version: int
    system_prompt: str
    model: str
    temperature: float
    max_tokens: int
    created_at: datetime


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
    agent_version_id: UUID | None = None
    judge_model: str = "llama-3.3-70b-versatile"


class HumanScoreUpsert(BaseModel):
    score: int = Field(..., ge=1, le=5)
    note: str | None = None


class HumanScoreRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    case_result_id: UUID
    score: int
    note: str | None
    created_at: datetime
    updated_at: datetime


class CaseResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_id: UUID
    test_case_id: UUID
    agent_prompt_sent: str | None
    agent_output: str | None
    agent_latency_ms: int | None
    agent_input_tokens: int | None = None
    agent_output_tokens: int | None = None
    judge_prompt_sent: str | None
    judge_score: int | None
    judge_reasoning: str | None
    judge_latency_ms: int | None
    judge_input_tokens: int | None = None
    judge_output_tokens: int | None = None
    dim_accuracy: int | None = None
    dim_completeness: int | None = None
    dim_tone: int | None = None
    dim_safety: int | None = None
    error: str | None
    created_at: datetime
    human_score: HumanScoreRead | None = None


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
    # Per-dimension averages over successful cases that have all 4 dim columns
    # populated. None for older runs that pre-date dimensional scoring.
    per_dimension: dict[str, float] | None = None
    # Token + cost rollups. Sum across all case_results (including errored ones
    # that already spent agent tokens before the judge failed) so the dollar
    # figure reflects what the run actually cost.
    tokens_in: int = 0
    tokens_out: int = 0
    tokens_total: int = 0
    estimated_cost_usd: float = 0.0


class RunUsage(BaseModel):
    """Daily quota meter aggregating token spend across today's runs."""

    tokens_in_today: int
    tokens_out_today: int
    tokens_total_today: int
    runs_today: int
    daily_quota_tokens: int = 100_000
    percent_used: float


class RunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    test_set_id: UUID
    agent_id: UUID
    agent_version_id: UUID | None = None
    agent_version: int | None = None
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
    agent_version: int | None = None
    judge_model: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    total_cases: int
    completed_cases: int
    errored_cases: int
    pass_rate: float | None


class FailureCluster(BaseModel):
    theme: str
    summary: str
    case_result_ids: list[UUID]


class RunDetail(RunRead):
    test_set_name: str
    test_set_domain_context: str | None = None
    agent_name: str
    case_results: list[CaseResultRead]
    stats: RunStats | None
    failure_clusters: list[FailureCluster] | None = None


class CompareInsightContent(BaseModel):
    summary: str
    improved_themes: list[str]
    regressed_themes: list[str]


class CalibrationItem(BaseModel):
    case_result_id: UUID
    judge_score: int
    human_score: int
    agree: bool


class RunCalibration(BaseModel):
    """Judge-vs-human agreement metrics for a single run."""

    total_cases: int
    scored_cases: int
    percent_agreement: float
    cohens_kappa: float | None
    confusion_matrix: dict[int, dict[int, int]]
    items: list[CalibrationItem]


class RunCompare(BaseModel):
    run_a: RunDetail
    run_b: RunDetail
    pass_rate_delta: float
    cases_improved: list[UUID]
    cases_regressed: list[UUID]
    cases_unchanged: list[UUID]
    cases_errored: list[UUID]
    insight: CompareInsightContent | None = None
