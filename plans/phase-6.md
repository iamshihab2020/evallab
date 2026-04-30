# Phase 6 — Polish + README + Deploy

Maps to [SPEC.md §"Stage 6: Polish + README"](../SPEC.md), **plus the deployment work deferred from Stage 1**. This is the "ship it" phase: the app is feature-complete after Phase 5; here we make it presentable and put it on the public internet.

## Goal

A live, polished URL a recruiter can click through end-to-end. README tells the story (why → what → how → trade-offs). API key in place. Loom recorded.

## Sub-phases

### 6.1 — Visual polish

**Goal:** SPEC §"Frontend UI" minimal style — lots of whitespace, monochrome + one accent, no gradients, default shadcn animations only.

- Decide accent color (suggested: desaturated blue, e.g., `slate-700` + `sky-600` for accents). Lock in `tailwind.config.ts` `theme.extend.colors` if needed.
- Pass over each page: typography hierarchy (`text-3xl font-semibold` for h1, `text-sm text-muted-foreground` for meta), consistent padding (`py-8`, `gap-6`), card usage on dashboards.
- Score distribution bars: ensure consistent height + width scaling, accent color for ≥4, neutral for 1–3.
- Empty states across Test Sets, Agents, Runs, Compare with consistent illustration-free copy.
- Favicon + `app/icon.tsx` (simple "EL" mark).
- Confirm dark-mode is OFF (SPEC §"Things to NOT build" — pick one and ship). Strip dark-mode classes if shadcn added any toggles.

**Verify:** walk through every route at desktop width; check mobile width (responsive enough — not pixel-perfect).

### 6.2 — Code cleanup

**Goal:** the codebase someone will read on a screen-share is presentable.

- Remove every `console.log`, `print` (debug), commented-out code, and `TODO` comment. If something's a real TODO, write a short README "Limitations" line instead.
- Backend: `uv run ruff check src --fix` then `uv run python -m mypy src` — zero warnings.
- Frontend: `pnpm lint --fix` then `pnpm build` — zero warnings.
- Verify all imports/types/exports are tight; nothing exported but unused.

### 6.3 — README

**Goal:** the SPEC §"README template" verbatim, with real screenshots and Loom.

- Replace `README.md` placeholder with the full SPEC template content. **Override the SPEC's "Running it locally" block** to match Phase 1 reality: drop the `docker compose up -d` line; instructions point users to creating a Neon dev branch and pasting that URL into `apps/api/.env`.
- Take 3 screenshots (PNG, ≤1 MB each, committed under `docs/`):
  1. `home.png` — home with cards populated.
  2. `run-detail.png` — completed run with stats + worst-5 expanded.
  3. `compare.png` — compare view with the diff table visible.
- Hero screenshot reference at top → use `run-detail.png`.
- Record Loom (60–90s): clone → seed → run → compare → download. Embed link in README.
- Update `Running it locally` block to match Phase 1 reality (no docker-compose; Neon dev branch).

**Verify:** open README on GitHub; screenshots render; links work; commands match what's actually in the repo.

### 6.4 — Provision Neon (prod)

**Goal:** separate prod database, distinct from the dev branch.

- In Neon dashboard: create a **new branch** off main (or a fresh project) named `prod`.
- Copy connection string. Manually rewrite scheme to `postgresql+asyncpg://` (CLAUDE.md schema invariant).
- Save as `RENDER_DATABASE_URL` for the next sub-phase.

### 6.5 — Deploy backend on Render

**Goal:** FastAPI live on Render free tier.

- Render dashboard → New Web Service → connect GitHub repo, root `apps/api`, branch `main`.
- Build command (per SPEC §"Deployment"): `pip install uv && uv sync --frozen && alembic upgrade head`.
- Start command: `uv run uvicorn src.main:app --host 0.0.0.0 --port $PORT`.
- Env vars:
  - `DATABASE_URL` — the prod Neon URL (with `postgresql+asyncpg://`).
  - `GROQ_API_KEY` — your real key.
  - `EVALLAB_API_KEY` — generate a fresh long random string (e.g., `openssl rand -hex 24`).
  - `CORS_ORIGINS` — set initially to `http://localhost:3000` (so you can hit the live API from local dev). **Do not use `*`** — it's a footgun if anyone ever flips on `allow_credentials`. Update to the exact Vercel URL right after 6.6. Confirm `CORSMiddleware(allow_credentials=False)` since auth is via `X-API-Key` header, not cookies.
- After first deploy: hit `https://<service>.onrender.com/api/v1/health` → 200.
- Verify build log shows `alembic upgrade head` ran against prod Neon → tables now exist in prod.

### 6.6 — Deploy frontend on Vercel

**Goal:** Next.js live on Vercel free tier, talking to Render.

- Vercel → New Project → import repo, root `apps/web`.
- Env vars (production):
  - `NEXT_PUBLIC_API_BASE_URL` = Render URL.
  - `NEXT_PUBLIC_API_KEY` = same value as `EVALLAB_API_KEY` on backend.
- Deploy. Note the live URL.
- Go back to Render and update `CORS_ORIGINS` from `*` to the Vercel URL (+ `http://localhost:3000` for dev convenience). Restart Render service.

**Verify:**
- Open the Vercel URL fresh after Render has been idle ≥15 min.
- Wake-up banner appears within ~3s; clears in 30–90s when Render finishes warming.
- Network tab: `X-API-Key` header present on every API request.
- Without the key (temporarily strip it from the frontend env or hit the API direct via curl) → 401.

### 6.7 — Production smoke test

**Goal:** demonstrate every acceptance criterion from SPEC §"Final acceptance criteria" on the live URL.

- Load seed data → 30 cases + 2 agents.
- Run agent v1 → full results in <3 min.
- Run agent v2 → compare → diff table visible.
- Compare across different test sets (manually pick a fresh test set) → reject message visible.
- Download Markdown report → opens cleanly.
- Show full prompts toggle → reveals SYSTEM/USER text.
- Trigger the errors path cleanly: temporarily set `GROQ_API_KEY=invalid` on Render, start a small run against a 3-case scratch test set, confirm `errored_cases` populates and the run still completes. Restore the real key.

### 6.8 — Final commit + tag

- Per CLAUDE.md rule #1: surface each commit milestone with a one-line summary + suggested message in chat, then stop. Do NOT run `git commit`. Likely milestones:
  - `chore: visual polish and code cleanup`
  - `docs: full README with screenshots and demo loom`
  - `chore: deploy to vercel + render + neon`
- Once user confirms everything live: suggest `git tag v1.0.0` (user runs it manually).

## Things NOT in Phase 6

- No SSE streaming (Phase 7, optional).
- No new features (SPEC scope discipline).
- No prompt-versioning, cost tracking, multi-judge, or other items from SPEC §"How I'd evolve this" — those are README talking points only.
