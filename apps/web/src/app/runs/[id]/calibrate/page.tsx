"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import type { CaseResult, HumanScore, RunCalibration, RunDetail } from "@/lib/types";
import { toast } from "sonner";

const SCORES = [1, 2, 3, 4, 5] as const;

const runKey = (id: string) => ["runs", id];
const calibrationKey = (id: string) => ["runs", id, "calibration"];

export default function CalibratePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: run, isLoading } = useQuery({
    queryKey: runKey(id),
    queryFn: () => api<RunDetail>(`/api/v1/runs/${id}`),
  });

  const { data: calibration } = useQuery({
    queryKey: calibrationKey(id),
    queryFn: () => api<RunCalibration>(`/api/v1/runs/${id}/calibration`),
  });

  const upsert = useMutation({
    mutationFn: ({
      caseResultId,
      score,
      note,
    }: {
      caseResultId: string;
      score: number;
      note: string | null;
    }) =>
      api<HumanScore>(
        `/api/v1/case-results/${caseResultId}/human-score`,
        {
          method: "PUT",
          body: JSON.stringify({ score, note }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: runKey(id) });
      qc.invalidateQueries({ queryKey: calibrationKey(id) });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Save failed");
    },
  });

  const remove = useMutation({
    mutationFn: (caseResultId: string) =>
      api(`/api/v1/case-results/${caseResultId}/human-score`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: runKey(id) });
      qc.invalidateQueries({ queryKey: calibrationKey(id) });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!run) return <p className="text-sm text-destructive">Run not found.</p>;

  const scorable = run.case_results.filter(
    (c) => c.judge_score !== null && c.error === null,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <>
            <Link href={`/runs/${id}`} className="hover:text-foreground transition-colors">
              Run {id.slice(0, 8)}
            </Link>
            <span className="mx-1.5 opacity-40">/</span>
            <span>Calibrate</span>
          </>
        }
        title="Calibrate the judge"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-normal">
            Why calibrate?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            LLM-as-judge has known biases (verbosity, position, self-preference).
            Score a sample of these cases yourself 1–5 against the same rubric the
            judge used. The headline metrics show whether the judge agrees with you.
          </p>
          <p>
            <span className="text-foreground">% agreement</span> is exact-match rate.
            <span className="text-foreground"> Cohen&apos;s κ</span> corrects for
            chance: 0 = no better than random, 1 = perfect, &gt;0.6 is generally
            considered substantial.
          </p>
        </CardContent>
      </Card>

      {calibration && <CalibrationSummary data={calibration} />}

      <div className="space-y-3">
        <p className="eyebrow">
          Cases to score ({scorable.length})
        </p>
        <div className="space-y-3">
          {scorable.map((cr) => (
            <ScoreRow
              key={cr.id}
              cr={cr}
              onSave={(score, note) =>
                upsert.mutate({ caseResultId: cr.id, score, note })
              }
              onClear={() => remove.mutate(cr.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CalibrationSummary({ data }: { data: RunCalibration }) {
  const kappaText =
    data.cohens_kappa === null
      ? "—"
      : data.cohens_kappa.toFixed(3);
  const kappaHelp =
    data.cohens_kappa === null
      ? "κ undefined — needs at least 2 distinct human scores."
      : data.cohens_kappa >= 0.6
      ? "Substantial agreement."
      : data.cohens_kappa >= 0.4
      ? "Moderate agreement."
      : data.cohens_kappa >= 0.2
      ? "Fair agreement."
      : data.cohens_kappa >= 0
      ? "Slight agreement — barely better than chance."
      : "Worse than chance.";

  return (
    <section className="rounded-lg border border-border bg-card p-6 space-y-5 fade-up">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div>
          <p className="eyebrow">Scored</p>
          <p className="text-3xl font-light tabular-nums">
            {data.scored_cases}
            <span className="text-base text-muted-foreground"> / {data.total_cases}</span>
          </p>
        </div>
        <div>
          <p className="eyebrow">% agreement</p>
          <p className="text-3xl font-light tabular-nums">
            {(data.percent_agreement * 100).toFixed(0)}%
          </p>
        </div>
        <div>
          <p className="eyebrow">Cohen&apos;s κ</p>
          <p className="text-3xl font-light tabular-nums font-mono">{kappaText}</p>
          <p className="text-xs text-muted-foreground mt-1">{kappaHelp}</p>
        </div>
      </div>

      {data.scored_cases > 0 && (
        <div>
          <p className="eyebrow mb-2">Confusion matrix (judge × human)</p>
          <ConfusionMatrix matrix={data.confusion_matrix} />
        </div>
      )}
    </section>
  );
}

function ConfusionMatrix({
  matrix,
}: {
  matrix: Record<string, Record<string, number>>;
}) {
  let max = 0;
  for (const row of Object.values(matrix)) {
    for (const v of Object.values(row)) max = Math.max(max, v);
  }
  return (
    <table className="text-xs font-mono border-collapse">
      <thead>
        <tr>
          <th className="px-2 py-1 text-muted-foreground font-normal text-left">
            judge↓ / human→
          </th>
          {SCORES.map((h) => (
            <th key={h} className="px-2 py-1 text-muted-foreground font-normal w-10 text-center">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {SCORES.map((j) => (
          <tr key={j}>
            <td className="px-2 py-1 text-muted-foreground">{j}</td>
            {SCORES.map((h) => {
              const v = matrix[String(j)]?.[String(h)] ?? 0;
              const opacity = max > 0 ? 0.08 + (v / max) * 0.85 : 0.08;
              const isDiag = j === h;
              return (
                <td key={h} className="p-0.5">
                  <div
                    className={`aspect-square w-full flex items-center justify-center rounded ${
                      isDiag ? "bg-foreground" : "bg-foreground/30"
                    }`}
                    style={{ opacity: v === 0 ? 0.05 : opacity }}
                  >
                    <span
                      className={`tabular-nums ${
                        v > 0 && opacity > 0.4 ? "text-background" : "text-foreground"
                      }`}
                    >
                      {v}
                    </span>
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScoreRow({
  cr,
  onSave,
  onClear,
}: {
  cr: CaseResult;
  onSave: (score: number, note: string | null) => void;
  onClear: () => void;
}) {
  const existing = cr.human_score;
  const [note, setNote] = useState(existing?.note ?? "");
  const [localScore, setLocalScore] = useState<number | null>(
    existing?.score ?? null,
  );

  // Reconcile local state when the server-side prop changes (e.g. on refetch).
  useEffect(() => {
    setLocalScore(existing?.score ?? null);
    setNote(existing?.note ?? "");
  }, [existing?.score, existing?.note]);

  const human = localScore;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="eyebrow">Input</p>
            <p className="text-sm">
              {cr.agent_prompt_sent
                ? extractUserFromPrompt(cr.agent_prompt_sent)
                : "—"}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            judge {cr.judge_score}
          </Badge>
        </div>

        {cr.agent_output && (
          <div>
            <p className="eyebrow">Agent output</p>
            <p className="text-sm whitespace-pre-wrap">{cr.agent_output}</p>
          </div>
        )}
        {cr.judge_reasoning && (
          <div>
            <p className="eyebrow">Judge reasoning</p>
            <p className="text-sm text-muted-foreground">{cr.judge_reasoning}</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="eyebrow">Your score</p>
          <div className="flex items-center gap-1.5">
            {SCORES.map((s) => {
              const selected = human === s;
              const matchesJudge = cr.judge_score === s;
              return (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  onClick={() => {
                    setLocalScore(s);
                    onSave(s, note || null);
                  }}
                  className={
                    !selected && matchesJudge
                      ? "border-foreground/40"
                      : undefined
                  }
                >
                  {s}
                </Button>
              );
            })}
            {human !== null && (
              <>
                <span className="ml-2 text-xs text-muted-foreground">
                  {human === cr.judge_score ? "agrees with judge" : `Δ ${human - (cr.judge_score ?? 0)}`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setLocalScore(null);
                    setNote("");
                    onClear();
                  }}
                  className="ml-auto text-muted-foreground"
                >
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>

        <div>
          <p className="eyebrow mb-1">Note (optional)</p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (human !== null && note !== (existing?.note ?? "")) {
                onSave(human, note || null);
              }
            }}
            placeholder="Why this score?"
            className="text-sm"
            rows={2}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function extractUserFromPrompt(prompt: string): string {
  const idx = prompt.indexOf("USER:\n");
  return idx >= 0 ? prompt.slice(idx + 6) : prompt;
}
