# Phase 4 — Full Run (runner + stats + run UI)

Maps to [SPEC.md §"Stage 4: Full Run"](../SPEC.md). Phase 3 made one LLM call work; this phase composes calls into a full eval run, computes stats, and ships the run UI with live polling.

## Goal

User picks (test set, agent), clicks Run, watches a progress bar tick to completion in ~2–3 minutes for a 30-case run, then sees pass rate, score distribution, per-category breakdown, worst-5 cases (with full-prompt toggle), and an errors section.

## Sub-phases

### 4.1 — Pydantic schemas for runs

**Goal:** typed schemas for run lifecycle.

- Append to `apps/api/src/schemas.py`:
  - `RunStart { test_set_id: UUID, agent_id: UUID, judge_model: str = "llama-3.3-70b-versatile" }`
  - `CaseResultRead` (full SPEC fields incl. `agent_prompt_sent`, `judge_prompt_sent`)
  - `RunStats` (pass_rate, avg_score, score_distribution, per_category, worst_cases, total/successful/errored counts)
  - `RunDetail` (everything + `case_results: list[CaseResultRead]`, `stats: RunStats | None`)
  - `RunListItem` (lighter read model for list page: id, test_set_name, agent_name, status, started_at, pass_rate, errored_cases). *SPEC's "list" description is loose; this shape is our extension to support the runs list UI.*

### 4.2 — Stats service

**Goal:** pure function `compute_stats(case_results) -> RunStats` per SPEC §"Stats computation".

- `apps/api/src/services/stats.py` — implementation exactly per SPEC: pass_rate over `successful` (`judge_score >= 4`), avg_score, distribution dict 1..5, per-category dict (`uncategorized` bucket for null), worst 5.
- Edge case: zero successful cases → return zeros and empty dicts (don't divide by zero).

**Verify:** unit test with hand-built fixtures: 4 successful (scores [5,5,3,1]) + 1 errored → pass_rate=0.5, avg=3.5, distribution {1:1,2:0,3:1,4:0,5:2}, total=5, successful=4, errored=1.

### 4.3 — Runner service

**Goal:** `execute_run(run_id, db_factory)` runs all cases concurrently (5 max), per-case errors don't fail the run.

- `apps/api/src/services/runner.py` exactly per SPEC §"The runner":
  - Open initial session: load run, test_set + cases, agent. Set `status="running"`, snapshot `total_cases`, commit.
  - `semaphore = asyncio.Semaphore(5)`.
  - `run_one_case(case)`:
    - Build `agent_full_prompt` string for storage (`SYSTEM:\n...\n\nUSER:\n...`).
    - `agent_output, agent_latency = await call_llm(...)`.
    - `score, reasoning, judge_full_prompt, judge_latency = await judge_response(...)`.
    - Persist a `CaseResult` with all fields. On `Exception`, persist with only `error` filled and `errored_cases += 1`.
    - **Each persist uses a fresh session** (`async with db_factory() as db:`).
  - `await asyncio.gather(*(run_one_case(c) for c in cases))` — never raises (each catches), so the gather just completes.
  - On finish: open new session, set `status="completed"`, `completed_at = utcnow`. On unexpected outer exception (rare): `status="failed"`, log error.

**Verify:** unit-level test with a mocked `call_llm`/`judge_response` (returning a mix of scores + one raise) → run record reaches `completed`, `errored_cases==1`, all 5 case_results persisted.

### 4.4 — Run endpoints

**Goal:** start, list, detail, delete runs.

- `apps/api/src/routes/runs.py`:
  - `POST /runs` — body `RunStart`. Insert run with `status="pending"`, fire `BackgroundTasks.add_task(execute_run, run.id, AsyncSessionLocal)`. Return the inserted run.
  - `GET /runs?test_set_id=&agent_id=` — list newest first; include `pass_rate` in each item if `status=="completed"`. Compute on-the-fly via a SQL subquery or in-Python from joined case_results — **do not** denormalize into a column. Dataset is small; compute is cheap.
  - `GET /runs/{id}` — full `RunDetail` with `case_results` and computed `stats` (null until `status == "completed"`).
  - `DELETE /runs/{id}` — cascade.
- Wire router. Auth-key dep.
- **BackgroundTasks limitation:** ties run lifetime to the FastAPI worker. If Render restarts mid-run, the run gets stuck in `running`. Acceptable for v1 (SPEC §"How I'd evolve" calls out moving to a job queue). Add a startup hook that flips orphaned `running` runs to `failed` with `error="Server restarted mid-run"` so stale records self-heal.

**Verify:**
- POST → returns `pending` run within ~50ms.
- Poll GET → `running` with growing `completed_cases`.
- After ~2–3 min → `completed` with stats.

### 4.5 — Frontend: New Run page

**Goal:** simple two-dropdown form.

- `app/runs/new/page.tsx`:
  - Test Set `Select` (fetches `/test-sets`).
  - Agent `Select` (fetches `/agents`).
  - Judge model `Select` — single option default `llama-3.3-70b-versatile`.
  - Big "Run" `Button` — POST `/runs`, on success router.push(`/runs/${id}`).
  - Show estimated wall-clock: *"~{cases * 2 / 28 * 60}s"*. Honest about the rate limit.

**Verify:** form starts a run and lands on the detail page within a second.

### 4.6 — Frontend: Run detail (running state)

**Goal:** live progress bar + streaming case results via 2s polling.

- `app/runs/[id]/page.tsx` — uses TanStack Query `useQuery` with `refetchInterval` set to 2000 while `status` is `pending` or `running`, else `false`.
- Top section (always shown): status `Badge`, test set link, agent link, judge model, started_at (browser-local via `Intl.DateTimeFormat`), completed_at if any, "Download Markdown Report" button (lands in Phase 5 — disabled placeholder for now).
- Running view:
  - Progress bar: `completed_cases / total_cases` with `%`.
  - Live "Recent results" list: last 5 case_results, newest first (sorted by `created_at desc`).

**Verify:** start a run → page shows progress ticking up every 2s; recent results stream in.

### 4.7 — Frontend: Run detail (completed state)

**Goal:** all the post-run UI.

- Stats card: pass rate (big), avg score, total/successful/errored counts.
- Score distribution: 5 horizontal bars (Tailwind `bg-{color} h-{n}`) labeled 1..5 with counts. **No chart library** (SPEC).
- Per-category table: shadcn `Table` with category, count, pass rate, avg score.
- Worst-5 cases: stacked `Card`s with input, expected behavior, agent output, judge score badge, judge reasoning. Inside each: "Show full prompts" toggle (`Collapsible`) revealing `agent_prompt_sent` and `judge_prompt_sent` in `<pre>` blocks.
- All-results table: every case (input truncated to 80 chars), score badge, click row → `Dialog` with full case details (mirrors worst-5 card content).
- Errors section: any `case_result` where `error != null`, list with input + error string.

**Verify:** run a 30-case eval → all six sections render correctly. Toggle "Show full prompts" → see the actual SYSTEM/USER text sent.

### 4.8 — Frontend: Runs list page + home count

**Goal:** browse past runs.

- `app/runs/page.tsx` — table: test set, agent, status, started_at, pass_rate (or `—` for non-completed). When `errored_cases > 0`, show a small destructive-variant `Badge` next to status (e.g., `5 errors`) — otherwise users only discover errors after clicking into detail. Click row → detail. "+ New run" button.
- Home page: wire the Runs card count to `GET /runs` length (cap to fetching last N for perf if needed; SPEC scale is small).

**Verify:** after a couple of runs, list shows them newest-first; click navigates correctly.

### 4.9 — End-to-end verification & commit

- Run agent v1 against the SMS seed → 30 cases complete in ~2–3 min, stats render.
- Briefly disable network during a run (e.g., toggle Wi-Fi for 5s) → run should complete with some errored cases, NOT fail entirely.
- `agent_prompt_sent` and `judge_prompt_sent` visibly contain the actual prompts.
- Errors section shows the network-blip cases.
- Per CLAUDE.md rule #1: surface a one-line summary + commit message (e.g., `feat: run executor with concurrency, stats, polling UI, and per-case error isolation`) in chat, then stop. Do NOT run `git commit`.

## Things NOT in Phase 4

- No compare view (Phase 5).
- No Markdown export (Phase 5).
- No SSE streaming (Phase 7) — polling is enough.
- No run cancellation (intentionally out of scope per SPEC §"Things to NOT build" + simplicity).
