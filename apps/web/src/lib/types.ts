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
