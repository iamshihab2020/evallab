"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Agent } from "@/lib/types";

export default function AgentsPage() {
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api<Agent[]>("/api/v1/agents"),
  });

  const uniqueModels = new Set((data ?? []).map((a) => a.model)).size;

  return (
    <div>
      <PageHeader
        title="Agents"
        blurb="A prompt + model. The thing under evaluation when you start a run."
        action={
          <Button asChild variant="primary">
            <Link href="/agents/new">+ New agent</Link>
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground font-mono">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load: {error.message}</p>
      ) : data && data.length === 0 ? (
        <EmptyState
          eyebrow="No agents"
          title="Define what's being tested"
          description="An agent is a system prompt + a model. Two seed agents come with the SMS demo."
          action={
            <Button asChild variant="primary">
              <Link href="/agents/new">+ New agent</Link>
            </Button>
          }
        />
      ) : (
        <>
          <StatStrip
            items={[
              { label: data && data.length === 1 ? "agent" : "agents", value: data?.length ?? 0 },
              { label: uniqueModels === 1 ? "model" : "models", value: uniqueModels },
            ]}
          />
          <ul className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden fade-up">
            {data?.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/agents/${a.id}`)}
                  className="group w-full text-left flex items-center gap-6 px-5 py-4 hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="font-medium text-base">{a.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                        {a.model}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground line-clamp-1">
                      {a.system_prompt}
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-5 text-xs text-muted-foreground whitespace-nowrap">
                    <span>
                      <span className="font-mono tabular-nums text-foreground">
                        {a.temperature.toFixed(1)}
                      </span>{" "}
                      <span className="opacity-60">temp</span>
                    </span>
                    <span>
                      <span className="font-mono tabular-nums text-foreground">
                        {a.max_tokens}
                      </span>{" "}
                      <span className="opacity-60">tok</span>
                    </span>
                    <span className="font-mono">{formatDateTime(a.created_at)}</span>
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
