# Phase 2 — CRUD + Seed

Maps to [SPEC.md §"Stage 2: CRUD"](../SPEC.md). After Phase 1 the skeleton runs; this phase makes Test Sets and Agents real, loads seed data, and turns the home counts on.

## Goal

User can: list/create/edit/delete test sets and agents; add cases manually; bulk-upload cases via CSV; load the SMS-support seed (30 cases + 2 agents) with one button.

## Sub-phases

### 2.1 — Pydantic schemas

**Goal:** typed request/response contracts for all Phase 2 endpoints.

- `apps/api/src/schemas.py` — declare schemas from SPEC §"Pydantic schemas":
  - `TestCaseCreate`, `TestCaseUpdate` (partial), `TestCaseRead`
  - `TestSetCreate`, `TestSetUpdate`, `TestSetRead` (with `case_count` and `updated_at` — note: SPEC §"Pydantic schemas" omits `updated_at`; we include it because the model has the column and the UI shows "last edited"), `TestSetDetail` (with `cases: list[TestCaseRead]`)
  - `AgentCreate`, `AgentUpdate`, `AgentRead`
  - Bulk CSV result: `CSVUploadResult { created: int, errors: list[{row, message}] }`
- All read schemas use `model_config = ConfigDict(from_attributes=True)`.

**Verify:** `python -m mypy src/schemas.py` clean.

### 2.2 — Test Sets API

**Goal:** full CRUD for `test_sets`.

- `src/routes/test_sets.py` with router prefix `/test-sets`:
  - `GET /` — list with `case_count` (LEFT JOIN COUNT or scalar subquery).
  - `POST /` — create.
  - `GET /{id}` — detail with all cases ordered by `position`.
  - `PATCH /{id}` — update name/description.
  - `DELETE /{id}` — cascade (DB-level).
- All routes depend on `verify_api_key`.
- Wire into `main.py` under `/api/v1`.

**Verify:** Postman/`curl` covers create → list (count 1) → detail (cases [] empty) → patch → delete.

### 2.3 — Test Cases API + CSV bulk upload

**Goal:** add/edit/delete individual cases; bulk-upload via CSV.

- Endpoints (in `routes/test_sets.py` or new `routes/test_cases.py`):
  - `POST /test-sets/{id}/cases` — add single case. Auto-assign `position = max(position) + 1`.
  - `POST /test-sets/{id}/cases/bulk` — `multipart/form-data` file upload. Parse with `csv.DictReader`. Strip BOM. Validate: required `input` and `expected_behavior` non-empty (`category` optional). On any row error, return 400 with `errors: [{row: <1-indexed>, message: ...}]` and don't insert anything (transaction rollback). *SPEC §"CSV format" says reject with 400 listing offending rows; this plan adopts all-or-nothing inserts so the user can fix the file and retry without partial state. Surface this in the inline upload help text.*
  - `PATCH /test-cases/{id}` — edit input/category/expected_behavior.
  - `DELETE /test-cases/{id}`.

**Verify:**
- Upload a 3-row CSV with valid headers → 3 cases inserted, `position` 1/2/3.
- Upload one with an empty `input` on row 2 → 400, error mentions row 2, DB unchanged.
- Excel-saved CSV with BOM → still parses.

### 2.4 — Agents API

**Goal:** full CRUD for `agents`, with delete-guard.

- `src/routes/agents.py`:
  - `GET /` — list.
  - `POST /` — create with SPEC defaults (`model="llama-3.3-70b-versatile"`, `temperature=0.7`, `max_tokens=512`).
  - `GET /{id}`, `PATCH /{id}`.
  - `DELETE /{id}` — query `runs` for `agent_id`; if any → 409 with message "Cannot delete agent with N existing runs".

**Verify:** create agent → run delete (succeeds) → after Phase 4 lands, delete on referenced agent returns 409.

### 2.5 — Seed loader

**Goal:** SMS support v1 dataset (30 cases + 2 agents) loadable via CLI and endpoint, idempotent.

- `apps/api/src/seeds/__init__.py` (empty).
- `apps/api/src/seeds/sms_support_v1.py`:
  - `SEED_TEST_SET_NAME = "SMS Customer Support v1"`.
  - `SEED_CASES: list[dict]` — full 30 cases per SPEC §"Seed test set" categories: refund×10, complaint×8, qa×8, nonsense×4. Vary phrasing/length/tone.
  - `SEED_AGENTS` — the two from SPEC (Concise; With Empathy).
  - `async def seed_sms_support_v1(db) -> dict` — checks if test set with that name exists; if yes, returns `{"already_loaded": True}`; else inserts test set + all cases + both agents.
  - `if __name__ == "__main__":` — async-runs against `AsyncSessionLocal`.
- `src/routes/seeds.py` — `POST /api/v1/seeds/sms-support-v1` calling the function.

**Verify:**
- `python -m src.seeds.sms_support_v1` once → 30 cases + 2 agents in DB.
- Run again → no duplicates, returns `already_loaded`.
- Hit endpoint → same idempotent behavior.

### 2.6 — Frontend: Test Sets

**Goal:** Test Sets list, detail, edit, delete, add case, CSV upload.

- TanStack Query setup: create `src/components/query-provider.tsx` (`'use client'`) that wraps `QueryClientProvider`. Mount it inside `app/layout.tsx` around `{children}`. The `QueryClient` instance is created with `useState(() => new QueryClient(...))` so it stays stable across re-renders. (Cannot live directly in `layout.tsx` because that's a server component.)
- TS types in `src/lib/types.ts` — mirror Pydantic schemas.
- `app/test-sets/page.tsx` — `Table` of (name, description, case count, created_at). Click row → `/test-sets/[id]`. "+ New" button → `/test-sets/new`. Empty state with "Load seed data" CTA.
- `app/test-sets/new/page.tsx` — RHF + Zod form (name required, description optional). Submit → POST → redirect to detail.
- `app/test-sets/[id]/page.tsx`:
  - Editable name/description via shadcn `Dialog` form (Edit button → dialog → save). Inline-edit-on-blur is deferred to Phase 6 polish.
  - Cases table with inline edit (Dialog) + delete (confirm Dialog).
  - "+ Add case" button → Dialog with form.
  - "Upload CSV" button → Dialog with file input + format help text + sample.
  - Delete test set button (top-right) with confirm Dialog.
- All timestamps render via `Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })`.

**Verify:** create test set → add 2 cases → upload a CSV with 3 more → 5 cases shown in `position` order → delete one → edit one → delete test set.

### 2.7 — Frontend: Agents

**Goal:** Agents list + create/edit forms.

- `app/agents/page.tsx` — table (name, model, temperature, created_at). "+ New agent" button.
- `app/agents/new/page.tsx` — form: name, system_prompt (large `Textarea`), model `Select` (just `llama-3.3-70b-versatile` for now), temperature shadcn `Slider` 0–1 step 0.1, `max_tokens` `Input type="number"`.
- `app/agents/[id]/page.tsx` — same form pre-filled, save via PATCH. Delete button with 409 handling (toast: agent in use).
- (Test-prompt tool ships in Phase 3.)

**Verify:** create → list shows it → edit → delete blocked once any run uses it.

### 2.8 — Home counts + seed CTA wiring

**Goal:** home page reflects real DB state.

- Home page fetches `GET /test-sets` and `GET /agents` counts (Phase 4 will add runs count).
- "Load seed data" button — only shown when both counts are 0. POSTs to `/api/v1/seeds/sms-support-v1`, invalidates queries on success, toast `"Seed data loaded"`.

**Verify:** fresh DB → home shows 0/0/0/0 + seed CTA → click → counts update to 1 test set / 2 agents / 0 runs.

### 2.9 — End-to-end verification & commit

- Empty DB → load seed → 30 cases + 2 agents visible.
- Edit one case → persists.
- Upload a 5-row CSV → cases appended in order.
- Delete a test set → cascade removes its cases.
- `pnpm build` + `uv run python -m mypy src` clean.
- Per CLAUDE.md rule #1: surface a one-line summary + commit message (e.g., `feat: test-set + agent CRUD with CSV upload and seed loader`) in chat, then stop. Do NOT run `git commit`.

## Things NOT in Phase 2

- No LLM calls (Phase 3).
- No runs (Phase 4).
- No "Test Prompt" inline tool on agent detail (Phase 3).
- No compare/export (Phase 5).
