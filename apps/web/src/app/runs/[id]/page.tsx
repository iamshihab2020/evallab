"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { motion } from "motion/react";

import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { formatDateTime } from "@/lib/format";
import type { CaseResult, FailureCluster, RunDetail } from "@/lib/types";

import { toast } from "sonner";

const GLOSSARY_KEY = "evallab.runs.glossary.dismissed";

const detailKey = (id: string) => ["runs", id];

function statusVariant(
  status: string,
): "pass" | "destructive" | "pending" | "default" {
  if (status === "completed") return "pass";
  if (status === "failed") return "destructive";
  if (status === "running" || status === "pending") return "pending";
  return "default";
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: detailKey(id),
    queryFn: () => api<RunDetail>(`/api/v1/runs/${id}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 2000 : false;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error || !data)
    return (
      <p className="text-sm text-destructive">
        Failed to load run{error ? `: ${error.message}` : ""}.
      </p>
    );

  return (
    <div>
      <PageHeader
        back={{ href: "/runs", label: "Runs" }}
        eyebrow={
          <>
            <Link href="/runs" className="hover:text-foreground transition-colors">
              Runs
            </Link>
            <span className="mx-1.5 opacity-40">/</span>
            <span className="font-mono normal-case">{data.id.slice(0, 8)}</span>
          </>
        }
        title={
          <span className="flex items-baseline gap-3 flex-wrap">
            <span>Run</span>
            <Badge variant={statusVariant(data.status)}>{data.status}</Badge>
            {data.errored_cases > 0 && (
              <Badge variant="destructive">{data.errored_cases} ERR</Badge>
            )}
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            {data.status === "completed" && (
              <Button asChild variant="outline">
                <Link href={`/runs/${data.id}/calibrate`}>Calibrate judge</Link>
              </Button>
            )}
            <Button
              variant="mono"
              disabled={data.status !== "completed"}
              onClick={async () => {
                try {
                  await downloadFile(
                    `/api/v1/runs/${data.id}/export?format=md`,
                    `evallab-run-${data.id}.md`,
                  );
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Download failed");
                }
              }}
            >
              ↓ Download Markdown
            </Button>
          </div>
        }
      />

      <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs fade-up">
        <MetaItem label="Test set" value={
          <Link href={`/test-sets/${data.test_set_id}`} className="lime-underline">
            {data.test_set_name}
          </Link>
        } />
        <MetaItem label="Agent" value={
          <span className="inline-flex items-baseline gap-2">
            <Link href={`/agents/${data.agent_id}`} className="lime-underline">
              {data.agent_name}
            </Link>
            {data.agent_version != null && (
              <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
                v{data.agent_version}
              </Badge>
            )}
          </span>
        } />
        <MetaItem label="Judge" value={<span className="font-mono">{data.judge_model}</span>} />
        <MetaItem label="Started" value={<span className="font-mono">{formatDateTime(data.started_at)}</span>} />
      </div>

      {data.test_set_domain_context && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 fade-up">
          <p className="eyebrow">Domain</p>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {data.test_set_domain_context}
          </p>
        </div>
      )}

      {data.error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Run failed</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm">{data.error}</pre>
          </CardContent>
        </Card>
      )}

      {(data.status === "running" || data.status === "pending") && (
        <RunningView data={data} />
      )}

      {data.status === "completed" && data.stats && <CompletedView data={data} />}
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function Glossary() {
  const [open, setOpen] = useState<boolean>(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(GLOSSARY_KEY) === "true") setOpen(false);
    } catch {}
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(GLOSSARY_KEY, "true");
    } catch {}
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        ? What am I looking at
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 fade-up">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <p className="eyebrow">What am I looking at</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="text-foreground">Pass rate</span> = % of scored cases ≥ 4. The
            <span className="text-foreground"> judge</span> is a second LLM call that scores the agent's
            response 1–5 against the case's expected behavior, at temperature 0 for determinism.
            <span className="text-foreground"> Errored</span> cases (network blips, malformed JSON) are
            excluded from stats but reported separately below.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/** Big serif italic numeral that counts up from 0 to value over 800ms. */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 800;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

function RunningView({ data }: { data: RunDetail }) {
  const total = data.total_cases || 0;
  const done = data.completed_cases || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const recent = [...data.case_results]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  // Build a slot for every case (filled or pending)
  const filledByIndex = new Map<number, CaseResult>();
  data.case_results.forEach((cr, i) => filledByIndex.set(i, cr));
  const slots = Array.from({ length: Math.max(total, data.case_results.length) }, (_, i) =>
    filledByIndex.get(i),
  );

  // Estimate remaining time at 28 RPM, 2 calls per case
  const remaining = Math.max(0, total - done);
  const remainingSec = Math.ceil((remaining * 2 * 60) / 28);
  const remainingTxt =
    remainingSec === 0
      ? "—"
      : remainingSec >= 60
      ? `~${Math.floor(remainingSec / 60)}m ${remainingSec % 60}s left`
      : `~${remainingSec}s left`;

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-6 fade-up space-y-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <p className="eyebrow">In progress</p>
            <p className="text-5xl font-light tracking-tight tabular-nums leading-none">
              <CountUp value={pct} format={(n) => `${n.toFixed(0)}%`} />
            </p>
            <p className="text-sm text-muted-foreground">
              {done} of {total} cases scored ·{" "}
              <span className="text-foreground font-mono">{remainingTxt}</span>
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-foreground opacity-50 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-foreground" />
            </span>
            polling every 2s
          </div>
        </div>

        <div className="h-1 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-foreground transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {total > 0 && (
          <div>
            <p className="eyebrow mb-2.5">Cases ({total})</p>
            <CaseDotGrid slots={slots} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <p className="eyebrow">Recent results</p>
        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
            Waiting for first result…
          </div>
        ) : (
          <ul className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
            {recent.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                {r.error ? (
                  <Badge variant="destructive">err</Badge>
                ) : (
                  <Badge variant="pass">score {r.judge_score}</Badge>
                )}
                <span className="flex-1 truncate text-muted-foreground">
                  {r.error ? r.error : r.judge_reasoning}
                </span>
                {r.agent_latency_ms != null && (
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {r.agent_latency_ms}ms
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Compact case grid — fills as cases complete. Color = score. */
function CaseDotGrid({ slots }: { slots: (CaseResult | undefined)[] }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(20px, 1fr))" }}>
      {slots.map((cr, i) => {
        if (!cr) {
          return (
            <span
              key={i}
              className="aspect-square rounded-sm border border-border/60"
              title={`Case ${i + 1} · pending`}
            />
          );
        }
        if (cr.error) {
          return (
            <span
              key={cr.id}
              className="aspect-square rounded-sm bg-destructive/70"
              title={`Case ${i + 1} · errored`}
            />
          );
        }
        const score = cr.judge_score ?? 0;
        const opacity = 0.25 + (score - 1) * 0.18;
        return (
          <span
            key={cr.id}
            className="aspect-square rounded-sm bg-foreground"
            style={{ opacity }}
            title={`Case ${i + 1} · score ${score}`}
          />
        );
      })}
    </div>
  );
}

function CompletedView({ data }: { data: RunDetail }) {
  const s = data.stats!;
  const ordered = [...data.case_results].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  return (
    <div className="space-y-10">
      {/* Hero — pass rate + KPI grid + cases at a glance, one tight section */}
      <section className="rounded-lg border border-border bg-card p-6 sm:p-8 fade-up">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
          <div className="space-y-3">
            <p className="eyebrow">Pass rate</p>
            <p className="text-7xl sm:text-8xl font-light tracking-tight tabular-nums leading-none">
              <CountUp value={s.pass_rate * 100} format={(n) => `${n.toFixed(0)}%`} />
            </p>
            <p className="text-sm text-muted-foreground max-w-md">
              {s.successful_cases} of {s.total_cases} cases scored ≥ 4 by the judge.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-px bg-border rounded-md overflow-hidden self-start">
            <KpiCell
              label="Avg"
              value={<CountUp value={s.avg_score} format={(n) => n.toFixed(2)} />}
            />
            <KpiCell
              label="Scored"
              value={`${s.successful_cases}/${s.total_cases}`}
              mono
            />
            <KpiCell
              label="Errored"
              value={s.errored_cases.toString()}
              mono
              tone={s.errored_cases > 0 ? "destructive" : undefined}
            />
          </div>
        </div>

        {ordered.length > 0 && (
          <div className="mt-7 pt-6 border-t border-border/60">
            <div className="flex items-baseline justify-between mb-2.5">
              <p className="eyebrow">Cases at a glance</p>
              <p className="text-[10px] font-mono text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-sm bg-foreground mr-1" />
                score 5
                <span className="inline-block h-1.5 w-1.5 rounded-sm bg-foreground/40 mx-1 ml-3" />
                score 1
                <span className="inline-block h-1.5 w-1.5 rounded-sm bg-destructive/70 mx-1 ml-3" />
                error
              </p>
            </div>
            <CaseDotGrid slots={ordered} />
          </div>
        )}
      </section>

      <Glossary />

      {/* Distribution + Per-category side by side */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 fade-up">
        <div className="space-y-3">
          <p className="eyebrow">Score distribution</p>
          <ScoreDistribution
            distribution={s.score_distribution}
            total={s.successful_cases}
          />
        </div>
        <div className="space-y-3">
          <p className="eyebrow">Per category</p>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">Category</TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">N</TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Pass</TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">Avg</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(s.per_category).map(([cat, c]) => (
                  <TableRow key={cat}>
                    <TableCell className="capitalize">{cat}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{c.count}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {(c.pass_rate * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {c.avg_score.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      <FailurePatterns runId={data.id} clusters={data.failure_clusters} />

      {/* Worst cases — 2-col on lg */}
      <section className="space-y-3">
        <p className="eyebrow">Worst {s.worst_cases.length} cases</p>
        {s.worst_cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cases scored.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {s.worst_cases.map((w) => {
              const cr = data.case_results.find((c) => c.id === w.case_result_id);
              return (
                <WorstCard
                  key={w.case_result_id}
                  input={w.input}
                  cr={cr}
                  score={w.judge_score}
                  reasoning={w.judge_reasoning}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <p className="eyebrow">All results ({data.case_results.length})</p>
        <AllResultsTable caseResults={data.case_results} />
      </section>

      {data.errored_cases > 0 && (
        <section className="space-y-3">
          <p className="eyebrow text-destructive">Errors ({data.errored_cases})</p>
          <ErrorGroups caseResults={data.case_results} />
        </section>
      )}
    </div>
  );
}

type ErrorSummary = { kind: string; headline: string; hint?: string };

function summarizeError(err: string): ErrorSummary {
  if (/tokens per day \(TPD\)/i.test(err)) {
    const used = err.match(/Used (\d+)/)?.[1];
    const limit = err.match(/Limit (\d+)/)?.[1];
    const usage =
      used && limit
        ? `Used ${parseInt(used).toLocaleString()} of ${parseInt(limit).toLocaleString()} tokens today.`
        : "Daily token quota exhausted.";
    return {
      kind: "groq_tpd",
      headline: "Groq daily token limit reached",
      hint: `${usage} Resets at midnight UTC. Upgrade Groq tier or reduce per-run cost (smaller test set, smaller judge model) to keep iterating today.`,
    };
  }
  if (/tokens per minute \(TPM\)/i.test(err)) {
    return {
      kind: "groq_tpm",
      headline: "Groq per-minute token limit hit",
      hint: "Too many tokens in a 60-second window. Lower the runner's concurrency or RPM cap.",
    };
  }
  if (/requests per minute \(RPM\)/i.test(err)) {
    return {
      kind: "groq_rpm",
      headline: "Groq per-minute request limit hit",
      hint: "Too many requests in a 60-second window. The built-in 28 RPM limiter should prevent this — if you see it, check for parallel runs.",
    };
  }
  if (/rate_limit_exceeded/.test(err) || /Error code: 429/.test(err)) {
    return {
      kind: "groq_429",
      headline: "Groq rate limit reached",
      hint: "Hit a Groq throttle. Wait a moment and re-run, or check your tier limits.",
    };
  }
  if (/json parse failed/i.test(err) || /JSONDecodeError/.test(err)) {
    return {
      kind: "json_parse",
      headline: "LLM returned invalid JSON",
      hint: "The model didn't return parseable JSON. Usually transient — re-run the case.",
    };
  }
  if (/ConnectError|ConnectionError|TimeoutError|httpx|ReadTimeout/.test(err)) {
    return {
      kind: "network",
      headline: "Network error reaching LLM provider",
      hint: "Could be a transient blip or a provider-side outage. Retry the run.",
    };
  }
  if (/judge response missing fields|judge score out of range/.test(err)) {
    return {
      kind: "judge_shape",
      headline: "Judge returned an invalid score",
      hint: "Judge JSON had missing fields or a score outside 1-5. Usually transient.",
    };
  }
  const firstLine = err.split("\n")[0]?.slice(0, 120) || "Unknown error";
  return { kind: `other:${firstLine}`, headline: firstLine };
}

function ErrorGroups({ caseResults }: { caseResults: CaseResult[] }) {
  const groups = new Map<string, { summary: ErrorSummary; errors: CaseResult[] }>();
  for (const cr of caseResults) {
    if (!cr.error) continue;
    const summary = summarizeError(cr.error);
    const existing = groups.get(summary.kind);
    if (existing) existing.errors.push(cr);
    else groups.set(summary.kind, { summary, errors: [cr] });
  }
  const sorted = [...groups.values()].sort((a, b) => b.errors.length - a.errors.length);

  return (
    <div className="space-y-3">
      {sorted.map(({ summary, errors }) => (
        <ErrorGroup key={summary.kind} summary={summary} errors={errors} />
      ))}
    </div>
  );
}

function ErrorDetail({ error }: { error: string }) {
  const summary = summarizeError(error);
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/[0.04] p-4 space-y-2">
      <p className="text-sm text-destructive font-medium">{summary.headline}</p>
      {summary.hint && (
        <p className="text-xs text-muted-foreground leading-relaxed">{summary.hint}</p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
          Show raw error
        </summary>
        <pre className="mt-2 rounded bg-muted/60 p-3 text-[11px] whitespace-pre-wrap text-muted-foreground leading-relaxed">
          {error}
        </pre>
      </details>
    </div>
  );
}

function ErrorGroup({
  summary,
  errors,
}: {
  summary: ErrorSummary;
  errors: CaseResult[];
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/[0.04] p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-sm text-destructive font-medium">{summary.headline}</p>
        <span className="font-mono text-xs text-destructive/80 tabular-nums">
          {errors.length} case{errors.length === 1 ? "" : "s"}
        </span>
      </div>
      {summary.hint && (
        <p className="text-xs text-muted-foreground leading-relaxed">{summary.hint}</p>
      )}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
            Show raw error
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <pre className="rounded bg-muted/60 p-3 text-[11px] whitespace-pre-wrap text-muted-foreground leading-relaxed">
            {errors[0].error}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function KpiCell({
  label,
  value,
  mono = false,
  tone,
  hidden = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  tone?: "destructive";
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div className="bg-card p-4 space-y-1">
      <p className="eyebrow">{label}</p>
      <p
        className={`text-xl font-light tabular-nums ${mono ? "font-mono" : ""} ${
          tone === "destructive" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ScoreDistribution({
  distribution,
  total,
}: {
  distribution: Record<string, number>;
  total: number;
}) {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i, idx) => {
        const n = distribution[String(i)] ?? 0;
        const pct = total > 0 ? (n / total) * 100 : 0;
        // Single foreground tint — opacity scales with score
        const opacity = 0.25 + (i - 1) * 0.18; // 1→0.25, 5→0.97
        const barColor = "bg-foreground";
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.06 * idx }}
            className="flex items-center gap-3"
          >
            <span className="w-4 font-mono text-xs tabular-nums text-muted-foreground">{i}</span>
            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${barColor}`}
                style={{ opacity }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, delay: 0.05 * idx, ease: [0.2, 0.7, 0.2, 1] }}
              />
            </div>
            <span className="w-10 text-right font-mono text-xs tabular-nums">{n}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

function WorstCard({
  input,
  cr,
  score,
  reasoning,
}: {
  input: string;
  cr: CaseResult | undefined;
  score: number;
  reasoning: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm font-normal leading-relaxed">{input}</CardTitle>
          <Badge
            variant={score >= 4 ? "pass" : score <= 2 ? "destructive" : "secondary"}
          >
            score {score}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {cr?.agent_output && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow">Agent output</p>
              {cr.agent_latency_ms != null && (
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {cr.agent_latency_ms}ms
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {cr.agent_output}
            </p>
          </div>
        )}
        {reasoning && (
          <div className="space-y-1.5">
            <p className="eyebrow">Judge reasoning</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {reasoning}
            </p>
          </div>
        )}
        {cr && (cr.agent_prompt_sent || cr.judge_prompt_sent) && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="px-0 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
                Show full prompts
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {cr.agent_prompt_sent && (
                <pre className="rounded bg-muted/40 p-3 text-[11px] whitespace-pre-wrap text-muted-foreground leading-relaxed max-h-64 overflow-y-auto">
                  {cr.agent_prompt_sent}
                </pre>
              )}
              {cr.judge_prompt_sent && (
                <pre className="rounded bg-muted/40 p-3 text-[11px] whitespace-pre-wrap text-muted-foreground leading-relaxed max-h-64 overflow-y-auto">
                  {cr.judge_prompt_sent}
                </pre>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

function AllResultsTable({ caseResults }: { caseResults: CaseResult[] }) {
  const [open, setOpen] = useState<CaseResult | null>(null);
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Input</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Latency</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {caseResults.map((c) => (
            <TableRow
              key={c.id}
              className="cursor-pointer"
              onClick={() => setOpen(c)}
            >
              <TableCell className="max-w-md truncate">
                {c.error ? (
                  <span className="italic text-destructive/90">
                    {summarizeError(c.error).headline}
                  </span>
                ) : c.agent_prompt_sent ? (
                  extractUserFromPrompt(c.agent_prompt_sent).slice(0, 80)
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right">
                {c.error ? (
                  <Badge variant="destructive">err</Badge>
                ) : (
                  <Badge variant="secondary">{c.judge_score}</Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {c.agent_latency_ms ? `${c.agent_latency_ms}ms` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="sm:max-w-5xl w-[95vw] sm:w-[90vw] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Case result</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-6 text-sm">
              {open.error ? (
                <ErrorDetail error={open.error} />
              ) : (
                <>
                  {open.agent_prompt_sent && (
                    <div className="space-y-2">
                      <p className="eyebrow">User message</p>
                      <p className="rounded-md bg-muted/50 px-4 py-3 leading-relaxed whitespace-pre-wrap">
                        {extractUserFromPrompt(open.agent_prompt_sent)}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="eyebrow">Agent output</p>
                        {open.agent_latency_ms != null && (
                          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                            {open.agent_latency_ms}ms
                          </span>
                        )}
                      </div>
                      <div className="rounded-md border border-border bg-card px-4 py-3 leading-relaxed whitespace-pre-wrap min-h-[6rem]">
                        {open.agent_output ?? <span className="text-muted-foreground italic">no output</span>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="eyebrow">Judge</p>
                        {open.judge_score != null && (
                          <Badge
                            variant={
                              open.judge_score >= 4
                                ? "pass"
                                : open.judge_score <= 2
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            score {open.judge_score}
                          </Badge>
                        )}
                      </div>
                      <div className="rounded-md border border-border bg-card px-4 py-3 leading-relaxed whitespace-pre-wrap min-h-[6rem]">
                        {open.judge_reasoning ?? <span className="text-muted-foreground italic">no reasoning</span>}
                      </div>
                    </div>
                  </div>

                  {(open.agent_prompt_sent || open.judge_prompt_sent) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-3 border-t border-border/40">
                      {open.agent_prompt_sent && (
                        <details className="group">
                          <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1.5">
                            <span className="inline-block transition-transform group-open:rotate-90">›</span>
                            Show full agent prompt
                          </summary>
                          <pre className="mt-2 rounded bg-muted/40 p-3 text-[11px] whitespace-pre-wrap text-muted-foreground leading-relaxed max-h-[40vh] overflow-y-auto">
                            {open.agent_prompt_sent}
                          </pre>
                        </details>
                      )}
                      {open.judge_prompt_sent && (
                        <details className="group">
                          <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1.5">
                            <span className="inline-block transition-transform group-open:rotate-90">›</span>
                            Show full judge prompt
                          </summary>
                          <pre className="mt-2 rounded bg-muted/40 p-3 text-[11px] whitespace-pre-wrap text-muted-foreground leading-relaxed max-h-[40vh] overflow-y-auto">
                            {open.judge_prompt_sent}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function extractUserFromPrompt(prompt: string): string {
  const idx = prompt.indexOf("USER:\n");
  return idx >= 0 ? prompt.slice(idx + 6) : prompt;
}

function FailurePatterns({
  runId,
  clusters,
}: {
  runId: string;
  clusters: FailureCluster[] | null;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api<FailureCluster[]>(`/api/v1/runs/${runId}/cluster-failures`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(runId) });
      toast.success("Failure patterns ready");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to cluster failures";
      toast.error(msg);
    },
  });

  if (clusters !== null && clusters.length === 0) {
    return (
      <section className="space-y-3">
        <p className="eyebrow">Failure patterns</p>
        <p className="text-sm text-muted-foreground">
          No low-scoring cases (≤ 3) — nothing to cluster.
        </p>
      </section>
    );
  }

  if (clusters === null) {
    return (
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Failure patterns</p>
          <p className="text-xs text-muted-foreground">1 LLM call · cached</p>
        </div>
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground space-y-3">
          <p>
            Group low-scoring cases into themes (e.g. &ldquo;missing empathy&rdquo;,
            &ldquo;hallucinated policy&rdquo;) so you can see *why* the agent failed,
            not just *that* it failed.
          </p>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Analyzing failures…" : "Find failure patterns"}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 fade-up">
      <p className="eyebrow">Failure patterns ({clusters.length})</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {clusters.map((c, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-5 space-y-2"
          >
            <p className="text-base font-medium">{c.theme}</p>
            <p className="text-sm text-muted-foreground">{c.summary}</p>
            <p className="font-mono text-[11px] text-muted-foreground pt-1">
              {c.case_result_ids.length} case
              {c.case_result_ids.length === 1 ? "" : "s"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
