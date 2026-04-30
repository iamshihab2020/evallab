// Shared TS types. Phase 2+ will append concrete interfaces mirroring the
// Pydantic schemas in apps/api/src/schemas.py.

export type HealthResponse = {
  status: string;
  version: string;
};
