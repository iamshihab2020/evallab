# Phase 7 — Streaming Progress (optional)

Maps to [SPEC.md §"Stage 7 (optional): Streaming progress"](../SPEC.md). **Skip this phase unless Phase 6 felt too easy.** 2s polling is good enough for a portfolio piece, and SSE adds operational risk on Render's free tier (long-lived connections behave inconsistently when the dyno is approaching sleep).

## Goal

Replace 2s polling on the Run detail page with Server-Sent Events. Each judged case streams in as it completes; UI updates without a poll request.

## Decision gate (do this first)

Before starting, answer:

- Did Phase 6 ship cleanly? If not → finish Phase 6 first.
- Has the user actually noticed the 2s polling lag? If no → don't ship this; document the choice in README "Limitations".
- Is the user willing to accept that on Render free tier, an idle 5-min connection can drop and require reconnection? If no → skip.

If all three are yes, proceed.

## Sub-phases

### 7.1 — Event channel inside the runner

**Goal:** the runner emits events instead of (or alongside) DB writes triggering polling reads.

- `apps/api/src/services/events.py`:
  - `class RunEventBus`: per-run-id, holds an `asyncio.Queue[dict]`. Methods: `publish(run_id, event)`, `subscribe(run_id) -> AsyncIterator[dict]`, `close(run_id)`.
  - Module-level singleton `event_bus = RunEventBus()`.
- Update `services/runner.py`: after each case persists, `await event_bus.publish(run_id, {"type": "case_completed", "completed_cases": N, "total_cases": T, "case_result": <minimal payload>})`. On terminal status, publish `{"type":"run_completed", ...}` and `event_bus.close(run_id)`.

### 7.2 — SSE endpoint

**Goal:** `GET /api/v1/runs/{id}/stream` emits `text/event-stream`.

- New route in `routes/runs.py`:
  - Use FastAPI's `StreamingResponse` with `media_type="text/event-stream"`.
  - On connect: emit one initial event with the current run snapshot (so reconnects sync state).
  - Then `async for event in event_bus.subscribe(id): yield f"data: {json.dumps(event)}\n\n"`.
  - Heartbeat: yield `: keepalive\n\n` every 15s so proxies don't drop the connection.
  - Close cleanly on client disconnect (FastAPI raises `asyncio.CancelledError` on disconnect — catch to clean up subscription).

**Verify:** `curl -N http://localhost:8000/api/v1/runs/{id}/stream` shows events arriving live during a run.

### 7.3 — Frontend EventSource integration

**Goal:** Run detail page subscribes via EventSource instead of polling.

- `app/runs/[id]/page.tsx`:
  - When `status` is `pending` or `running`, open an `EventSource(streamUrl)`. EventSource doesn't support custom headers, so `X-API-Key` rides in a query param `?api_key=` for the stream endpoint only — backend accepts the fallback there. **Trade-off:** query-string secrets show up in CDN/proxy/access logs. Acceptable here because the key is a soft barrier (single-user portfolio app, not a security boundary). Document in README §"Limitations".
  - On `case_completed` events → update the local TanStack Query cache (`queryClient.setQueryData`) with new completed_cases + push the case_result.
  - On `run_completed` → close the connection, run a final `invalidateQueries` to refresh stats.
  - Reconnect on `error`: exponential backoff (1, 2, 4, 8s, max 60s), give up after 5 min and fall back to polling.
- Keep the polling code path as a recovery fallback. Feature flag `NEXT_PUBLIC_USE_SSE` defaults to **`true`** once Phase 7 ships (the whole point); flip to `false` only as an emergency kill-switch. The polling path also auto-engages after 5 min of failed reconnects.

**Verify:** start a run → progress bar updates within ~100ms of each case completing (no 0–2s lag); kill the API mid-run, restart → frontend reconnects and resumes.

### 7.4 — Render cold-start handling

**Goal:** SSE doesn't make cold-start UX worse.

- If the EventSource fails to connect within 90s, surface the same fallback message as the wake-up banner.
- Consider: skip SSE entirely on the very first visit (poll until first 200) and only upgrade to SSE after the backend is warm. Saves complexity in the cold-start path.

### 7.5 — End-to-end verification & commit

- Recorded run shows updates within ~100ms of each case completion.
- Cold-start scenario still works; banner clears as before.
- Disable Wi-Fi mid-run → frontend auto-reconnects + resumes.
- README: update "Polling instead of SSE" line under Design Decisions to reflect the new behavior, but keep the trade-off discussion.
- Per CLAUDE.md rule #1: surface a one-line summary + commit message (e.g., `feat: stream run progress via SSE with polling fallback`) in chat, then stop. Do NOT run `git commit`.

## Things NOT in Phase 7

- No client → server messages (it's one-way SSE, not WebSockets).
- No persistent event log (events are ephemeral; the DB remains the source of truth).
- No multi-tab sync beyond what comes for free from each tab subscribing independently.
