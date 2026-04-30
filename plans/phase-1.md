# Phase 1 — Skeleton (local only)

Maps to [SPEC.md §"Stage 1: Skeleton + Deploy"](../SPEC.md). **Deploy is deferred to Phase 6** at the user's request — this phase is local only.

## Context

Goal: a working local skeleton on both apps. No business logic — just prove the pipes work locally and confirm the cold-start UX in dev. The repo currently has only spec/CLAUDE/.gitignore + empty `apps/api`, `apps/web` folder shells.

## Decisions locked in

1. **Package manager (web):** `pnpm`.
2. **Local DB:** Neon **dev branch** (separate from prod). No docker-compose. Prod parity from day one.
3. **Deploy:** deferred to Phase 6.

## Sub-phases

### 1.1 — Repo hygiene & env templates

**Goal:** repo-root config files in place before any code.

- Confirm `.gitignore` covers env / Python / Node (already does) — no edits.
- Create `apps/api/.env.example` with: `DATABASE_URL=postgresql+asyncpg://USER:PASS@HOST/DB`, `GROQ_API_KEY=`, `EVALLAB_API_KEY=`, `CORS_ORIGINS=http://localhost:3000`. Add a comment block pointing at the Neon dashboard and the `postgresql+asyncpg://` reminder.
- Create `apps/web/.env.local.example` with: `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`, `NEXT_PUBLIC_API_KEY=`.
- Update `CLAUDE.md` "Local run commands" block: drop `docker compose up -d`; replace with: *"Ensure your Neon dev branch is reachable (visit the Neon dashboard once to wake it). Then:"*.

**Verify:** `git status` shows the env templates and the CLAUDE.md edit. (`.gitkeep` cleanup happens in 1.4 right before scaffolding the Next.js app.)

### 1.2 — Backend project bootstrap (`apps/api/`)

**Goal:** `uv`-based FastAPI project that boots and answers `/health`.

- Create `apps/api/pyproject.toml` (`uv` project, deps: `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]>=2.0`, `asyncpg`, `alembic`, `pydantic-settings`, `openai`; dev: `mypy`, `ruff`). `python-multipart` deferred to Phase 2 (only needed for CSV upload).
- `src/__init__.py` (empty).
- `src/config.py` — `pydantic-settings` `Settings` class loading `.env`, fields: `DATABASE_URL: str`, `GROQ_API_KEY: str = ""`, `EVALLAB_API_KEY: str = ""`, `CORS_ORIGINS: str = ""`. Singleton `settings = Settings()`. Helper `cors_list()` returns the comma-split list.
- `src/db.py` — `engine = create_async_engine(settings.DATABASE_URL, ...)`, `AsyncSessionLocal = async_sessionmaker(...)`, `get_db()` async generator dep.
- `src/deps.py` — `verify_api_key(x_api_key: str | None = Header(default=None))`: if `settings.EVALLAB_API_KEY` truthy and header missing/wrong → 401; else pass.
- `src/routes/__init__.py` (empty).
- `src/routes/health.py` — `router = APIRouter()`, `GET /health` → `{"status": "ok", "version": "1.0.0"}`. **No api-key dep on health.**
- `src/main.py` — FastAPI app, `CORSMiddleware` from `settings.cors_list()`, mount health router at prefix `/api/v1`.

**Verify:**
- `cd apps/api && uv sync` succeeds.
- `uv run uvicorn src.main:app --reload` starts.
- `curl http://localhost:8000/api/v1/health` → 200 with the expected JSON.

### 1.3 — Database models + initial migration

**Goal:** all 5 tables exist in the Neon dev branch with the SPEC schema.

- `src/models.py` — declarative Base + 5 ORM models matching SPEC §"Database schema" exactly:
  - `TestSet` (id, name, description, created_at, updated_at)
  - `TestCase` (id, test_set_id FK cascade, input, category, expected_behavior, position, created_at)
  - `Agent` (id, name, system_prompt, model, temperature, max_tokens, created_at, updated_at)
  - `Run` (id, test_set_id FK, agent_id FK, judge_model, status, started_at, completed_at, total_cases, completed_cases, errored_cases, error)
  - `CaseResult` (id, run_id FK cascade, test_case_id FK, agent_prompt_sent, agent_output, agent_latency_ms, judge_prompt_sent, judge_score, judge_reasoning, judge_latency_ms, error, created_at)
  - All UUID PKs default `uuid.uuid4`. All timestamps `DateTime(timezone=True)` with `server_default=func.now()`. Composite index `(run_id, judge_score)` on `case_results`.
- `apps/api/alembic.ini` + `alembic/env.py` — async-aware (uses `engine_from_config` with async driver via `settings.DATABASE_URL`).
- `alembic/script.py.mako` — default template.
- Generate the first revision (`alembic revision --autogenerate -m "initial schema"`), then hand-edit the generated file to ensure UUID/timestamptz/index are exactly right.

**Verify:**
- `alembic upgrade head` succeeds against the Neon dev branch.
- Neon SQL editor: `\d test_sets`, `\d test_cases`, `\d agents`, `\d runs`, `\d case_results` show correct columns; `created_at` is `timestamp with time zone`.
- `alembic downgrade base && alembic upgrade head` round-trips cleanly.

### 1.4 — Frontend project bootstrap (`apps/web/`)

**Goal:** Next.js 15 + Tailwind + shadcn primitives wired, no business logic.

- **Clean the existing skeleton folders first.** From the repo root: `Get-ChildItem apps/web -Recurse -File -Filter .gitkeep | Remove-Item` and then remove the now-empty placeholder dirs (`Remove-Item apps/web/src -Recurse -Force` if present). `pnpm create next-app` refuses to scaffold into a non-empty target.
- `pnpm create next-app@latest apps/web --ts --tailwind --eslint --app --src-dir --import-alias "@/*"` from the repo root.
- `cd apps/web && pnpm dlx shadcn@latest init` (defaults: Tailwind, slate base, CSS variables yes).
- Install shadcn components in one go: `pnpm dlx shadcn@latest add button card input label textarea table dialog select dropdown-menu badge separator sonner tooltip`.
- `src/lib/utils.ts` — shadcn-default `cn()` helper (auto-created by init).
- `src/lib/types.ts` — empty placeholder; later phases append.
- `src/lib/api.ts` — `api(path, init)` fetch wrapper that prepends `process.env.NEXT_PUBLIC_API_BASE_URL`, attaches `X-API-Key` header from `process.env.NEXT_PUBLIC_API_KEY` if set, throws `ApiError` on non-2xx with body text.
- Create `apps/web/.env.local.example` (already done in 1.1).

**Verify:** `pnpm install`, `pnpm dev` boots on 3000, default page renders, `pnpm build` succeeds.

### 1.5 — Layout + nav + wake-up banner

**Goal:** consistent shell across all routes, cold-start UX wired.

- `src/components/nav.tsx` — top nav with "EvalLab" wordmark (left) + four `Button variant="ghost"` links (Test Sets, Agents, Runs, Compare). Active-route highlight via `usePathname`.
- `src/components/wake-up-banner.tsx` — client component:
  - On mount, fire `api("/api/v1/health")`.
  - If still pending after 3s → show fixed-position (top of viewport) banner with `<Loader2 className="animate-spin" />` + the SPEC copy: *"Waking up backend (Render free tier sleeps after 15 min idle). This usually takes 30 to 60 seconds. Hang tight!"*
  - On 2xx → hide banner.
  - If still failing after 90s → swap copy to: *"Backend isn't responding. The free tier may be over its daily quota — try again later."*
- `src/app/layout.tsx` — root layout: `<html lang="en">`, body wraps `<Nav />`, `<WakeUpBanner />`, `<main className="container mx-auto py-8">{children}</main>`, `<Toaster />` from sonner.
- `src/app/globals.css` — already configured by shadcn init; verify slate base.

**Verify:** all routes render with the same nav. Stop the API → hard-refresh `/` → banner appears within ~3s; restart API → banner clears. Happy path: with the API up before page load, banner must NOT flash — it only renders if `/health` is still pending after 3s.

### 1.6 — Stub pages for all routes

**Goal:** all 10 route slots render so navigation never 404s.

- `src/app/page.tsx` — Home: hero + four `Card` grid (Test Sets / Agents / Runs / Compare) with placeholder count `0`. Disabled "Load seed data" button with shadcn `Tooltip` saying "Available after Phase 2".
- `src/app/test-sets/page.tsx`, `new/page.tsx`, `[id]/page.tsx` — heading + "Coming in Phase 2" body.
- `src/app/agents/page.tsx`, `new/page.tsx`, `[id]/page.tsx` — same.
- `src/app/runs/page.tsx`, `new/page.tsx`, `[id]/page.tsx` — same.
- `src/app/compare/page.tsx` — same.

**Verify:** click every nav link, no console errors, no 404s.

### 1.7 — End-to-end verification & commit

**Goal:** confirm Phase 1 checkpoints, surface commit message, stop.

- Run the full local stack: API on 8000, web on 3000.
- Walk through verification list:
  1. `curl /api/v1/health` → 200.
  2. Neon SQL editor: 5 tables present.
  3. All 10 routes render, no console errors.
  4. Banner shows on backend down, clears on backend up.
  5. `pnpm build` clean, `uv run python -m mypy src` clean.
- Per CLAUDE.md rule #1: print one-line summary + suggested commit message in chat:
  ```
  feat: scaffold api + web with health endpoint and wake-up banner
  ```
  Then stop. Do NOT run `git commit`.

## Things explicitly NOT in Phase 1

- No CRUD endpoints, no Pydantic schemas beyond `health` (Phase 2).
- No `services/llm.py`, judge, runner, stats, exporter (Phases 3–5).
- No CSV upload, no seed loader (Phase 2).
- Home cards show hardcoded `0` (Phase 2 wires real counts).
- No README rewrite, no screenshots, no Loom (Phase 6).
- No deploy (Phase 6).
- No `EVALLAB_API_KEY` enforcement test (Phase 6).
