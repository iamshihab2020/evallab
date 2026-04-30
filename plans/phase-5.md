# Phase 5 — Compare + Markdown Export

Maps to [SPEC.md §"Stage 5: Compare + Export"](../SPEC.md). Phase 4 ships single runs; this phase makes them comparable and exportable so the user can demonstrate "v1 vs v2" deltas with numbers.

## Goal

User picks two completed runs against the **same test set**, sees side-by-side stats + per-case diff (improved / regressed / unchanged). User can also download any run as a Markdown report.

## Sub-phases

### 5.1 — Compare schemas

**Goal:** types for `/runs/compare` response.

- Append to `apps/api/src/schemas.py`:
  - `RunCompare { run_a: RunDetail, run_b: RunDetail, pass_rate_delta: float, cases_improved: list[UUID], cases_regressed: list[UUID], cases_unchanged: list[UUID], cases_errored: list[UUID] }`. *Extends SPEC §"Pydantic schemas" with `cases_errored` so cases that errored in either run are reported separately rather than silently lumped into `unchanged`.*

### 5.2 — Compare endpoint

**Goal:** `GET /runs/compare?a=&b=` with strict same-test-set guard.

- In `routes/runs.py`:
  - `GET /runs/compare?a={UUID}&b={UUID}`.
  - Load both `RunDetail`. **If `run_a.test_set_id != run_b.test_set_id` → 400 with the exact message from SPEC**: `"Cannot compare runs from different test sets. Run A used test set X; Run B used test set Y."` (substitute names).
  - **If either run's `status != "completed"` → 409 with `"Both runs must be completed before comparison."`**
  - Build buckets by `test_case_id`:
    - Cases errored in either run → `cases_errored` (skipped from improved/regressed/unchanged).
    - For remaining cases (both have non-null scores): `delta = b.score - a.score`. `improved` if `delta > 0`, `regressed` if `delta < 0`, else `unchanged`.
  - `pass_rate_delta = b.stats.pass_rate - a.stats.pass_rate`.

**Verify:** call with two same-test-set completed runs → returns full structure with the four buckets; mismatched test sets → 400; either run still `running` → 409.

### 5.3 — Markdown exporter

**Goal:** `services/exporter.py` builds the report exactly per SPEC §"Markdown export".

- `apps/api/src/services/exporter.py`:
  - `def export_run_md(run: RunDetail) -> str`.
  - Sections per SPEC: Header (run id, test set, agent + model, judge, started/completed), Summary (pass rate %, avg score, totals), Score Distribution table, Per-Category Breakdown table, Worst 5 Cases (each with input / expected / agent output / judge reasoning).
  - Use `f"{x:.1%}"` for percentages, `f"{y:.2f}"` for averages, ISO timestamps.

### 5.4 — Export endpoint

**Goal:** `GET /runs/{id}/export?format=md` returns `text/markdown` attachment.

- In `routes/runs.py`:
  - `GET /runs/{id}/export?format=md`.
  - Currently only `md` supported; reject other values with 400.
  - Build `RunDetail` (with stats), call `export_run_md`, return `Response(content=md, media_type="text/markdown", headers={"Content-Disposition": f'attachment; filename="evallab-run-{id}.md"'})`.
  - Reject if run not completed.

**Verify:** `curl -OJ http://.../api/v1/runs/{id}/export?format=md` saves a `.md` file that opens cleanly in any Markdown viewer.

### 5.5 — Frontend: Download button on Run detail

**Goal:** wire the placeholder button from Phase 4.

- In `app/runs/[id]/page.tsx`:
  - "Download Markdown Report" `Button` only enabled when `status === "completed"`.
  - On click: use the existing `lib/api.ts` wrapper to GET the export URL with `X-API-Key` (no cookies — header-based auth). Read response as blob via `.blob()`, create `URL.createObjectURL(blob)`, programmatic `<a download={filename}>` click, then `revokeObjectURL`. Helper: `lib/download.ts`.

**Verify:** click button → file downloads with correct name + content.

### 5.6 — Frontend: Compare page

**Goal:** the headline feature for the portfolio piece.

- `app/compare/page.tsx`:
  - **Run A `Select`** — list of completed runs (newest first), label format `"{test_set.name} · {agent.name} · {started_at}"`.
  - **Run B `Select`** — disabled until A is picked. Once A is picked, options filter to runs where `test_set_id === runA.test_set_id` AND `id !== runA.id`.
  - On both selected, fetch `/runs/compare?a=&b=`. On 400 (mismatch) → show inline error with the backend message.
- Display once data loads:
  - **Headline**: *"Run A: 87% · Run B: 82% · Δ -5%"* with green/red color on the delta.
  - **Two columns** side-by-side: stats card per run (pass rate, avg, distribution mini-bars).
  - **Diff table**: row per test case present in both. Columns: input (truncated), category, A score, B score, Δ. Sortable by Δ. Row highlight: green bg if improved, red bg if regressed, neutral if unchanged.
  - Click a row → `Dialog` with side-by-side outputs (A vs B), expected behavior, judge reasonings.
- Counts under the table: "N improved, M regressed, K unchanged" matching the buckets from the API.

**Verify:**
- Run agent v1 + agent v2 against the same seed test set → compare → see realistic diffs (likely v2 wins on `complaint`, similar on `qa`).
- Try comparing across different test sets → backend rejects with the exact SPEC message; UI surfaces it cleanly.

### 5.7 — End-to-end verification & commit

- Two seed runs comparable; diffs make sense; download button works on each.
- Mismatched-test-set rejection visible.
- `pnpm build` + mypy clean.
- Per CLAUDE.md rule #1: surface a one-line summary + commit message (e.g., `feat: compare view + markdown export`) in chat, then stop. Do NOT run `git commit`.

## Things NOT in Phase 5

- No CSV export (SPEC says Markdown only).
- No comparing >2 runs (SPEC scope).
- No share-link / public read-only view (SPEC §"Things to NOT build").
- No deploy yet (Phase 6).
