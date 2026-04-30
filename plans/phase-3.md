# Phase 3 — Single-Case (LLM client + judge + debug tool)

Maps to [SPEC.md §"Stage 3: Single-Case"](../SPEC.md). Phase 2 made the data layer real; this phase makes one LLM call work end-to-end with rate limiting, retries, and the judge. Sets up the primitives Phase 4 will compose into a full run.

## Goal

User can paste an input on the agent detail page, click "Test Prompt", and see the agent's reply with latency. Backend respects 28 RPM and retries on 429.

## Sub-phases

### 3.1 — Settings + dependencies

**Goal:** Groq client wiring + new deps installed.

- Confirm `openai` already in `pyproject.toml` from Phase 1; if not, add and `uv sync`.
- Confirm `settings.GROQ_API_KEY` is required at runtime by the LLM client (raises clear error on first call if missing).
- Add `dev`-only dep `pytest` + `pytest-asyncio` for the rate-limiter unit test.

### 3.2 — Token-bucket rate limiter

**Goal:** module-level singleton enforcing ≤28 RPM globally across all callers.

- `apps/api/src/services/__init__.py` (empty).
- `apps/api/src/services/llm.py`:
  - `class RateLimiter` per SPEC §"The LLM client": `acquire()` waits until <28 calls in the trailing 60s; `_lock = asyncio.Lock()`; `_timestamps: list[float]` using `time.monotonic()`.
  - Module-level: `_rate_limiter = RateLimiter(rpm=28)`.
- Unit test `tests/test_rate_limiter.py`: configure `RateLimiter(rpm=3)`, fire 4 acquires concurrently, assert the 4th call returns ≥ ~60s after the first. (Don't run a real-rate variant in CI — too slow.)

**Verify:** unit test passes; logs show pacing during a burst.

### 3.3 — Groq client wrapper

**Goal:** one `call_llm()` function: rate-limited, retried on 429, returns `(content, latency_ms)`.

- In `services/llm.py`:
  - `_client = AsyncOpenAI(api_key=settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")`.
  - `async def call_llm(*, model, system, user, temperature=0.7, max_tokens=512, response_format=None) -> tuple[str, int]`:
    1. `await _rate_limiter.acquire()`.
    2. Loop attempts 0..3, exponential backoff 1/2/4/8 on `RateLimitError`.
    3. Measure latency with `time.monotonic()`.
    4. Return `(content or "", latency_ms)`.
- Log each attempt at INFO with `model`, `attempt`, `latency_ms` (or the 429 + backoff).

**Verify:** quick scratch script calls `call_llm` once against Groq → returns within ~1–2s; intentionally pump 35 calls → observe 429-retry path or rate-limiter waits.

### 3.4 — Judge service

**Goal:** `judge_response()` returns `(score, reasoning, full_prompt_sent, latency_ms)`, retries once on JSON parse failure.

- `apps/api/src/services/judge.py`:
  - `JUDGE_SYSTEM` and `JUDGE_USER_TEMPLATE` constants exactly per SPEC §"The judge service".
  - `async def judge_response(*, model, input, agent_output, expected_behavior)`:
    - Builds `user` from template, builds `full_prompt` string for storage.
    - Two attempts: first with `JUDGE_SYSTEM`, second with `JUDGE_SYSTEM + reminder` if first fails JSON parse.
    - Calls `call_llm` with `temperature=0.0`, `max_tokens=200`, `response_format={"type":"json_object"}`.
    - Validates score ∈ {1..5}, reasoning is str.
    - Raises `RuntimeError` with last error details after both attempts fail.

**Verify:** unit test with a stubbed `call_llm` that returns malformed JSON first, valid JSON second → `judge_response` returns the parsed result. With both malformed → raises.

### 3.5 — Debug endpoint

**Goal:** `POST /api/v1/debug/test-prompt` runs one agent call (no judge, no DB write).

- `apps/api/src/routes/debug.py`:
  - Schema: `DebugTestPromptIn { agent_id: UUID | None, system_prompt: str | None, model: str | None, temperature: float | None, max_tokens: int | None, input: str }`. Validator: either `agent_id` OR all of `(system_prompt, model)` must be supplied.
  - `POST /debug/test-prompt`: load agent or use inline values, call `call_llm`, return `{ output, latency_ms, model_used }`.
- Wire into `main.py`. Uses `verify_api_key` dep.

**Verify:** call with seed agent v1 + a refund case input → returns a plausible reply within ~1–2s. Latency reported. Two rapid calls don't violate the limiter.

### 3.6 — Frontend: "Test Prompt" tool on agent detail

**Goal:** inline tool on `/agents/[id]` to sanity-check a prompt.

- Section in `app/agents/[id]/page.tsx`:
  - Heading "Test Prompt".
  - `Textarea` for input (multi-line).
  - "Run" button — disabled while pending. Mutation calls `POST /debug/test-prompt` with `{ agent_id, input }`.
  - Result panel: agent output (pre-formatted), latency_ms badge.
  - Error states: 401 → toast "Set NEXT_PUBLIC_API_KEY"; 429-after-retries → toast with the backend message.
  - Note (small text): *"One Groq call per click; counts toward your daily 1k-request quota."*

**Verify:** open agent v1 → paste "i want a refund for #12345" → see reply + latency. Spam-click 5 times in 10s → no errors, latency stays consistent.

### 3.7 — End-to-end verification & commit

- Manual: hit `/debug/test-prompt` with each seed agent against 3 different seed cases; outputs look reasonable.
- Judge integration testing happens in Phase 4 once the runner exists. For Phase 3, the unit test in 3.4 (stubbed `call_llm` + parse-retry) is enough confidence — no temp debug routes.
- Rate-limiter unit test green; mypy clean; `pnpm build` clean.
- Per CLAUDE.md rule #1: surface a one-line summary + commit message (e.g., `feat: groq client with rate limiter + judge service + test-prompt tool`) in chat, then stop. Do NOT run `git commit`.

## Things NOT in Phase 3

- No DB writes for debug calls (deliberate — keeps quota usage debuggable without polluting `case_results`).
- No `services/runner.py` (Phase 4).
- No `services/stats.py` (Phase 4).
- No streaming / SSE (Phase 7).
