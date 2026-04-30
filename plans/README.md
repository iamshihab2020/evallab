# EvalLab Plans

Phase-by-phase implementation plan for EvalLab. Each phase maps to a stage in [SPEC.md](../SPEC.md). All seven phases are detailed up front; Phase 7 is optional (gated decision). We still implement **one phase at a time** (per CLAUDE.md rule #3) and re-read the next phase before starting it.

| Phase | File | SPEC stage | Status |
|---|---|---|---|
| 1 | [phase-1.md](./phase-1.md) | Stage 1 — Skeleton (deploy deferred) | Detailed |
| 2 | [phase-2.md](./phase-2.md) | Stage 2 — CRUD + seed | Detailed |
| 3 | [phase-3.md](./phase-3.md) | Stage 3 — Single-case (LLM + judge + debug) | Detailed |
| 4 | [phase-4.md](./phase-4.md) | Stage 4 — Full Run (runner + stats + UI) | Detailed |
| 5 | [phase-5.md](./phase-5.md) | Stage 5 — Compare + Markdown export | Detailed |
| 6 | [phase-6.md](./phase-6.md) | Stage 6 — Polish + README + **Deploy** | Detailed |
| 7 | [phase-7.md](./phase-7.md) | Stage 7 — Optional SSE streaming | Detailed (optional) |

## Decisions locked in

- **Package manager (web):** pnpm
- **Local DB:** Neon dev branch (no docker-compose)
- **Deploy:** deferred from Stage 1 → Phase 6 per user's choice. Phase 1 is local-only.
- All other stack choices follow SPEC.md exactly.
