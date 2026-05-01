# EvalLab — Build Spec (v2)

> A web app for evaluating LLM outputs systematically. Built as a public portfolio project to demonstrate LLM evaluation pipeline engineering.
>
> **This is the second version of this spec.** It bakes in all the gap fixes from a careful review: rate-limit handling, concurrency, JSON-parse retry, cold-start UX, error semantics, timezone handling, full-prompt visibility, and export. Hand it to Claude Code in an empty repo and ask it to implement section by section, asking for confirmation before each major step.

---

## How to use this spec

**For the human (Shihab):**
1. Create an empty GitHub repo called `evallab`
2. Clone it locally
3. Open Claude Code in that folder
4. Save this file as `SPEC.md` in the repo root before starting
5. Tell Claude Code: *"Read `SPEC.md` and implement Stage 1 only. Confirm with me before moving to each next stage."*

**For Claude Code:**
- Build in stages. Don't try to ship everything at once.
- After each stage, confirm with the human and wait for them to test before moving on.
- If something in the spec is ambiguous, ask rather than guessing.
- Keep code clean and readable over clever. This is a portfolio piece — the human will be asked to walk through the code in interviews.
- Pay particular attention to the **constraints** sections — they exist because the free-tier infrastructure has specific quirks (Render cold starts, Groq 30 RPM, etc.) that shape architectural decisions.

---

## What we're building

A web app where a user can:

1. Define a **test set** — a list of test cases for an LLM (input + expected behavior notes)
2. Define an **agent** — a prompt + model that responds to inputs
3. **Run** the agent against the test set, scoring each output with an LLM-as-judge
4. View **results** — pass rate, per-category breakdown, worst failures, full prompt traces
5. **Compare** two runs side-by-side (e.g., prompt v1 vs v2)
6. **Export** results as Markdown

That's the whole product. No auth, no users, no multi-tenant. One person uses it locally or on the deployed URL. Simple. Public.

---

## Stack (chosen, do not deviate)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + TailwindCSS + shadcn/ui |
| Backend | FastAPI (Python 3.11+) with `uv` for package management |
| Database | PostgreSQL (Neon for production, local Postgres or SQLite for dev) |
| ORM | SQLAlchemy 2.0 + Alembic for migrations |
| LLM provider | Groq API (free tier, no credit card) |
| Default model | `llama-3.3-70b-versatile` (for both agent-under-test and judge) |
| Frontend hosting | Vercel |
| Backend hosting | Render free tier |
| Database hosting | Neon free tier |
| State management | TanStack Query (React Query v5) |
| Forms | React Hook Form + Zod |
| Icons | Lucide React |

**Auth model:** No user accounts. If `EVALLAB_API_KEY` env var is set on the backend, every request must send `X-API-Key: <key>` header. If unset, no auth check (local dev). Frontend reads the key from `NEXT_PUBLIC_API_KEY` and includes it in every API call.

---

## Free-tier constraints (READ THIS BEFORE BUILDING)

These constraints shape the architecture. Don't fight them.

### Groq free tier limits (as of 2026)

For `llama-3.3-70b-versatile`:
- **30 requests per minute (RPM)** — this is the tightest constraint
- **6,000 tokens per minute (TPM)**
- **1,000 requests per day (RPD)**
- **100,000 tokens per day (TPD)**
- Returns HTTP 429 when exceeded
- Response headers `x-ratelimit-remaining-requests` and `x-ratelimit-remaining-tokens` available

**What this means for EvalLab:**
- A 30-case run = 30 agent calls + 30 judge calls = 60 calls
- At 30 RPM max, a run takes a *minimum* of 2 minutes if perfectly paced
- A daily cap of 1,000 requests = ~16 full 30-case runs per day. Plenty for one user, fine for a portfolio piece.

**The runner must respect 30 RPM with a token-bucket rate limiter, AND retry on 429 with exponential backoff as a safety net.** See `services/llm.py` and `services/runner.py` below.

### Render free tier behavior

- Free web services **spin down after 15 minutes of inactivity**
- Cold start to wake takes **30–90 seconds**
- The first API call after a cold start will hang during this window

**What this means for EvalLab:**
- The frontend must handle cold starts gracefully. See "Cold-start UX" in the frontend section.
- The first user interaction on the deployed URL fires `/health` immediately to begin warming the backend.

### Neon free tier behavior

- Free Postgres databases auto-suspend after **5 minutes of inactivity** on the free plan
- Wake-up is fast (~1–3 seconds), much faster than Render
- Don't worry about this — it's invisible in normal use

---

## Repo structure

```
evallab/
├── README.md                  # Public-facing readme — see Stage 6
├── SPEC.md                    # This file
├── .gitignore
├── docker-compose.yml         # Local Postgres for dev
├── apps/
│   ├── web/                   # Next.js frontend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── next.config.mjs
│   │   └── src/
│   │       ├── app/
│   │       │   ├── page.tsx                    # Home/dashboard
│   │       │   ├── test-sets/
│   │       │   │   ├── page.tsx
│   │       │   │   ├── new/page.tsx
│   │       │   │   └── [id]/page.tsx
│   │       │   ├── agents/
│   │       │   │   ├── page.tsx
│   │       │   │   ├── new/page.tsx
│   │       │   │   └── [id]/page.tsx           # Includes "Test prompt" tool
│   │       │   ├── runs/
│   │       │   │   ├── page.tsx
│   │       │   │   ├── new/page.tsx
│   │       │   │   └── [id]/page.tsx
│   │       │   ├── compare/
│   │       │   │   └── page.tsx
│   │       │   └── layout.tsx
│   │       ├── components/
│   │       │   ├── ui/                         # shadcn components
│   │       │   ├── nav.tsx
│   │       │   ├── wake-up-banner.tsx          # Cold-start UX
│   │       │   ├── score-bar.tsx               # Score distribution chart
│   │       │   └── case-result-card.tsx
│   │       ├── lib/
│   │       │   ├── api.ts                      # fetch wrapper with X-API-Key
│   │       │   ├── types.ts
│   │       │   └── utils.ts
│   │       └── ...
│   └── api/                   # FastAPI backend
│       ├── pyproject.toml
│       ├── alembic.ini
│       ├── alembic/
│       │   └── versions/
│       └── src/
│           ├── main.py                         # FastAPI entry, CORS, routers
│           ├── config.py                       # pydantic-settings
│           ├── db.py                           # SQLAlchemy session + engine
│           ├── deps.py                         # FastAPI deps (db, api-key check)
│           ├── models.py                       # SQLAlchemy ORM models
│           ├── schemas.py                      # Pydantic schemas
│           ├── routes/
│           │   ├── test_sets.py
│           │   ├── agents.py
│           │   ├── runs.py
│           │   ├── debug.py                    # /debug/test-prompt
│           │   └── health.py
│           ├── services/
│           │   ├── llm.py                      # Groq + rate limit + 429 retry
│           │   ├── judge.py                    # LLM-as-judge with JSON retry
│           │   ├── runner.py                   # Concurrent run orchestration
│           │   ├── stats.py
│           │   └── exporter.py                 # Markdown export
│           └── seeds/
│               └── sms_support_v1.py
└── .github/
    └── workflows/
```

Two independent apps in one repo. No pnpm workspaces (Python and TS don't share packages).

---

## Database schema

SQLAlchemy 2.0 declarative + Alembic. Use `timestamptz` (PostgreSQL `TIMESTAMP WITH TIME ZONE`) for ALL timestamps so the frontend can render in the user's local timezone via `Intl.DateTimeFormat`.

**Why UUIDs:** primary keys are UUID v4. URLs aren't enumerable (recruiters can't guess `/runs/2`), and future "share a run publicly" features become safe by default.

### `test_sets`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | Default `uuid_generate_v4()` |
| name | str(255) | "SMS Customer Support v1" |
| description | text, nullable | |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

### `test_cases`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| test_set_id | FK → test_sets.id | Cascade delete |
| input | text | Customer message / prompt input |
| category | str(64), nullable | "refund", "complaint", "qa", etc. |
| expected_behavior | text | What a good response should look like |
| position | int | Display order; auto-assign on insert |
| created_at | timestamptz | |

### `agents`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | str(255) | |
| system_prompt | text | |
| model | str(64) | Default "llama-3.3-70b-versatile" |
| temperature | float | Default 0.7 |
| max_tokens | int | Default 512 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `runs`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| test_set_id | FK | |
| agent_id | FK | |
| judge_model | str(64) | Default "llama-3.3-70b-versatile" |
| status | str(16) | `pending`, `running`, `completed`, `failed` |
| started_at | timestamptz | |
| completed_at | timestamptz, nullable | |
| total_cases | int | Snapshotted at run-start |
| completed_cases | int | Default 0 |
| errored_cases | int | Default 0 |
| error | text, nullable | Run-level error if status='failed' |

### `case_results`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| run_id | FK | Cascade delete |
| test_case_id | FK | |
| agent_prompt_sent | text, nullable | **Full prompt sent to the agent** |
| agent_output | text, nullable | |
| agent_latency_ms | int, nullable | |
| judge_prompt_sent | text, nullable | **Full prompt sent to the judge** |
| judge_score | int, nullable | 1–5 |
| judge_reasoning | text, nullable | |
| judge_latency_ms | int, nullable | |
| error | text, nullable | If anything failed for this case |
| created_at | timestamptz | |

**Index on:** `(run_id, judge_score)` — for fast "worst N cases" lookup.

---

## API design

All endpoints prefixed with `/api/v1`. JSON. CORS allowed from configurable origins.

### Test sets

- `GET /api/v1/test-sets` → list (with case_count)
- `POST /api/v1/test-sets` → create
- `GET /api/v1/test-sets/{id}` → detail with all cases
- `PATCH /api/v1/test-sets/{id}` → update name/description
- `DELETE /api/v1/test-sets/{id}` → cascade delete
- `POST /api/v1/test-sets/{id}/cases` → add a single case
- `POST /api/v1/test-sets/{id}/cases/bulk` → upload CSV (format below)
- `PATCH /api/v1/test-cases/{id}` → edit
- `DELETE /api/v1/test-cases/{id}` → delete

**CSV format for bulk upload:**
- Required header row: `input,category,expected_behavior` (any order)
- Use Python's `csv.DictReader` with default dialect
- Fields with commas, newlines, or double quotes must be quoted with `"`
- Internal double quotes escaped by doubling: `""`
- Strip BOM if present (handle Excel exports)
- Empty `category` allowed; empty `input` or `expected_behavior` rejected with 400 listing offending row numbers

### Agents

- `GET /api/v1/agents` → list
- `POST /api/v1/agents` → create
- `GET /api/v1/agents/{id}` → detail
- `PATCH /api/v1/agents/{id}` → update
- `DELETE /api/v1/agents/{id}` → reject if any runs reference it

### Runs

- `GET /api/v1/runs?test_set_id=&agent_id=` → list (newest first), optional filters
- `POST /api/v1/runs` → start. Body: `{test_set_id, agent_id, judge_model?}`. Returns the run record. **Executes in background** via `BackgroundTasks`.
- `GET /api/v1/runs/{id}` → detail with case results + computed stats
- `DELETE /api/v1/runs/{id}` → delete
- `GET /api/v1/runs/{id}/export?format=md` → returns a markdown report as `text/markdown`

### Compare

- `GET /api/v1/runs/compare?a={runA_id}&b={runB_id}` → returns both runs + diff
- **Reject with 400** if `runA.test_set_id != runB.test_set_id`. Error message: `"Cannot compare runs from different test sets. Run A used test set X; Run B used test set Y."`

### Debug

- `POST /api/v1/debug/test-prompt` → body `{agent_id OR (system_prompt, model, temperature), input}`. Returns just the agent's reply. Used by "Test this prompt" inline tool. Counts toward Groq quota.

### Seed loader

- `POST /api/v1/seeds/sms-support-v1` → loads the seed test set + 2 agents. Idempotent (checks if already loaded).

### Health

- `GET /api/v1/health` → `{status: "ok", version: "1.0.0"}`. Used by frontend wake-up logic.

---

## Pydantic schemas

```python
class TestCaseCreate(BaseModel):
    input: str
    category: str | None = None
    expected_behavior: str

class TestCaseRead(TestCaseCreate):
    id: UUID
    test_set_id: UUID
    position: int

class TestSetCreate(BaseModel):
    name: str
    description: str | None = None

class TestSetRead(BaseModel):
    id: UUID
    name: str
    description: str | None
    case_count: int
    created_at: datetime

class TestSetDetail(TestSetRead):
    cases: list[TestCaseRead]

class AgentCreate(BaseModel):
    name: str
    system_prompt: str
    model: str = "llama-3.3-70b-versatile"
    temperature: float = 0.7
    max_tokens: int = 512

class AgentRead(AgentCreate):
    id: UUID
    created_at: datetime

class RunStart(BaseModel):
    test_set_id: UUID
    agent_id: UUID
    judge_model: str = "llama-3.3-70b-versatile"

class CaseResultRead(BaseModel):
    id: UUID
    test_case: TestCaseRead
    agent_prompt_sent: str | None
    agent_output: str | None
    agent_latency_ms: int | None
    judge_prompt_sent: str | None
    judge_score: int | None
    judge_reasoning: str | None
    judge_latency_ms: int | None
    error: str | None

class RunStats(BaseModel):
    pass_rate: float                    # % of cases scoring >= 4 (over successful)
    avg_score: float
    score_distribution: dict[int, int]
    per_category: dict[str, dict]
    worst_cases: list[CaseResultRead]   # bottom 5
    total_cases: int
    successful_cases: int
    errored_cases: int

class RunDetail(BaseModel):
    id: UUID
    test_set: TestSetRead
    agent: AgentRead
    judge_model: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    total_cases: int
    completed_cases: int
    errored_cases: int
    error: str | None
    case_results: list[CaseResultRead]
    stats: RunStats | None  # null until completed

class RunCompare(BaseModel):
    run_a: RunDetail
    run_b: RunDetail
    pass_rate_delta: float              # b - a
    cases_improved: list[UUID]
    cases_regressed: list[UUID]
    cases_unchanged: list[UUID]
```

---

## The LLM client (`services/llm.py`)

Wraps Groq with rate limiting and retry. **Three responsibilities:**

1. **Token-bucket rate limiter** — enforces ≤ 28 RPM (under Groq's 30 RPM ceiling for safety)
2. **Retry on 429** — exponential backoff: 1s, 2s, 4s, 8s. Max 4 retries.
3. **Latency measurement** — return latency_ms alongside response

```python
import asyncio
import time
import json
from openai import AsyncOpenAI, RateLimitError

class RateLimiter:
    """Token bucket: max RPM requests in any 60s window."""
    def __init__(self, rpm: int):
        self.rpm = rpm
        self._timestamps: list[float] = []
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            self._timestamps = [t for t in self._timestamps if now - t < 60]
            if len(self._timestamps) >= self.rpm:
                wait = 60 - (now - self._timestamps[0]) + 0.1
                await asyncio.sleep(wait)
                now = time.monotonic()
                self._timestamps = [t for t in self._timestamps if now - t < 60]
            self._timestamps.append(now)


_rate_limiter = RateLimiter(rpm=28)
_client = AsyncOpenAI(
    api_key=settings.GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1",
)


async def call_llm(
    *, model: str, system: str, user: str,
    temperature: float = 0.7, max_tokens: int = 512,
    response_format: dict | None = None,
) -> tuple[str, int]:
    """Call Groq with rate limiting + 429 retry. Returns (content, latency_ms)."""
    await _rate_limiter.acquire()

    backoff = 1.0
    for attempt in range(4):
        try:
            start = time.monotonic()
            resp = await _client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                response_format=response_format,
            )
            latency_ms = int((time.monotonic() - start) * 1000)
            return resp.choices[0].message.content or "", latency_ms
        except RateLimitError:
            if attempt == 3:
                raise
            await asyncio.sleep(backoff)
            backoff *= 2
        except Exception:
            raise
```

The rate limiter is a module-level singleton — shared across all callers, including the concurrent runner.

---

## The judge service (`services/judge.py`)

```python
JUDGE_SYSTEM = """You are an expert evaluator of customer-support AI agents.
Your job is to score the agent's response against the expected behavior on a 1-5 scale.

SCORING RUBRIC:
1 = Bad. Wrong, harmful, rude, ignores the message, or fails the expected behavior entirely.
2 = Poor. Addresses the message but misses important aspects of the expected behavior.
3 = Okay. Addresses the message and meets some expected behavior, but has notable issues.
4 = Good. Meets the expected behavior with minor issues (tone, completeness).
5 = Excellent. Fully meets the expected behavior. Tone, accuracy, and completeness are all good.

Return ONLY a JSON object with exactly two fields, no other text:
{
  "score": <integer 1-5>,
  "reasoning": "<one short sentence explaining the score>"
}"""

JUDGE_USER_TEMPLATE = """CUSTOMER MESSAGE:
{input}

AGENT'S RESPONSE:
{agent_output}

EXPECTED BEHAVIOR (what a good response should do):
{expected_behavior}"""


async def judge_response(
    *, model: str, input: str, agent_output: str, expected_behavior: str,
) -> tuple[int, str, str, int]:
    """Score an agent response. Returns (score, reasoning, full_prompt_sent, latency_ms).
    Retries once if JSON parsing fails."""
    user = JUDGE_USER_TEMPLATE.format(
        input=input, agent_output=agent_output, expected_behavior=expected_behavior,
    )
    full_prompt = f"SYSTEM:\n{JUDGE_SYSTEM}\n\nUSER:\n{user}"

    last_error = None
    for attempt in range(2):
        system = JUDGE_SYSTEM if attempt == 0 else (
            JUDGE_SYSTEM
            + "\n\nREMINDER: Return ONLY valid JSON, no markdown fences, no preamble."
        )
        content, latency_ms = await call_llm(
            model=model, system=system, user=user,
            temperature=0.0,  # judge is deterministic
            max_tokens=200,
            response_format={"type": "json_object"},
        )
        try:
            data = json.loads(content)
            score = int(data["score"])
            reasoning = str(data["reasoning"])
            if not 1 <= score <= 5:
                raise ValueError(f"score out of range: {score}")
            return score, reasoning, full_prompt, latency_ms
        except (json.JSONDecodeError, KeyError, ValueError, TypeError) as e:
            last_error = f"judge JSON parse failed: {e}; content was: {content[:200]}"
            continue

    raise RuntimeError(last_error)
```

Temperature 0 for the judge — judging should be deterministic.

---

## The runner (`services/runner.py`)

Orchestrates a run over all test cases. **Concurrent up to 5 in flight, but the rate limiter throttles to 28 RPM globally.** Per-case errors do NOT fail the run.

```python
async def execute_run(run_id: UUID, db_factory):
    """Execute all cases. Updates DB after each. db_factory creates fresh sessions."""
    async with db_factory() as db:
        run = await db.get(Run, run_id)
        test_set = await load_test_set_with_cases(db, run.test_set_id)
        agent = await db.get(Agent, run.agent_id)
        run.status = "running"
        run.total_cases = len(test_set.cases)
        await db.commit()

    semaphore = asyncio.Semaphore(5)

    async def run_one_case(case):
        async with semaphore:
            try:
                # 1. Agent
                agent_full_prompt = (
                    f"SYSTEM:\n{agent.system_prompt}\n\nUSER:\n{case.input}"
                )
                agent_output, agent_latency = await call_llm(
                    model=agent.model,
                    system=agent.system_prompt,
                    user=case.input,
                    temperature=agent.temperature,
                    max_tokens=agent.max_tokens,
                )
                # 2. Judge
                score, reasoning, judge_full_prompt, judge_latency = await judge_response(
                    model=run.judge_model,
                    input=case.input,
                    agent_output=agent_output,
                    expected_behavior=case.expected_behavior,
                )
                result_data = dict(
                    run_id=run_id, test_case_id=case.id,
                    agent_prompt_sent=agent_full_prompt,
                    agent_output=agent_output, agent_latency_ms=agent_latency,
                    judge_prompt_sent=judge_full_prompt,
                    judge_score=score, judge_reasoning=reasoning,
                    judge_latency_ms=judge_latency,
                )
                errored = False
            except Exception as e:
                result_data = dict(
                    run_id=run_id, test_case_id=case.id,
                    error=f"{type(e).__name__}: {str(e)[:500]}",
                )
                errored = True

            # Each case persists with a fresh session to avoid contention
            async with db_factory() as db:
                db.add(CaseResult(**result_data))
                run = await db.get(Run, run_id)
                run.completed_cases += 1
                if errored:
                    run.errored_cases += 1
                await db.commit()

    try:
        await asyncio.gather(*(run_one_case(c) for c in test_set.cases))
        async with db_factory() as db:
            run = await db.get(Run, run_id)
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            await db.commit()
    except Exception as e:
        async with db_factory() as db:
            run = await db.get(Run, run_id)
            run.status = "failed"
            run.error = f"{type(e).__name__}: {str(e)[:500]}"
            run.completed_at = datetime.now(timezone.utc)
            await db.commit()
```

**Why this design:**
- Concurrency 5 keeps progress responsive without overwhelming the rate limiter.
- The `RateLimiter` is the global throttle — naturally paces across all 5 workers.
- A 30-case run = ~60 LLM calls, ~130 seconds at 28 RPM. Acceptable.
- Per-case errors marked individually; run proceeds. Stats compute over `successful_cases`.
- Each case writes with its own session — avoids long-lived transactions blocking each other.

---

## Stats computation (`services/stats.py`)

```python
def compute_stats(case_results: list[CaseResult]) -> RunStats:
    successful = [r for r in case_results if r.judge_score is not None]
    errored = [r for r in case_results if r.error is not None]

    if not successful:
        return RunStats(
            pass_rate=0.0, avg_score=0.0,
            score_distribution={i: 0 for i in range(1, 6)},
            per_category={}, worst_cases=[],
            total_cases=len(case_results),
            successful_cases=0,
            errored_cases=len(errored),
        )

    pass_rate = sum(1 for r in successful if r.judge_score >= 4) / len(successful)
    avg_score = sum(r.judge_score for r in successful) / len(successful)
    distribution = {i: sum(1 for r in successful if r.judge_score == i) for i in range(1, 6)}

    per_category = {}
    by_cat: dict[str, list] = {}
    for r in successful:
        cat = r.test_case.category or "uncategorized"
        by_cat.setdefault(cat, []).append(r)
    for cat, items in by_cat.items():
        per_category[cat] = {
            "count": len(items),
            "pass_rate": sum(1 for r in items if r.judge_score >= 4) / len(items),
            "avg_score": sum(r.judge_score for r in items) / len(items),
        }

    worst = sorted(successful, key=lambda r: r.judge_score)[:5]

    return RunStats(
        pass_rate=pass_rate, avg_score=avg_score,
        score_distribution=distribution, per_category=per_category,
        worst_cases=worst,
        total_cases=len(case_results),
        successful_cases=len(successful),
        errored_cases=len(errored),
    )
```

---

## Markdown export (`services/exporter.py`)

```python
def export_run_md(run: RunDetail) -> str:
    s = run.stats
    lines = [
        f"# EvalLab Run Report",
        f"",
        f"**Run ID:** `{run.id}`",
        f"**Test Set:** {run.test_set.name}",
        f"**Agent:** {run.agent.name} ({run.agent.model})",
        f"**Judge:** {run.judge_model}",
        f"**Started:** {run.started_at.isoformat()}",
        f"**Completed:** {run.completed_at.isoformat() if run.completed_at else 'n/a'}",
        f"",
        f"## Summary",
        f"",
        f"- **Pass rate:** {s.pass_rate:.1%}",
        f"- **Average score:** {s.avg_score:.2f}",
        f"- **Cases:** {s.total_cases} total, {s.successful_cases} scored, {s.errored_cases} errored",
        f"",
        f"## Score Distribution",
        f"",
        f"| Score | Count |",
        f"|-------|-------|",
    ]
    for score, count in sorted(s.score_distribution.items()):
        lines.append(f"| {score} | {count} |")

    lines += [f"", f"## Per-Category Breakdown", f"",
              f"| Category | Count | Pass Rate | Avg Score |",
              f"|----------|-------|-----------|-----------|"]
    for cat, st in s.per_category.items():
        lines.append(f"| {cat} | {st['count']} | {st['pass_rate']:.1%} | {st['avg_score']:.2f} |")

    lines += [f"", f"## Worst 5 Cases", f""]
    for r in s.worst_cases:
        lines += [
            f"### Score {r.judge_score} — {r.test_case.category or 'uncategorized'}",
            f"",
            f"**Input:** {r.test_case.input}",
            f"",
            f"**Expected behavior:** {r.test_case.expected_behavior}",
            f"",
            f"**Agent output:** {r.agent_output}",
            f"",
            f"**Judge reasoning:** {r.judge_reasoning}",
            f"",
        ]

    return "\n".join(lines)
```

---

## Seed test set: SMS customer support, 30 cases

In `apps/api/src/seeds/sms_support_v1.py`. Provide:
- `seed_sms_support_v1(db)` function that creates the test set + cases + 2 agents
- CLI: `python -m src.seeds.sms_support_v1`
- `POST /api/v1/seeds/sms-support-v1` endpoint (idempotent)
- "Load seed data" button on empty-state pages calls the endpoint

### Categories and counts
- `refund` — 10 cases
- `complaint` — 8 cases
- `qa` — 8 cases
- `nonsense` — 4 cases

### Quality bar for cases
Each case should:
- Have a realistic SMS-style input (typos OK, casual tone OK, varying length OK)
- Have a clear, specific `expected_behavior` describing what the agent should and should NOT do
- Be genuinely different from the others — no near-duplicates

Examples (build out 30 in this style):

```python
SEED_CASES = [
    # REFUND
    {
        "input": "I want a refund for order #12345 it arrived broken",
        "category": "refund",
        "expected_behavior": "Should acknowledge the issue, ask for proof (a photo), explain the refund process at a high level, NOT promise a refund unilaterally, polite tone.",
    },
    {
        "input": "where my refund?? you said 5 days its been 2 weeks",
        "category": "refund",
        "expected_behavior": "Should acknowledge the delay, apologize, ask for the order number, offer to escalate to a human, NOT make excuses, NOT promise a specific timeline.",
    },
    {
        "input": "Hi, I'd like to return order 88421 which I bought yesterday. The size doesn't fit. Thanks!",
        "category": "refund",
        "expected_behavior": "Should respond warmly, confirm the order number, explain the return process, mention return window if standard, ask about reason for return.",
    },
    # ... 7 more refund cases

    # COMPLAINT
    {
        "input": "u guys r scammers worst service ever",
        "category": "complaint",
        "expected_behavior": "Should de-escalate, apologize for the experience, offer to connect to a human, NOT match hostile tone, NOT be defensive, NOT make promises.",
    },
    {
        "input": "this is the third time I've contacted you about my missing package and nobody is helping me",
        "category": "complaint",
        "expected_behavior": "Should acknowledge the frustration explicitly, apologize sincerely for repeated contacts, escalate to a human, ask for an order/reference number.",
    },
    # ... 6 more complaint cases

    # QA
    {
        "input": "what are your business hours",
        "category": "qa",
        "expected_behavior": "Should give a factual answer if known, OR politely note it doesn't have that info and offer to connect to a human. Reply should be short and direct.",
    },
    {
        "input": "do you ship to canada",
        "category": "qa",
        "expected_behavior": "Should answer factually if known, otherwise offer to connect to a human. Should NOT invent shipping info.",
    },
    # ... 6 more QA cases

    # NONSENSE
    {
        "input": "asdfgh",
        "category": "nonsense",
        "expected_behavior": "Should politely ask for clarification. Should NOT hallucinate a topic, should NOT make assumptions about what the user meant.",
    },
    {
        "input": "🙄🙄🙄",
        "category": "nonsense",
        "expected_behavior": "Should politely ask the customer how it can help. Should NOT interpret the emojis as a complaint or compliment.",
    },
    # ... 2 more nonsense cases
]
```

When generating the full 30, vary phrasing, length, tone, and edge cases (typos, multiple questions in one message, ambiguous requests, polite vs rude, very short vs very long). No near-duplicates.

### Seed agents

Two agents designed to behave differently on emotional/complaint cases — gives the Compare view something interesting on day one.

```python
SEED_AGENTS = [
    {
        "name": "Support Agent v1 — Concise",
        "system_prompt": (
            "You are a customer support agent for an e-commerce store. "
            "Be polite, helpful, and concise. "
            "If you don't have specific information, say so directly and offer to connect them to a human. "
            "Don't make promises about refunds, shipping, or policies — escalate to a human agent for those."
        ),
        "model": "llama-3.3-70b-versatile",
        "temperature": 0.7,
        "max_tokens": 256,
    },
    {
        "name": "Support Agent v2 — With Empathy",
        "system_prompt": (
            "You are an empathetic customer support agent for an e-commerce store. "
            "Always acknowledge the customer's feelings before addressing their issue. "
            "If the customer is frustrated or upset, validate their experience first. "
            "If you don't have specific information, say so and offer to connect to a human. "
            "Don't make promises about refunds, shipping, or policies — say you'll look into it and connect them to a human."
        ),
        "model": "llama-3.3-70b-versatile",
        "temperature": 0.7,
        "max_tokens": 256,
    },
]
```

**Note (deliberate change from earlier draft):** the SMS-character constraint that was in earlier thinking has been REMOVED from the agent prompts. The judge doesn't measure character count, so making the agent target it created a silent disconnect between agent goals and eval criteria. If you want to evaluate response length, add it to `expected_behavior` per case (e.g., `"...response should be under 200 characters"`) and the judge will pick it up.

---

## Frontend UI — page by page

shadcn/ui throughout. Tailwind for layout. Lucide for icons. Minimal style: lots of whitespace, monochrome with one accent (suggested: a desaturated blue), no gradients, animations only from default shadcn behavior.

### Cold-start UX (`components/wake-up-banner.tsx`)

**Critical for free-tier deploy.** On the home page (and any page that loads on first visit):

1. Mount `useBackendWakeUp()` hook — fires `/api/v1/health` immediately
2. If response takes > 3s, show a fixed-position banner: *"Waking up backend (Render free tier sleeps after 15 min idle). This usually takes 30 to 60 seconds. Hang tight!"* with a small spinner
3. Banner disappears once `/health` returns 200
4. If health fails after 90s, show: *"Backend isn't responding. The free tier may be over its daily quota — try again later."*

This single feature covers the biggest UX cliff of free hosting.

### Layout (top nav)

Logo "EvalLab" left, links: **Test Sets**, **Agents**, **Runs**, **Compare**.

### Home page (`/`)

- Brief hero: *"EvalLab — measure your LLM outputs systematically."*
- Four cards: Test Sets, Agents, Runs, Compare. Each shows count.
- Empty state: prominent "Get started: Load SMS Support seed data" button.

### Test Sets page (`/test-sets`)

Table: name, description, case count, created at. Click row → detail. "+ New" button. Empty state with seed loader.

### Test Set detail (`/test-sets/[id]`)

Editable name + description top. Below: cases table (input, category, expected_behavior). Edit/delete inline. "+ Add case" and "Upload CSV" buttons. CSV format documented inline.

### Agents page (`/agents`)

Table: name, model, temperature, created at. "+ New agent" → form with name, system prompt textarea (large), model dropdown, temperature slider, max_tokens input.

### Agent detail (`/agents/[id]`)

Editable form. **Test Prompt tool inline:** paste an input → click Run → see output (no scoring; sanity check). Hits `/debug/test-prompt`. Shows latency. One Groq call per click; counts toward quota.

### Runs page (`/runs`)

Table: test set, agent, status, started at, pass rate (or "—"). Click row → detail. "+ New run" button.

### New Run page (`/runs/new`)

Two dropdowns (test set, agent) + judge model dropdown (default llama-3.3-70b-versatile). Big Run button → POST → redirect to `/runs/[id]`.

### Run detail (`/runs/[id]`)

**Top:** status badge, test set name (link), agent name (link), judge model, started at (browser local time via `Intl.DateTimeFormat`), completed at, **Download Markdown Report** button.

**While running:** progress bar (`completed_cases / total_cases`), polls every 2s. Most recent case results stream in at the bottom.

**When complete:**
- **Stats card:** big pass rate, avg score, total/successful/errored counts
- **Score distribution bar chart:** simple HTML/Tailwind bars, no chart library
- **Per-category breakdown table**
- **Worst 5 cases:** for each, expandable card with input, agent output, judge score, judge reasoning, expected behavior, and a "Show full prompts" toggle revealing `agent_prompt_sent` and `judge_prompt_sent`
- **All results table:** every case with input (truncated), score, click → expand for full details
- **Errors section:** any cases with `error != null`, showing the error string

### Compare page (`/compare`)

Two dropdowns: Run A, Run B. **Once Run A is selected, Run B's dropdown filters to runs against the same `test_set_id`.** If invalid pair attempted, clear error.

Once both selected:
- Headline: *"Run A: 87% pass rate. Run B: 82%. Delta: -5%."*
- Two columns side by side: stats per run
- Diff table: case by case, A's score, B's score, delta. Sortable. Click row → side-by-side outputs
- Highlight: green for improved, red for regressed

---

## Implementation stages

After each, confirm with the human and have them test before moving on.

### Stage 1: Skeleton + Deploy (Day 1, 3 hours)

- Init repo, `.gitignore`, README placeholder
- FastAPI: `/health`, settings via `pydantic-settings`, async DB connection
- Alembic with all 5 tables, all `timestamptz`
- Next.js with shadcn/ui, top nav, blank pages for each route
- **Wake-up banner component**
- Verify both run locally
- **Deploy** at end of Stage 1: Vercel + Render + Neon. Surface deploy issues early.

**Test:** Live URL works. Click around. Banner shows briefly on cold start.

### Stage 2: CRUD (Day 1-2, 3-4 hours)

- Test sets API (list, create, detail, edit, delete; bulk CSV upload)
- Agents API
- Frontend pages
- Seed loader (CLI + endpoint + button)

**Test:** Load seed → see 30 cases + 2 agents. Edit a case. Upload a CSV.

### Stage 3: Single-Case (Day 2, 2-3 hours)

- `services/llm.py` with rate limiter + 429 retry
- `services/judge.py` with JSON-parse retry
- `routes/debug.py` with `/debug/test-prompt`
- "Test Prompt" inline tool on agent detail page

**Test:** Hit debug endpoint with a seed case. See agent reply, judge score, reasoning. Verify rate limiter logs show pacing.

### Stage 4: Full Run (Day 2-3, 3-4 hours)

- `services/runner.py` with concurrency + per-case error handling
- `services/stats.py`
- `POST /runs` → fires BackgroundTask
- `GET /runs/{id}` with computed stats
- Frontend Run detail page with polling
- New Run page

**Test:** Start a run → watch progress every 2s → see final stats. Kill internet briefly during a run → run should complete with errored cases, not fail entirely.

### Stage 5: Compare + Export (Day 3, 2-3 hours)

- `/runs/compare` endpoint with mismatched-test-set rejection
- Compare page with filtered Run B dropdown
- `/runs/{id}/export?format=md` and Download button
- `services/exporter.py`

**Test:** Run both seed agents → compare them → download report. Try comparing across different test sets → should reject.

### Stage 6: Polish + README (Day 3-4, 2-3 hours)

- Write README using template below
- Screenshots: home, run detail with stats, compare page
- 60-90s Loom: clone-to-running demo
- Favicon
- Set `EVALLAB_API_KEY` on production
- Verify env vars documented
- `pnpm build` (web) and `python -m mypy src` (api) — fix warnings

**Test:** Walk through deployed app top-to-bottom as a recruiter would. Anything confusing? Fix.

### Stage 7 (optional): Streaming progress

Replace polling with SSE. Stream judge scores as computed. Skip if Stage 6 feels complete — polling at 2s is good enough.

---

## README template (Stage 6)

```markdown
# EvalLab

A small web app for evaluating LLM outputs systematically.

[Live demo](https://evallab-web.vercel.app) · [How it works](#how-it-works) · [Stack](#stack)

![EvalLab screenshot — run results page](docs/screenshot.png)

> **Heads up:** the backend runs on Render's free tier and spins down after 15 min idle.
> Your first request after a quiet period will take 30-60s while it wakes up. The frontend
> shows a banner during this. Subsequent requests are fast.

## Why this exists

Most teams shipping LLM features evaluate on vibes — eyeball five outputs,
"looks good," ship it. Two weeks later something regresses and nobody
notices until a customer complaint.

EvalLab fixes this for one person: define a test set of inputs and expected
behaviors, define an agent (prompt + model), run them, and get scored,
comparable results. Change the prompt, run again, see if your change
actually helped — with numbers, not vibes.

I built this after working on production LLM agents at my day job and
noticing how thin the eval discipline usually is.

## How it works

EvalLab has four primitives:

1. **Test set** — a list of cases. Each case has an input, an optional
   category, and a written description of the expected behavior.
2. **Agent** — a prompt + model that responds to inputs.
3. **Run** — execute an agent against a test set. Each output is scored
   1–5 by a judge LLM against the expected behavior.
4. **Compare** — diff two runs to see which cases improved or regressed.

A run with 30 cases takes about 2-3 minutes on Groq's free tier (rate
limited to 30 RPM).

## Demo

[60-second Loom showing the full flow](https://loom.com/...)

## Stack

- **Frontend:** Next.js 15 + TypeScript + TailwindCSS + shadcn/ui (Vercel)
- **Backend:** FastAPI + Python 3.11 (Render)
- **Database:** PostgreSQL on Neon
- **LLM provider:** Groq (Llama 3.3 70B for both agent and judge by default)
- **Total cost:** $0/month on free tiers

## Running it locally

```bash
# 1. Clone and start local Postgres
git clone https://github.com/iamshihab2020/evallab
cd evallab
docker compose up -d

# 2. Backend
cd apps/api
uv sync
cp .env.example .env  # fill in GROQ_API_KEY (free at console.groq.com)
alembic upgrade head
python -m src.seeds.sms_support_v1
uv run uvicorn src.main:app --reload

# 3. Frontend (new terminal)
cd apps/web
pnpm install
cp .env.local.example .env.local
pnpm dev
```

Open http://localhost:3000.

## Design decisions worth calling out

- **No auth.** EvalLab is a single-user tool. The deployed instance has a
  simple `X-API-Key` header to prevent randos from burning my Groq quota.
- **Llama 3.3 70B as both agent and judge.** I tried GPT-4 and Claude as
  judges — they're better — but Groq's free tier and speed (200+ TPS)
  made Llama 3.3 the right tradeoff. The judge prompt matters more than
  the model choice in most cases.
- **Token-bucket rate limiter at 28 RPM.** Groq's free tier ceiling for
  Llama 3.3 70B is 30 RPM. The runner caps itself at 28 to leave margin,
  with 429 retries as a safety net for any miss.
- **Per-case errors don't fail the run.** If one case throws (network blip,
  malformed judge response after retries), it's marked errored and the
  run continues. Stats compute over successful cases only.
- **Polling instead of SSE.** A run takes 2-3 minutes. Polling every 2s
  is simple and works.
- **Pass-rate threshold = score ≥ 4.** In my SMS support seed set, scores
  of 3 still represent "the agent missed something important."

## Limitations and what's next

- **Judge model bias.** LLM-as-judge has known biases — verbosity bias,
  position bias, self-preference. Not addressed in v1.
- **Judge calibration.** I don't currently verify the judge's scores
  agree with human scores on a held-out calibration set. A real eval
  system would do this regularly.
- **No prompt versioning.** Agent prompts are mutable. In a real product
  I'd version prompts so historical runs always reference the prompt
  that produced them.
- **No cost tracking.** Free tier hides this; a real eval system needs
  cost-per-run metrics.
- **No "rerun this case" affordance.** If one case errors, you re-run
  the whole test set.
- **Single LLM provider.** Adding OpenRouter would let users compare
  models across providers in the same run.

## How I'd evolve this for production

If this were a real product team's tool:

- **Async job queue (Arq/Celery + Redis)** instead of FastAPI BackgroundTasks,
  so runs survive backend restarts and can be cancelled.
- **Prompt versioning** — agent has many prompt versions, runs pin to one.
- **Webhook-based eval triggers** so prompt PRs in a real product repo can
  fire an eval run and post results back before merge. The whole point of
  eval-driven development.
- **Multi-judge ensembles** for important rubrics, with disagreement surfacing.
- **Cost tracking** per run, per case, per model.
- **Public sharing** of runs via signed URLs (read-only).

## License

MIT.

---

Built by [Sheikh Shihab Hossain](https://shihab-portfolio.vercel.app/).
```

---

## Environment variables

### Backend (`apps/api/.env`)

```
DATABASE_URL=postgresql+asyncpg://user:pass@host/db
GROQ_API_KEY=gsk_...
EVALLAB_API_KEY=                # Optional — set in production, leave empty in dev
CORS_ORIGINS=http://localhost:3000,https://evallab-web.vercel.app
```

### Frontend (`apps/web/.env.local`)

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_API_KEY=
```

---

## Deployment

### Backend on Render

- New Web Service → connect GitHub → root `apps/api`
- Build command: `pip install uv && uv sync --frozen && alembic upgrade head`
- Start command: `uv run uvicorn src.main:app --host 0.0.0.0 --port $PORT`
- Add env vars
- Free tier — 15-min idle spin-down, 30-90s cold start

### Database on Neon

- Sign up (no card)
- Create project, copy connection string
- Paste into Render's `DATABASE_URL`
- **Important:** change driver to `postgresql+asyncpg://` (not the default `postgresql://`) so SQLAlchemy uses the async driver

### Frontend on Vercel

- New project → connect GitHub → root `apps/web`
- `NEXT_PUBLIC_API_BASE_URL` = your Render URL
- `NEXT_PUBLIC_API_KEY` = same as `EVALLAB_API_KEY` on backend

### Groq

- Sign up at console.groq.com (no card)
- Generate API key
- Add to Render

---

## Things to NOT build (scope discipline)

- ❌ User accounts / multi-user / multi-tenant
- ❌ Stripe / billing
- ❌ Multiple LLM providers in one run (Groq is fine for v1)
- ❌ Custom rubrics per test set
- ❌ Embedding similarity scoring (LLM-as-judge only)
- ❌ Drag-and-drop test set editor
- ❌ Real-time collaboration
- ❌ Webhook notifications
- ❌ Public sharing of runs (mentioned in "How I'd evolve")
- ❌ Dark mode toggle (pick one and ship)
- ❌ Charts beyond the basic distribution bar
- ❌ Judge calibration UI (mentioned in "Limitations")

If Claude Code suggests adding any of these, redirect: "Save it for after v1 ships."

---

## Final acceptance criteria

You're done when ALL of these are true:

- [ ] Repo is public on GitHub at `github.com/iamshihab2020/evallab`
- [ ] Live URL works (Vercel hitting Render hitting Neon)
- [ ] Wake-up banner shows on cold starts; home page renders within ~60s worst case
- [ ] "Load seed data" button → 30 cases + 2 agents
- [ ] Can run Agent v1 against the SMS test set and see complete results within 3 minutes
- [ ] Can run Agent v2 and compare it against Agent v1's run
- [ ] Compare view rejects mismatched test sets with clear message
- [ ] Markdown export downloads cleanly
- [ ] "Show full prompts" toggle reveals the actual prompts sent
- [ ] Per-case errors visible in errors section, don't tank the run
- [ ] README has: hero screenshot, why-this-exists, design decisions, limitations, "how I'd evolve"
- [ ] 60-90s demo Loom in README
- [ ] No leftover `console.log`, no `TODO` comments, no commented-out code
- [ ] Both apps build without warnings

---

## What to say in interviews after shipping

> "I built EvalLab — it's an open-source LLM evaluation tool I made because at my day job I noticed we were tuning prompts on vibes. The app lets you define test sets, agents, run them, and compare runs side-by-side. Built on Next.js, FastAPI, Postgres, with Groq's free tier so anyone can clone it and run it for $0.
>
> Three things I'd flag about the design: first, judge model bias — LLM-as-judge has known issues like verbosity bias and self-preference that I haven't addressed yet. Second, no prompt versioning — agents are mutable and I'd fix that in a real product. Third, no judge calibration — I should be checking my judge's scores against human scores on a held-out set regularly.
>
> Want me to walk you through how the compare view works?"

That's senior-engineer-level positioning. You're not selling perfection — you're showing you understand the tradeoffs.

---

## When in doubt

- Prefer simple over clever
- Prefer shipping over polishing
- Prefer "v1 done" over "v1 perfect"
- If a feature is confusing in the spec, ask the human
- If the human asks to add something not in the spec, push back gently
- The goal is a public, shippable, defensible portfolio project — not a startup MVP

Good luck. Build well.
