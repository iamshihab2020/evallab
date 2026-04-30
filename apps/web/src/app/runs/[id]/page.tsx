"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

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
import { api } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { formatDateTime } from "@/lib/format";
import type { CaseResult, RunDetail } from "@/lib/types";

import { toast } from "sonner";

const detailKey = (id: string) => ["runs", id];

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "running" || status === "pending") return "secondary";
  return "outline";
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
    <div className="space-y-8">
      <div>
        <Link href="/runs" className="text-sm text-muted-foreground hover:underline">
          ← Runs
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Run</h1>
          <Badge variant={statusVariant(data.status)}>{data.status}</Badge>
          {data.errored_cases > 0 && (
            <Badge variant="destructive">{data.errored_cases} errors</Badge>
          )}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
          <div>
            Test set:{" "}
            <Link href={`/test-sets/${data.test_set_id}`} className="hover:underline">
              {data.test_set_name}
            </Link>
          </div>
          <div>
            Agent:{" "}
            <Link href={`/agents/${data.agent_id}`} className="hover:underline">
              {data.agent_name}
            </Link>
          </div>
          <div>
            Judge: <span className="font-mono">{data.judge_model}</span>
          </div>
          <div>Started: {formatDateTime(data.started_at)}</div>
          {data.completed_at && <div>Completed: {formatDateTime(data.completed_at)}</div>}
        </div>
        <div className="mt-3">
          <Button
            variant="outline"
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
            Download Markdown Report
          </Button>
        </div>
      </div>

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
  );
}

function RunningView({ data }: { data: RunDetail }) {
  const pct = data.total_cases
    ? Math.round((data.completed_cases / data.total_cases) * 100)
    : 0;
  const recent = [...data.case_results]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Progress</span>
          <span className="tabular-nums">
            {data.completed_cases} / {data.total_cases} ({pct}%)
          </span>
        </div>
        <Progress value={pct} />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Recent results</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Waiting for first result…</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-md border p-3 text-sm"
              >
                {r.error ? (
                  <Badge variant="destructive">err</Badge>
                ) : (
                  <Badge variant="secondary">score {r.judge_score}</Badge>
                )}
                <span className="truncate">
                  {r.error ? r.error : r.judge_reasoning}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CompletedView({ data }: { data: RunDetail }) {
  const s = data.stats!;
  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Pass rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {(s.pass_rate * 100).toFixed(0)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Avg score</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {s.avg_score.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Successful</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {s.successful_cases}/{s.total_cases}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Errored</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{s.errored_cases}</p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Score distribution</h2>
        <ScoreDistribution
          distribution={s.score_distribution}
          total={s.successful_cases}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Per category</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Pass rate</TableHead>
              <TableHead className="text-right">Avg score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(s.per_category).map(([cat, c]) => (
              <TableRow key={cat}>
                <TableCell>{cat}</TableCell>
                <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(c.pass_rate * 100).toFixed(0)}%
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.avg_score.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Worst 5 cases</h2>
        {s.worst_cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cases scored.</p>
        ) : (
          s.worst_cases.map((w) => {
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
          })
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">All results</h2>
        <AllResultsTable caseResults={data.case_results} />
      </section>

      {data.errored_cases > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-destructive">Errors</h2>
          <ul className="space-y-2">
            {data.case_results
              .filter((c) => c.error)
              .map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border border-destructive/50 p-3 text-sm"
                >
                  <p className="font-mono text-xs text-destructive">{c.error}</p>
                </li>
              ))}
          </ul>
        </section>
      )}
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
  const colors: Record<string, string> = {
    "1": "bg-red-500",
    "2": "bg-orange-500",
    "3": "bg-yellow-500",
    "4": "bg-lime-500",
    "5": "bg-green-500",
  };
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => {
        const n = distribution[String(i)] ?? 0;
        const pct = total > 0 ? (n / total) * 100 : 0;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-4 text-sm tabular-nums">{i}</span>
            <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
              <div
                className={`h-full ${colors[String(i)]}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-10 text-right text-sm tabular-nums">{n}</span>
          </div>
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
          <CardTitle className="text-sm font-normal">{input}</CardTitle>
          <Badge variant={score <= 2 ? "destructive" : "secondary"}>
            score {score}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {cr?.agent_output && (
          <div>
            <p className="text-xs uppercase text-muted-foreground">Agent output</p>
            <pre className="whitespace-pre-wrap text-sm">{cr.agent_output}</pre>
          </div>
        )}
        {reasoning && (
          <div>
            <p className="text-xs uppercase text-muted-foreground">Judge reasoning</p>
            <p className="text-sm">{reasoning}</p>
          </div>
        )}
        {cr && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                Show full prompts
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {cr.agent_prompt_sent && (
                <pre className="rounded bg-muted p-3 text-xs whitespace-pre-wrap">
                  {cr.agent_prompt_sent}
                </pre>
              )}
              {cr.judge_prompt_sent && (
                <pre className="rounded bg-muted p-3 text-xs whitespace-pre-wrap">
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
                {c.agent_prompt_sent
                  ? extractUserFromPrompt(c.agent_prompt_sent).slice(0, 80)
                  : c.error || "—"}
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
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Case result</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-3 text-sm">
              {open.error ? (
                <pre className="rounded bg-destructive/10 p-3 text-destructive whitespace-pre-wrap">
                  {open.error}
                </pre>
              ) : (
                <>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      Agent output
                    </p>
                    <pre className="whitespace-pre-wrap">{open.agent_output}</pre>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      Judge score: {open.judge_score}
                    </p>
                    <p>{open.judge_reasoning}</p>
                  </div>
                  {open.agent_prompt_sent && (
                    <details>
                      <summary className="cursor-pointer text-xs uppercase text-muted-foreground">
                        Agent prompt sent
                      </summary>
                      <pre className="mt-2 rounded bg-muted p-3 text-xs whitespace-pre-wrap">
                        {open.agent_prompt_sent}
                      </pre>
                    </details>
                  )}
                  {open.judge_prompt_sent && (
                    <details>
                      <summary className="cursor-pointer text-xs uppercase text-muted-foreground">
                        Judge prompt sent
                      </summary>
                      <pre className="mt-2 rounded bg-muted p-3 text-xs whitespace-pre-wrap">
                        {open.judge_prompt_sent}
                      </pre>
                    </details>
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
