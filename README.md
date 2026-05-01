# EvalLab

A small web app for evaluating LLM outputs systematically. Define test sets, define agents, run them against an LLM-as-judge, compare the diff. Ship prompts with numbers, not vibes.

> **Heads up:** the backend runs on Render's free tier and spins down after ~15 min idle. Your first request after a quiet period will take 30–60 s while it wakes. The frontend shows a banner during the wait. Subsequent requests are fast.

---

## Why this exists

Most teams shipping LLM features evaluate on vibes — eyeball five outputs, "looks good," ship it. Two weeks later something regresses and nobody notices until a customer complaint.

EvalLab fixes this for one person: define a test set of inputs and expected behaviors, define an agent (prompt + model), run them, and get scored, comparable results. Change the prompt, run again, see if your change actually helped — with numbers, not vibes.

I built this after working on production LLM agents at my day job and noticing how thin the eval discipline usually is.

## How it works

EvalLab has four primitives:

1. **Test set** — a list of cases. Each case has an input, an optional category, and a written description of the expected behavior.
2. **Agent** — a prompt + model that responds to inputs. Edits create a new immutable prompt **version**; runs pin to a version so historical scores never become unreproducible.
3. **Run** — execute an agent against a test set. Each output is scored 1–5 by a judge LLM against four dimensions (**accuracy, completeness, tone, safety**) with a derived overall score.
4. **Compare** — diff two runs to see which cases improved or regressed, plus a per-dimension delta breakdown.

A 30-case run takes ~2–3 minutes on Groq's free tier (rate-limited to 28 RPM by the runner, with 429 retries as a safety net).

### What's in the box beyond the basics

- **Failure clustering.** Click "Find failure patterns" on a run; the judge model groups low-scoring cases by failure mode (e.g. "Hallucinated policy details", "Failed to ask for order ID") so you fix root causes, not symptoms.
- **Compare insight.** Click "Explain the difference" on a comparison; the model writes a short prose explanation of the behavioral change between two prompts, with improved/regressed themes.
- **Judge calibration.** Score cases by hand on the calibration page; EvalLab computes Cohen's κ and a 5×5 confusion matrix between the human and the LLM judge so you know how much to trust the judge.
- **Cost tracking.** Token counts captured per call, rolled into per-run totals plus a quota-meter pill in the nav showing today's spend against Groq's 100k TPD limit.
- **Three demo datasets.** SMS Customer Support, Code Review, and Mental Health Companion — each with two paired agents that produce a different dimensional contrast (tone-driven, completeness-driven, safety↔completeness trade-off).

## Stack

- **Frontend:** Next.js 16 + TypeScript + TailwindCSS + shadcn/ui (Vercel)
- **Backend:** FastAPI + Python 3.11 + SQLAlchemy 2.0 (async) (Render)
- **Database:** PostgreSQL on Neon
- **LLM provider:** Groq — Llama 3.3 70B for both agent and judge by default
- **Total cost:** $0/month on free tiers

## Running it locally

You'll need a Neon dev branch (free, no card) and a Groq API key (free, no card). Both take about a minute to set up.

```bash
# 1. Clone
git clone https://github.com/iamshihab2020/evallab
cd evallab

# 2. Backend
cd apps/api
cp .env.example .env
# Fill in DATABASE_URL (Neon connection string with the asyncpg scheme) and GROQ_API_KEY
uv sync
uv run alembic upgrade head
uv run uvicorn src.main:app --reload   # http://localhost:8000

# 3. Frontend (new terminal)
cd apps/web
cp .env.local.example .env.local
pnpm install
pnpm dev                                # http://localhost:3000
```

Open <http://localhost:3000>. The first time the backend boots, it auto-seeds three demo test sets (SMS Support, Code Review, Mental Health) so the home page has something to compare against immediately. Idempotent on every restart.

### Quick env-var reference

| Var | Where | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | api | yes | Must use `postgresql+asyncpg://` scheme |
| `GROQ_API_KEY` | api | yes | From <https://console.groq.com> |
| `EVALLAB_API_KEY` | api | prod only | When set, every request must carry `X-API-Key` |
| `CORS_ORIGINS` | api | yes | Comma-separated; include `http://localhost:3000` for dev |
| `NEXT_PUBLIC_API_BASE_URL` | web | yes | Backend URL (`http://localhost:8000` locally) |
| `NEXT_PUBLIC_API_KEY` | web | prod only | Must equal `EVALLAB_API_KEY` |

## Deploying

Free tier across all three services. ~10 minutes start to finish.

### 1. Database — Neon

1. Sign up at <https://console.neon.tech> (no card).
2. Create a project. The default region is fine.
3. Copy the connection string from the dashboard.
4. **Rewrite the scheme** from `postgresql://` to `postgresql+asyncpg://`. SQLAlchemy will refuse to start otherwise.

### 2. Backend — Render

The repo ships with [`render.yaml`](./render.yaml) so the deploy is reproducible:

1. Push the repo to GitHub.
2. In Render, **New → Blueprint**, point at the repo. Render reads `render.yaml` and creates the `evallab-api` service automatically.
3. Render will prompt for the four secret env vars. Paste:
   - `DATABASE_URL` — the Neon string with the `postgresql+asyncpg://` scheme
   - `GROQ_API_KEY` — your Groq key
   - `EVALLAB_API_KEY` — generate a long random string (e.g. `openssl rand -hex 32`)
   - `CORS_ORIGINS` — placeholder for now, e.g. `http://localhost:3000`. We'll add the Vercel URL in step 4.
4. Render builds, runs `alembic upgrade head`, then starts uvicorn. The lifespan auto-seeds the three demo datasets on first boot.

The `healthCheckPath: /api/v1/health` line in `render.yaml` lets Render verify the deploy actually served a request before swapping in the new revision.

### 3. Frontend — Vercel

1. <https://vercel.com> → **New Project** → import the GitHub repo.
2. Set the **Root Directory** to `apps/web`. Next.js is auto-detected; keep the default build/install commands.
3. Add the two env vars:
   - `NEXT_PUBLIC_API_BASE_URL` — your Render service URL (e.g. `https://evallab-api.onrender.com`)
   - `NEXT_PUBLIC_API_KEY` — same value you gave Render's `EVALLAB_API_KEY`
4. Deploy. Vercel gives you a `*.vercel.app` URL.

### 4. Tie it back together

Go back to Render and update `CORS_ORIGINS` to include your Vercel URL:

```
CORS_ORIGINS=http://localhost:3000,https://your-app.vercel.app
```

Render redeploys automatically. The wake-up banner handles the first cold start gracefully.

## Design decisions worth calling out

- **No auth.** EvalLab is a single-user tool. The deployed instance has a simple `X-API-Key` header to prevent randos burning my Groq quota — that's it.
- **Llama 3.3 70B as both agent and judge.** I tried GPT-4 and Claude as judges — they're better — but Groq's free tier and speed (200+ TPS) made Llama 3.3 the right tradeoff. The judge prompt matters more than the model choice in most cases.
- **Token-bucket rate limiter at 28 RPM.** Groq's free tier ceiling for Llama 3.3 70B is 30 RPM. The runner caps itself at 28 to leave margin, with 429 retries (1 → 8 s exponential backoff, max 4 attempts) as a safety net.
- **Per-case errors don't fail the run.** If one case throws (network blip, malformed judge response after retries), it's marked errored and the run continues. Stats compute over successful cases only. Token spend on partially-failed cases is still captured so cost reflects reality.
- **Polling instead of SSE.** A run takes 2–3 minutes. Polling every 2 s is simple and works.
- **Pass-rate threshold = score ≥ 4.** In practice, scores of 3 still represent "the agent missed something important."
- **Dimensional rubric.** The judge scores accuracy, completeness, tone, and safety independently and derives the overall from those. The breakdown surfaces in the run-detail page and the compare deltas, so you can see _which_ dimension a prompt change moved.
- **Prompt versioning.** Editing an agent creates a new immutable `AgentVersion` row. Runs pin to a version, so a year-old run still references the prompt that produced it even if the agent has been edited 50 times since.
- **Auto-seed on cold start.** Every Render boot calls `auto_seed_on_startup`, which is idempotent (checks each test set by name). New deploys come up with demo data without anyone touching the dashboard.

## Limitations and what's next

- **Judge model bias.** LLM-as-judge has known biases — verbosity bias, position bias, self-preference. The dimensional rubric mitigates some of this; ensemble judges would mitigate more. Not addressed.
- **Judge calibration is a tool, not a guarantee.** The calibration page measures κ but I don't currently use it to gate which judges/models you trust. A real eval system would.
- **No "rerun this case" affordance.** If one case errors, you re-run the whole test set.
- **Single LLM provider.** Adding OpenRouter would let users compare models across providers in the same run.
- **No async job queue.** Runs use FastAPI `BackgroundTasks`. If Render restarts the worker mid-run, the run is marked failed by `heal_orphaned_runs` on the next cold start — no resume.
- **No public sharing.** Runs are private to whoever holds `EVALLAB_API_KEY`. Signed read-only URLs would be a small addition.

## How I'd evolve this for production

If this were a real product team's tool:

- **Async job queue** (Arq or Celery + Redis) instead of FastAPI BackgroundTasks, so runs survive restarts and can be cancelled.
- **Webhook-based eval triggers** so prompt PRs in a real product repo can fire an eval run and post results back before merge. The whole point of eval-driven development.
- **Multi-judge ensembles** for important rubrics, with disagreement surfacing.
- **Cost tracking by team / project / run** with budget alerts. The per-run rollup is in place; aggregating up is the rest.
- **Public sharing** of runs via signed URLs (read-only), so a "look at this regression" link can land in Slack without exposing the API key.
- **Per-test-set rubrics** so technical test sets can use a different rubric than emotional-support test sets, instead of one global four-dimension grid.

## License

All rights reserved. The source is published here for portfolio review;
reuse, redistribution, or derivative works require written permission.
See [LICENSE](./LICENSE).

---

Built by [Sheikh Shihab Hossain](https://shihab-portfolio.vercel.app/).
