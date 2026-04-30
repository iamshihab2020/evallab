// Mirrors apps/api/src/schemas.py.

export type HealthResponse = {
  status: string;
  version: string;
};

// --- Test cases ---

export type TestCase = {
  id: string;
  test_set_id: string;
  input: string;
  category: string | null;
  expected_behavior: string;
  position: number;
  created_at: string;
};

export type TestCaseCreateInput = {
  input: string;
  category?: string | null;
  expected_behavior: string;
};

export type TestCaseUpdateInput = Partial<TestCaseCreateInput>;

// --- Test sets ---

export type TestSet = {
  id: string;
  name: string;
  description: string | null;
  case_count: number;
  created_at: string;
  updated_at: string;
};

export type TestSetDetail = TestSet & {
  cases: TestCase[];
};

export type TestSetCreateInput = {
  name: string;
  description?: string | null;
};

export type TestSetUpdateInput = Partial<TestSetCreateInput>;

// --- Agents ---

export type Agent = {
  id: string;
  name: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  created_at: string;
  updated_at: string;
};

export type AgentCreateInput = {
  name: string;
  system_prompt: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
};

export type AgentUpdateInput = Partial<AgentCreateInput>;

// --- CSV ---

export type CSVUploadResult = {
  created: number;
  errors: { row: number; message: string }[];
};

// --- Seed ---

export type SeedLoadResult = {
  already_loaded: boolean;
  test_set_id: string | null;
  agent_ids: string[];
};

// --- Debug ---

export type DebugTestPromptResult = {
  output: string;
  latency_ms: number;
  model_used: string;
};

// --- Runs ---

export type RunStatus = "pending" | "running" | "completed" | "failed";

export type Run = {
  id: string;
  test_set_id: string;
  agent_id: string;
  judge_model: string;
  status: RunStatus;
  started_at: string;
  completed_at: string | null;
  total_cases: number;
  completed_cases: number;
  errored_cases: number;
  error: string | null;
};

export type RunListItem = Run & {
  test_set_name: string;
  agent_name: string;
  pass_rate: number | null;
};

export type CaseResult = {
  id: string;
  run_id: string;
  test_case_id: string;
  agent_prompt_sent: string | null;
  agent_output: string | null;
  agent_latency_ms: number | null;
  judge_prompt_sent: string | null;
  judge_score: number | null;
  judge_reasoning: string | null;
  judge_latency_ms: number | null;
  error: string | null;
  created_at: string;
};

export type WorstCase = {
  case_result_id: string;
  test_case_id: string;
  input: string;
  judge_score: number;
  judge_reasoning: string | null;
};

export type CategoryStat = {
  count: number;
  pass_rate: number;
  avg_score: number;
};

export type RunStats = {
  total_cases: number;
  successful_cases: number;
  errored_cases: number;
  pass_rate: number;
  avg_score: number;
  score_distribution: Record<string, number>;
  per_category: Record<string, CategoryStat>;
  worst_cases: WorstCase[];
};

export type FailureCluster = {
  theme: string;
  summary: string;
  case_result_ids: string[];
};

export type RunDetail = Run & {
  test_set_name: string;
  agent_name: string;
  case_results: CaseResult[];
  stats: RunStats | null;
  failure_clusters: FailureCluster[] | null;
};

export type CompareInsight = {
  summary: string;
  improved_themes: string[];
  regressed_themes: string[];
};

export type RunStartInput = {
  test_set_id: string;
  agent_id: string;
  judge_model?: string;
};

export type RunCompare = {
  run_a: RunDetail;
  run_b: RunDetail;
  pass_rate_delta: number;
  cases_improved: string[];
  cases_regressed: string[];
  cases_unchanged: string[];
  cases_errored: string[];
};
