"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Agent, RunListItem, SeedLoadResult, TestSet } from "@/lib/types";

type StepStatus = "idle" | "active" | "done";

function StatusDot({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="relative inline-flex h-5 w-5 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-foreground" />
        <span className="absolute inset-[6px] rounded-full bg-foreground" />
      </span>
    );
  }
  return (
    <span className="inline-block h-5 w-5 rounded-full border border-border" />
  );
}

export function StepRail() {
  const queryClient = useQueryClient();

  const testSets = useQuery({
    queryKey: ["test-sets"],
    queryFn: () => api<TestSet[]>("/api/v1/test-sets"),
  });
  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: () => api<Agent[]>("/api/v1/agents"),
  });
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<RunListItem[]>("/api/v1/runs"),
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      api<SeedLoadResult>("/api/v1/seeds/sms-support-v1", { method: "POST" }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["test-sets"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      toast.success(res.already_loaded ? "Seed already loaded" : "Seed loaded");
    },
    onError: (e) => toast.error(e.message),
  });

  const tCount = testSets.data?.length ?? 0;
  const aCount = agents.data?.length ?? 0;
  const rList = runs.data ?? [];
  const rCount = rList.length;

  const completedRuns = rList.filter((r) => r.status === "completed");
  const tsCounts = new Map<string, number>();
  completedRuns.forEach((r) =>
    tsCounts.set(r.test_set_id, (tsCounts.get(r.test_set_id) ?? 0) + 1),
  );
  const canCompare = [...tsCounts.values()].some((n) => n >= 2);

  type Step = {
    n: number;
    title: string;
    blurb: string;
    status: StepStatus;
    cta: React.ReactNode;
  };

  const steps: Step[] = [
    {
      n: 1,
      title: "Test set",
      blurb: "Inputs + expected behaviors.",
      status: tCount > 0 ? "done" : "active",
      cta:
        tCount > 0 ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/test-sets">
              {tCount} loaded <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="primary" size="sm">
              <Link href="/test-sets/new">+ New</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={seedMutation.isPending}
              onClick={() => seedMutation.mutate()}
            >
              Load demo
            </Button>
          </div>
        ),
    },
    {
      n: 2,
      title: "Agent",
      blurb: "A prompt + model.",
      status: aCount > 0 ? "done" : tCount > 0 ? "active" : "idle",
      cta:
        aCount > 0 ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/agents">
              {aCount} defined <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        ) : (
          <Button
            asChild={tCount > 0}
            variant={tCount > 0 ? "primary" : "outline"}
            size="sm"
            disabled={tCount === 0}
          >
            {tCount > 0 ? <Link href="/agents/new">+ New</Link> : <span>+ New</span>}
          </Button>
        ),
    },
    {
      n: 3,
      title: "Run",
      blurb: "Score the agent.",
      status: rCount > 0 ? "done" : aCount > 0 && tCount > 0 ? "active" : "idle",
      cta:
        rCount > 0 ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/runs">
              {rCount} executed <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        ) : (
          <Button
            asChild={aCount > 0}
            variant={aCount > 0 ? "primary" : "outline"}
            size="sm"
            disabled={aCount === 0}
          >
            {aCount > 0 ? <Link href="/runs/new">Start run</Link> : <span>Start run</span>}
          </Button>
        ),
    },
    {
      n: 4,
      title: "Compare",
      blurb: "Diff two runs.",
      status: canCompare ? "active" : "idle",
      cta: (
        <Button
          asChild={canCompare}
          variant={canCompare ? "primary" : "outline"}
          size="sm"
          disabled={!canCompare}
        >
          {canCompare ? (
            <Link href="/compare">
              Open <ArrowRight className="h-3 w-3" />
            </Link>
          ) : (
            <span>Open</span>
          )}
        </Button>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {steps.map((s) => (
        <div
          key={s.n}
          className={cn(
            "rounded-lg border border-border bg-card p-5 space-y-3 transition-colors",
            s.status === "active" && "ring-1 ring-foreground/20",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">
              Step {s.n}
            </span>
            <StatusDot status={s.status} />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-medium">{s.title}</h3>
            <p className="text-xs text-muted-foreground">{s.blurb}</p>
          </div>
          <div className="pt-1">{s.cta}</div>
        </div>
      ))}
    </div>
  );
}
