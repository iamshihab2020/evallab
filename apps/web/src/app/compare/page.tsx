"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type {
  CaseResult,
  CompareInsight,
  RunCompare,
  RunListItem,
} from "@/lib/types";

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

  const noRuns = !runsQuery.isLoading && completed.length < 2;

  return (
    <div>
      <PageHeader
        title="Compare runs"
        blurb="Pick two completed runs against the same test set. See what improved, regressed, and stayed the same."
      />

      <div className="space-y-8">
        <div className="rounded-lg border border-border bg-card p-6 fade-up">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-end">
            <div className="space-y-2">
              <Label>Run A (baseline)</Label>
              <Select
                value={aId}
                onValueChange={(v) => {
                  setAId(v);
                  setBId(undefined);
                }}
                disabled={completed.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={completed.length === 0 ? "No completed runs" : "Pick run A"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {completed.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.test_set_name} · {r.agent_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="hidden sm:flex h-9 items-center justify-center text-muted-foreground font-mono text-xs">
              vs
            </div>
            <div className="space-y-2">
              <Label>Run B (variant)</Label>
              <Select value={bId} onValueChange={setBId} disabled={!aId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={aId ? "Pick run B" : "Pick run A first"} />
                </SelectTrigger>
                <SelectContent>
                  {bOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.test_set_name} · {r.agent_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Both runs must be completed and use the same test set.
          </p>
        </div>

        {compareQuery.error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {compareQuery.error instanceof ApiError && compareQuery.error.body
              ? compareQuery.error.body
              : compareQuery.error.message}
          </p>
        )}

        {!compareQuery.data && !compareQuery.error && noRuns && (
          <CompareEmptyState completedCount={completed.length} />
        )}

        {!compareQuery.data && !compareQuery.error && !noRuns && (
          <CompareHowItWorks />
        )}

        {compareQuery.data && <CompareView data={compareQuery.data} />}
      </div>
    </div>
  );
}

function CompareEmptyState({ completedCount }: { completedCount: number }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center fade-up space-y-3">
      <p className="eyebrow">Need at least two completed runs</p>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        You currently have {completedCount} completed run
        {completedCount === 1 ? "" : "s"}. Run the same test set against two
        agents to see a comparison here.
      </p>
      <div className="pt-2">
        <a
          href="/runs/new"
          className="inline-flex h-9 items-center px-3.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Start a run →
        </a>
      </div>
    </div>
  );
}

function CompareHowItWorks() {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-6 fade-up">
      <p className="eyebrow mb-4">How comparison works</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          {
            label: "Improved",
            desc: "B's score is higher than A's on the same case.",
            tag: "Δ +",
            tone: "text-foreground",
          },
          {
            label: "Regressed",
            desc: "B's score is lower than A's on the same case.",
            tag: "Δ −",
            tone: "text-destructive",
          },
          {
            label: "Unchanged",
            desc: "Both runs scored the case the same.",
            tag: "Δ 0",
            tone: "text-muted-foreground",
          },
        ].map((b) => (
          <div key={b.label} className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-xs ${b.tone}`}>{b.tag}</span>
              <span className="text-sm font-medium">{b.label}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompareView({ data }: { data: RunCompare }) {
  const [sort, setSort] = useState<SortDir>("none");
  const [open, setOpen] = useState<{ a: CaseResult; b: CaseResult } | null>(null);

  const pa = data.run_a.stats?.pass_rate ?? 0;
  const pb = data.run_b.stats?.pass_rate ?? 0;
  const delta = data.pass_rate_delta;
  const deltaColor = delta > 0 ? "text-foreground" : delta < 0 ? "text-destructive" : "text-muted-foreground";

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
      <div className="rounded-lg border border-border bg-card p-6 fade-up">
        <p className="eyebrow">Pass-rate delta</p>
        <p className="mt-3 text-3xl sm:text-4xl font-light tracking-tight tabular-nums">
          <span className="text-muted-foreground text-base mr-2">A</span>
          {(pa * 100).toFixed(0)}%
          <span className="mx-3 text-muted-foreground/40">·</span>
          <span className="text-muted-foreground text-base mr-2">B</span>
          {(pb * 100).toFixed(0)}%
          <span className="mx-3 text-muted-foreground/40">·</span>
          <span className={deltaColor}>
            Δ {delta > 0 ? "+" : ""}{(delta * 100).toFixed(0)}%
          </span>
        </p>
      </div>

      <SameAgentVersionBanner
        runA={data.run_a}
        runB={data.run_b}
      />

      <DiffExplainer aId={data.run_a.id} bId={data.run_b.id} />

      <DimensionDelta runA={data.run_a} runB={data.run_b} />

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
                ? "bg-secondary/40"
                : r.delta < 0
                ? "bg-destructive/[0.06]"
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

function SameAgentVersionBanner({
  runA,
  runB,
}: {
  runA: RunCompare["run_a"];
  runB: RunCompare["run_b"];
}) {
  if (
    runA.agent_id !== runB.agent_id ||
    runA.agent_version == null ||
    runB.agent_version == null ||
    runA.agent_version === runB.agent_version
  ) {
    return null;
  }
  const va = runA.agent_version;
  const vb = runB.agent_version;
  return (
    <div className="rounded-lg border border-foreground/20 bg-foreground/[0.04] p-4 text-sm">
      <p>
        <span className="font-medium">Same agent, different prompt versions.</span>{" "}
        Run A ran <span className="font-mono">v{va}</span>, Run B ran{" "}
        <span className="font-mono">v{vb}</span> of{" "}
        <Link
          href={`/agents/${runA.agent_id}`}
          className="lime-underline"
        >
          {runA.agent_name}
        </Link>
        . This is the eval-driven prompt-iteration loop.
      </p>
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
        <span className="text-sm text-muted-foreground">
          {run.agent_name}
          {run.agent_version != null && (
            <span className="ml-2 font-mono text-xs">v{run.agent_version}</span>
          )}
        </span>
      </div>
      {s && (
        <>
          <div className="text-2xl font-semibold tabular-nums">
            {(s.pass_rate * 100).toFixed(0)}%
          </div>
          <div className="text-sm text-muted-foreground">
            avg {s.avg_score.toFixed(2)} · {s.successful_cases}/{s.total_cases} scored
          </div>
          {s.tokens_total > 0 && (
            <div className="text-xs text-muted-foreground font-mono tabular-nums">
              {compactTokens(s.tokens_total)} tok
              {s.estimated_cost_usd > 0 ? ` · ~$${s.estimated_cost_usd.toFixed(4)}` : ""}
            </div>
          )}
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

function compactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toString();
}

const COMPARE_DIMENSIONS: Array<{ key: string; label: string }> = [
  { key: "accuracy", label: "Accuracy" },
  { key: "completeness", label: "Completeness" },
  { key: "tone", label: "Tone" },
  { key: "safety", label: "Safety" },
];

function DimensionDelta({
  runA,
  runB,
}: {
  runA: RunCompare["run_a"];
  runB: RunCompare["run_b"];
}) {
  const da = runA.stats?.per_dimension;
  const db = runB.stats?.per_dimension;
  if (!da || !db) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-6 fade-up">
      <p className="eyebrow mb-4">Dimension deltas</p>
      <div className="space-y-2.5">
        {COMPARE_DIMENSIONS.map(({ key, label }) => {
          const a = da[key] ?? 0;
          const b = db[key] ?? 0;
          const d = b - a;
          const tone =
            d > 0
              ? "text-foreground"
              : d < 0
                ? "text-destructive"
                : "text-muted-foreground";
          return (
            <div
              key={key}
              className="grid grid-cols-[8rem_1fr_1fr_4rem] items-center gap-3 text-sm"
            >
              <span className="text-muted-foreground">{label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums w-10 text-right">
                  {a.toFixed(2)}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-foreground/40"
                    style={{ width: `${(a / 5) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums w-10 text-right">
                  {b.toFixed(2)}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-foreground/80"
                    style={{ width: `${(b / 5) * 100}%` }}
                  />
                </div>
              </div>
              <span className={`text-right font-mono tabular-nums ${tone}`}>
                Δ {d > 0 ? "+" : ""}
                {d.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
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

function DiffExplainer({ aId, bId }: { aId: string; bId: string }) {
  const [insight, setInsight] = useState<CompareInsight | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      api<CompareInsight>(
        `/api/v1/runs/compare/explain?a=${aId}&b=${bId}`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      setInsight(data);
      toast.success("Diff explanation ready");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to explain diff";
      toast.error(msg);
    },
  });

  if (insight === null) {
    return (
      <div className="relative overflow-hidden rounded-lg border border-border bg-card fade-up">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-foreground/40 to-transparent"
        />
        <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-10 sm:p-7">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <p className="eyebrow !text-foreground">Diff explanation</p>
            </div>
            <h3 className="text-xl font-medium tracking-tight">
              Why did scores change between A and B?
            </h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              Send both prompts, summary stats, and the cases that diverged most
              to the judge model. It returns the behavioral patterns that
              moved the score — not just the numbers.
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-foreground/60" />
                1 LLM call
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-foreground/60" />
                ~5–10s
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-foreground/60" />
                cached per pair
              </li>
            </ul>
          </div>
          <div className="flex sm:flex-col sm:items-end sm:gap-2">
            <Button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="gap-2"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  Explain the difference
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4 fade-up">
      <p className="eyebrow">Diff explanation</p>
      <p className="text-sm leading-relaxed">{insight.summary}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <ThemeList
          label="Why scores improved"
          items={insight.improved_themes}
          empty="No improvement themes."
        />
        <ThemeList
          label="Why scores regressed"
          items={insight.regressed_themes}
          empty="No regression themes."
          tone="destructive"
        />
      </div>
    </div>
  );
}

function ThemeList({
  label,
  items,
  empty,
  tone,
}: {
  label: string;
  items: string[];
  empty: string;
  tone?: "destructive";
}) {
  return (
    <div className="space-y-2">
      <p
        className={`eyebrow ${tone === "destructive" ? "text-destructive" : ""}`}
      >
        {label}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="text-sm space-y-1.5">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground">·</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
