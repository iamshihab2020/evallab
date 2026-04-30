"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import type { Agent, SeedLoadResult, TestSet } from "@/lib/types";

export default function Home() {
  const queryClient = useQueryClient();

  const testSets = useQuery({
    queryKey: ["test-sets"],
    queryFn: () => api<TestSet[]>("/api/v1/test-sets"),
  });
  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: () => api<Agent[]>("/api/v1/agents"),
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      api<SeedLoadResult>("/api/v1/seeds/sms-support-v1", { method: "POST" }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["test-sets"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success(res.already_loaded ? "Seed data already loaded" : "Seed data loaded");
    },
    onError: (e) => toast.error(e.message),
  });

  const testSetCount = testSets.data?.length ?? 0;
  const agentCount = agents.data?.length ?? 0;
  const loaded = testSets.isSuccess && agents.isSuccess;
  const showSeedCTA = loaded && testSetCount === 0 && agentCount === 0;

  const sections = [
    {
      title: "Test Sets",
      description: "Lists of inputs + expected behaviors.",
      count: testSetCount,
      ready: testSets.isSuccess,
    },
    {
      title: "Agents",
      description: "Prompt + model under evaluation.",
      count: agentCount,
      ready: agents.isSuccess,
    },
    { title: "Runs", description: "An agent scored against a test set.", count: 0, ready: true },
    { title: "Compare", description: "Two runs side by side.", count: 0, ready: true },
  ];

  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">EvalLab</h1>
        <p className="max-w-2xl text-muted-foreground">
          Measure your LLM outputs systematically. Define test sets, define agents, run them,
          and compare runs side by side.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <CardTitle>{s.title}</CardTitle>
              <CardDescription>{s.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">
                {s.ready ? s.count : "—"}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      {showSeedCTA && (
        <section className="space-y-2">
          <Button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending ? "Loading…" : "Load seed data"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Loads the SMS Support v1 demo: 30 cases + 2 agents.
          </p>
        </section>
      )}
    </div>
  );
}
