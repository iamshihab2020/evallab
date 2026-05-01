"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { FeaturedComparison, useFeaturedPair } from "@/components/featured-comparison";
import { StepRail } from "@/components/step-rail";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { RunListItem } from "@/lib/types";

export default function Home() {
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<RunListItem[]>("/api/v1/runs"),
  });

  const recent = (runs.data ?? []).slice(0, 5);
  const featuredPair = useFeaturedPair();

  return (
    <div className="space-y-12 max-w-5xl mx-auto">
      <section className="space-y-3 fade-up pt-2">
        <h1 className="text-4xl sm:text-5xl font-medium tracking-tight">
          Measure what your prompts actually do.
        </h1>
        <p className="text-base text-muted-foreground max-w-2xl leading-relaxed">
          Define test sets, define agents, run them against an LLM-as-judge, and
          compare the diff. Ship prompts with numbers, not vibes.
        </p>
      </section>

      {featuredPair ? (
        <section>
          <FeaturedComparison />
        </section>
      ) : (
        <section className="space-y-4">
          <p className="eyebrow">Get started</p>
          <StepRail />
        </section>
      )}

      <section className="space-y-4 fade-up" style={{ animationDelay: "120ms" }}>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Recent runs</p>
          {recent.length > 0 && (
            <Link
              href="/runs"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all →
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No runs yet. Complete the steps above to start measuring.
          </div>
        ) : (
          <ul className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/runs/${r.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 text-sm hover:bg-secondary/40 transition-colors"
                >
                  <span className="flex-1 min-w-0 truncate font-medium">
                    {r.test_set_name}
                  </span>
                  <span className="hidden sm:block w-48 truncate text-muted-foreground">
                    {r.agent_name}
                  </span>
                  <span className="w-24 text-right font-mono tabular-nums text-muted-foreground">
                    {r.pass_rate !== null ? `${(r.pass_rate * 100).toFixed(0)}%` : "—"}
                  </span>
                  <span className="w-24 flex justify-end">
                    <Badge
                      variant={
                        r.status === "completed"
                          ? "pass"
                          : r.status === "failed"
                          ? "destructive"
                          : "pending"
                      }
                    >
                      {r.status}
                    </Badge>
                  </span>
                  <span className="hidden md:block w-20 text-right font-mono text-xs text-muted-foreground">
                    {formatDateTime(r.started_at).split(",")[0]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
