# CLAUDE.md — EvalLab

Project-specific guidance for Claude Code working in this repo. Read once, refer back as needed.

The build plan, schemas, API design, and rationale live in [SPEC.md](./SPEC.md). This file captures **how to work** on the project; SPEC.md captures **what to build**.

---

## Hard rules from the user (do not break these)

1. **Never run `git commit` yourself.** When work reaches a logical commit milestone, stop coding, surface a one-line summary plus a suggested commit message in chat, and wait for the user to run the commit. The user wants continuous commits but drives them manually.
2. **shadcn first, polish later.** Use `shadcn/ui` primitives for every UI element. Don't hand-roll Buttons/Inputs/Tables/Dialogs/Selects when shadcn provides them. Defer spacing/colors/animations until functionality works — visual polish is a Stage 6 concern.
3. **Build in stages.** Implement Stages 1-7 from SPEC §"Implementation stages" one at a time. After each stage, stop and wait for the user to test before moving on.
4. **Honor scope discipline.** SPEC §"Things to NOT build" is a hard list. If asked to add anything on it, push back gently and point at the spec.

---

## Stack (do not deviate — locked by SPEC)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + TailwindCSS + shadcn/ui |
| Backend | FastAPI (Python 3.11+), `uv` for package management |
| Database | PostgreSQL — Neon in prod, local Postgres via `docker-compose` in dev |
| ORM / migrations | SQLAlchemy 2.0 (async) + Alembic |
| LLM provider | Groq (`llama-3.3-70b-versatile` for both agent-under-test and judge) |
| State | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Icons | Lucide React |
| Hosting | Vercel (web) + Render (api) + Neon (db) — all free tier |

If you think a different choice is better, mention it once but **default to the locked stack.**

---

## Free-tier constraints that shape the architecture

These aren't preferences — they decide design.

- **Groq: 30 RPM / 6k TPM / 1k RPD.** The runner caps itself at **28 RPM** via a token-bucket limiter and retries 429 with exponential backoff (1, 2, 4, 8 s, max 4 retries). A 30-case run = 60 LLM calls ≈ 2-3 min minimum. See SPEC §"The LLM client".
- **Render free tier sleeps after 15 min idle**, cold start 30-90 s. Frontend must show a wake-up banner; first paint fires `/api/v1/health` immediately. See `components/wake-up-banner.tsx` once built.
- **Neon free tier auto-suspends after 5 min idle**, wake ≈ 1-3 s. Invisible in normal use, but the Postgres URL **must use the `postgresql+asyncpg://` scheme** (not the default `postgresql://`) so SQLAlchemy uses the async driver.

---

## Schema invariants

- **All timestamp columns are `timestamptz`** (PostgreSQL `TIMESTAMP WITH TIME ZONE`). The frontend renders in browser-local time via `Intl.DateTimeFormat`. Never use naive timestamps.
- **All primary keys are UUID v4.** URLs aren't enumerable; future "share a run publicly" feature stays safe by default.
- **Per-case errors don't fail the run.** A case that throws is marked `errored=true`; the run continues. Stats compute over `successful_cases` only.

---

## Auth model

No user accounts. If the env var `EVALLAB_API_KEY` is set on the backend, every request must carry `X-API-Key: <key>`. If unset, the auth check is a no-op (local dev). The frontend reads `NEXT_PUBLIC_API_KEY` and injects it via the `lib/api.ts` fetch wrapper.

---

## Local run commands (once code lands)

```bash
# Database
docker compose up -d

# Backend (from apps/api)
uv sync
cp .env.example .env  # fill GROQ_API_KEY
alembic upgrade head
python -m src.seeds.sms_support_v1   # optional seed
uv run uvicorn src.main:app --reload

# Frontend (from apps/web)
pnpm install
cp .env.local.example .env.local
pnpm dev
```

Open <http://localhost:3000>.

---

## Repo layout (target — see SPEC §"Repo structure" for the full tree)

```
EvalLab/
├── SPEC.md           # authoritative build plan
├── CLAUDE.md         # this file
├── README.md         # placeholder until Stage 6
├── docker-compose.yml
├── apps/
│   ├── api/          # FastAPI + SQLAlchemy + Alembic + Groq client
│   └── web/          # Next.js 15 + shadcn/ui
└── .github/workflows/
```

---

## When you finish a chunk of work

1. Briefly describe what landed.
2. Suggest the next commit message in fenced text.
3. **Stop.** Wait for the user to commit before continuing.

Suggested commit-message style: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`). Keep the subject under 72 chars; use the body for rationale when non-obvious.

---

## When in doubt

- Prefer simple over clever — this code will be walked through in interviews.
- Prefer shipping a stage over polishing a stage.
- If the spec is ambiguous, ask the user instead of guessing.
- If asked to add a feature in SPEC §"Things to NOT build", push back: "Save it for after v1 ships."
