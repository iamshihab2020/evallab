"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { Agent, Run, RunStartInput, TestSet } from "@/lib/types";

const JUDGE_MODELS = ["llama-3.3-70b-versatile"];

export default function NewRunPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const testSets = useQuery({
    queryKey: ["test-sets"],
    queryFn: () => api<TestSet[]>("/api/v1/test-sets"),
  });
  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: () => api<Agent[]>("/api/v1/agents"),
  });

  const [testSetId, setTestSetId] = useState<string | undefined>();
  const [agentId, setAgentId] = useState<string | undefined>();
  const [judgeModel, setJudgeModel] = useState(JUDGE_MODELS[0]);

  const mutation = useMutation({
    mutationFn: (body: RunStartInput) =>
      api<Run>("/api/v1/runs", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      toast.success("Run started");
      router.push(`/runs/${run.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedTestSet = testSets.data?.find((t) => t.id === testSetId);
  const caseCount = selectedTestSet?.case_count ?? 0;
  const estimatedSeconds = Math.ceil((caseCount * 2 * 60) / 28);

  const canSubmit = testSetId && agentId && !mutation.isPending;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href="/runs"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Runs
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New Run</h1>
      </div>

      <div className="space-y-2">
        <Label>Test Set</Label>
        <Select value={testSetId} onValueChange={setTestSetId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a test set" />
          </SelectTrigger>
          <SelectContent>
            {testSets.data?.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} ({t.case_count} cases)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Agent</Label>
        <Select value={agentId} onValueChange={setAgentId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick an agent" />
          </SelectTrigger>
          <SelectContent>
            {agents.data?.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} <span className="text-muted-foreground">— {a.model}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Judge model</Label>
        <Select value={judgeModel} onValueChange={setJudgeModel}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {JUDGE_MODELS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTestSet && (
        <p className="text-sm text-muted-foreground">
          ~{estimatedSeconds}s estimated wall-clock at 28 RPM
          ({caseCount} cases × 2 calls each).
        </p>
      )}

      <Button
        disabled={!canSubmit}
        onClick={() =>
          mutation.mutate({
            test_set_id: testSetId!,
            agent_id: agentId!,
            judge_model: judgeModel,
          })
        }
      >
        {mutation.isPending ? "Starting…" : "Run"}
      </Button>
    </div>
  );
}
