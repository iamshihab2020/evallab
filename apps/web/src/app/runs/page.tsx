"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { RunListItem } from "@/lib/types";

function statusVariant(status: string): "pass" | "destructive" | "pending" {
  if (status === "completed") return "pass";
  if (status === "failed") return "destructive";
  return "pending";
}

export default function RunsPage() {
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<RunListItem[]>("/api/v1/runs"),
  });

  const total = data?.length ?? 0;
  const completed = (data ?? []).filter((r) => r.status === "completed");
  const avgPass =
    completed.length > 0
      ? completed.reduce((s, r) => s + (r.pass_rate ?? 0), 0) / completed.length
      : null;

  return (
    <div>
      <PageHeader
        title="Runs"
        blurb="One agent scored against one test set. Click into a run for full stats."
        action={
          <Button asChild variant="primary">
            <Link href="/runs/new">+ New run</Link>
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground font-mono">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load: {error.message}</p>
      ) : data && data.length === 0 ? (
        <EmptyState
          eyebrow="No runs"
          title="Score the agent."
          description="Pick a test set + agent. ~2 min for 30 cases at 28 RPM."
          action={
            <Button asChild variant="primary">
              <Link href="/runs/new">+ Start a run</Link>
            </Button>
          }
        />
      ) : (
        <>
          <StatStrip
            items={[
              { label: total === 1 ? "run" : "runs", value: total },
              { label: "completed", value: completed.length },
              {
                label: "avg pass",
                value: avgPass !== null ? `${(avgPass * 100).toFixed(0)}%` : "—",
              },
            ]}
          />
          <ul className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden fade-up">
            {data?.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/runs/${r.id}`)}
                  className="group w-full text-left flex items-center gap-6 px-5 py-4 hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="font-medium text-base truncate">
                        {r.test_set_name}
                      </span>
                      <span className="text-sm text-muted-foreground truncate">
                        / {r.agent_name}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      {r.errored_cases > 0 && (
                        <Badge variant="destructive">{r.errored_cases} errored</Badge>
                      )}
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatDateTime(r.started_at)}
                      </span>
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-3 w-48">
                    {r.pass_rate !== null ? (
                      <>
                        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full bg-foreground transition-all"
                            style={{ width: `${r.pass_rate * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-sm tabular-nums w-10 text-right">
                          {(r.pass_rate * 100).toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono w-full text-right">
                        {r.completed_cases}/{r.total_cases}
                      </span>
                    )}
                  </div>

                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
