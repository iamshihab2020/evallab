"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { CaseResult, RunCompare, RunListItem } from "@/lib/types";

type SortDir = "improved" | "regressed" | "none";

export default function ComparePage() {
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<RunListItem[]>("/api/v1/runs"),
  });

  const completed = useMemo(
    () => (runsQuery.data ?? []).filter((r) => r.status === "completed"),
    [runsQuery.data],
  );

  const [aId, setAId] = useState<string | undefined>();
  const [bId, setBId] = useState<string | undefined>();

  const a = completed.find((r) => r.id === aId);
  const bOptions = a
    ? completed.filter((r) => r.test_set_id === a.test_set_id && r.id !== a.id)
    : [];

  const compareQuery = useQuery({
    queryKey: ["compare", aId, bId],
    queryFn: () => api<RunCompare>(`/api/v1/runs/compare?a=${aId}&b=${bId}`),
    enabled: !!aId && !!bId,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compare runs</h1>
        <p className="text-sm text-muted-foreground">
          Pick two completed runs against the same test set.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Run A</Label>
          <Select
            value={aId}
            onValueChange={(v) => {
              setAId(v);
              setBId(undefined);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick run A" />
            </SelectTrigger>
            <SelectContent>
              {completed.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.test_set_name} · {r.agent_name} · {formatDateTime(r.started_at)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Run B</Label>
          <Select value={bId} onValueChange={setBId} disabled={!aId}>
            <SelectTrigger>
              <SelectValue
                placeholder={aId ? "Pick run B" : "Pick run A first"}
              />
            </SelectTrigger>
            <SelectContent>
              {bOptions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.test_set_name} · {r.agent_name} · {formatDateTime(r.started_at)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {compareQuery.error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {compareQuery.error instanceof ApiError && compareQuery.error.body
            ? compareQuery.error.body
            : compareQuery.error.message}
        </p>
      )}

      {compareQuery.data && <CompareView data={compareQuery.data} />}
    </div>
  );
}

function CompareView({ data }: { data: RunCompare }) {
  const [sort, setSort] = useState<SortDir>("none");
  const [open, setOpen] = useState<{ a: CaseResult; b: CaseResult } | null>(null);

  const pa = data.run_a.stats?.pass_rate ?? 0;
  const pb = data.run_b.stats?.pass_rate ?? 0;
  const delta = data.pass_rate_delta;
  const deltaColor = delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "";

  const aBy = new Map(data.run_a.case_results.map((c) => [c.test_case_id, c]));
  const bBy = new Map(data.run_b.case_results.map((c) => [c.test_case_id, c]));
  const sharedIds = [...aBy.keys()].filter((id) => bBy.has(id));

  const rows = sharedIds.map((id) => {
    const a = aBy.get(id)!;
    const b = bBy.get(id)!;
    const errored = !!(a.error || b.error || a.judge_score == null || b.judge_score == null);
    const d = !errored ? (b.judge_score! - a.judge_score!) : 0;
    return { id, a, b, errored, delta: d };
  });

  if (sort === "improved") rows.sort((x, y) => y.delta - x.delta);
  if (sort === "regressed") rows.sort((x, y) => x.delta - y.delta);

  return (
    <div className="space-y-6">
      <div className="rounded-md border p-4 text-lg">
        <span className="font-semibold">Run A:</span> {(pa * 100).toFixed(0)}%{" "}
        <span className="mx-2 text-muted-foreground">·</span>
        <span className="font-semibold">Run B:</span> {(pb * 100).toFixed(0)}%{" "}
        <span className="mx-2 text-muted-foreground">·</span>
        <span className={`font-semibold ${deltaColor}`}>
          Δ {delta > 0 ? "+" : ""}
          {(delta * 100).toFixed(0)}%
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RunStatsCard label="Run A" run={data.run_a} />
        <RunStatsCard label="Run B" run={data.run_b} />
      </div>

      <div className="text-sm text-muted-foreground">
        {data.cases_improved.length} improved · {data.cases_regressed.length} regressed
        · {data.cases_unchanged.length} unchanged
        {data.cases_errored.length > 0 && (
          <> · {data.cases_errored.length} errored</>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Per-case diff</h2>
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setSort("none")}
              className={`rounded px-2 py-1 ${sort === "none" ? "bg-muted" : ""}`}
            >
              Default
            </button>
            <button
              onClick={() => setSort("improved")}
              className={`rounded px-2 py-1 ${sort === "improved" ? "bg-muted" : ""}`}
            >
              Most improved
            </button>
            <button
              onClick={() => setSort("regressed")}
              className={`rounded px-2 py-1 ${sort === "regressed" ? "bg-muted" : ""}`}
            >
              Most regressed
            </button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Input</TableHead>
              <TableHead className="text-right">A</TableHead>
              <TableHead className="text-right">B</TableHead>
              <TableHead className="text-right">Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const bg = r.errored
                ? ""
                : r.delta > 0
                ? "bg-green-50 dark:bg-green-950/30"
                : r.delta < 0
                ? "bg-red-50 dark:bg-red-950/30"
                : "";
              return (
                <TableRow
                  key={r.id}
                  className={`cursor-pointer ${bg}`}
                  onClick={() => setOpen({ a: r.a, b: r.b })}
                >
                  <TableCell className="max-w-md truncate text-sm">
                    {extractInput(r.a)}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.a.error ? (
                      <Badge variant="destructive">err</Badge>
                    ) : (
                      <Badge variant="secondary">{r.a.judge_score}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.b.error ? (
                      <Badge variant="destructive">err</Badge>
                    ) : (
                      <Badge variant="secondary">{r.b.judge_score}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.errored ? "—" : r.delta > 0 ? `+${r.delta}` : r.delta}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Case comparison</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-4 text-sm">
              <p className="font-medium">{extractInput(open.a)}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <CaseSide label="Run A" cr={open.a} />
                <CaseSide label="Run B" cr={open.b} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RunStatsCard({
  label,
  run,
}: {
  label: string;
  run: RunCompare["run_a"];
}) {
  const s = run.stats;
  return (
    <div className="rounded-md border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{label}</h3>
        <span className="text-sm text-muted-foreground">{run.agent_name}</span>
      </div>
      {s && (
        <>
          <div className="text-2xl font-semibold tabular-nums">
            {(s.pass_rate * 100).toFixed(0)}%
          </div>
          <div className="text-sm text-muted-foreground">
            avg {s.avg_score.toFixed(2)} · {s.successful_cases}/{s.total_cases} scored
          </div>
          <div className="space-y-1 pt-2">
            {[1, 2, 3, 4, 5].map((i) => {
              const n = s.score_distribution[String(i)] ?? 0;
              const pct = s.successful_cases > 0 ? (n / s.successful_cases) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-3 text-xs tabular-nums">{i}</span>
                  <div className="h-2 flex-1 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-foreground/70" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-right text-xs tabular-nums">{n}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function CaseSide({ label, cr }: { label: string; cr: CaseResult }) {
  return (
    <div className="space-y-2 rounded border p-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{label}</p>
        {cr.error ? (
          <Badge variant="destructive">err</Badge>
        ) : (
          <Badge variant="secondary">score {cr.judge_score}</Badge>
        )}
      </div>
      {cr.error ? (
        <pre className="text-xs text-destructive whitespace-pre-wrap">{cr.error}</pre>
      ) : (
        <>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Output</p>
            <pre className="whitespace-pre-wrap text-sm">{cr.agent_output}</pre>
          </div>
          {cr.judge_reasoning && (
            <div>
              <p className="text-xs uppercase text-muted-foreground">Judge</p>
              <p className="text-sm">{cr.judge_reasoning}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function extractInput(cr: CaseResult): string {
  if (!cr.agent_prompt_sent) return cr.error || "—";
  const idx = cr.agent_prompt_sent.indexOf("USER:\n");
  return idx >= 0 ? cr.agent_prompt_sent.slice(idx + 6) : cr.agent_prompt_sent;
}
