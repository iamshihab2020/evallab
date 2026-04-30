"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
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
import type { Agent, AgentVersion, Run, RunStartInput, TestSet } from "@/lib/types";

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
  const [agentVersionId, setAgentVersionId] = useState<string | undefined>();
  const [judgeModel, setJudgeModel] = useState(JUDGE_MODELS[0]);

  const versions = useQuery({
    queryKey: ["agents", agentId, "versions"],
    queryFn: () => api<AgentVersion[]>(`/api/v1/agents/${agentId}/versions`),
    enabled: !!agentId,
  });

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
  const selectedAgent = agents.data?.find((a) => a.id === agentId);
  const caseCount = selectedTestSet?.case_count ?? 0;
  const estimatedSeconds = caseCount > 0 ? Math.ceil((caseCount * 2 * 60) / 28) : 0;
  const estimatedMinutes = Math.floor(estimatedSeconds / 60);
  const estimatedRem = estimatedSeconds % 60;
  const eta =
    estimatedSeconds === 0
      ? "—"
      : estimatedMinutes > 0
      ? `~${estimatedMinutes}m ${estimatedRem}s`
      : `~${estimatedSeconds}s`;

  const canSubmit = !!testSetId && !!agentId && !mutation.isPending;

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <Link href="/runs" className="hover:text-foreground transition-colors">
              Runs
            </Link>
            <span className="mx-1.5 opacity-40">/</span>
            <span>New</span>
          </>
        }
        title="New run"
        blurb="Pick a test set and an agent. Every case is scored by an LLM-as-judge at temperature 0."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-5 fade-up">
          <div className="rounded-lg border border-border bg-card p-6 space-y-5">
            <div className="space-y-2">
              <Label>Test set</Label>
              <Select value={testSetId} onValueChange={setTestSetId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a test set" />
                </SelectTrigger>
                <SelectContent>
                  {(testSets.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}{" "}
                      <span className="text-muted-foreground ml-1">
                        — {t.case_count} cases
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(testSets.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No test sets yet.{" "}
                  <Link href="/test-sets/new" className="underline underline-offset-4">
                    Create one
                  </Link>
                  .
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Agent</Label>
              <Select
                value={agentId}
                onValueChange={(v) => {
                  setAgentId(v);
                  setAgentVersionId(undefined); // reset; default to latest
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick an agent" />
                </SelectTrigger>
                <SelectContent>
                  {(agents.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}{" "}
                      <span className="text-muted-foreground ml-1">— {a.model}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {agentId && (versions.data?.length ?? 0) > 1 && (
                <div className="space-y-1 pt-2">
                  <Label className="text-xs text-muted-foreground">
                    Prompt version (defaults to latest)
                  </Label>
                  <Select
                    value={agentVersionId ?? "__latest__"}
                    onValueChange={(v) =>
                      setAgentVersionId(v === "__latest__" ? undefined : v)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__latest__">
                        Latest (v{versions.data?.[0]?.version ?? "?"})
                      </SelectItem>
                      {(versions.data ?? []).map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          v{v.version} ·{" "}
                          {new Date(v.created_at).toLocaleDateString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(agents.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No agents yet.{" "}
                  <Link href="/agents/new" className="underline underline-offset-4">
                    Create one
                  </Link>
                  .
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Judge model</Label>
              <Select value={judgeModel} onValueChange={setJudgeModel}>
                <SelectTrigger className="w-full">
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
              <p className="text-xs text-muted-foreground">
                Scores agent responses 1–5 against the expected behavior.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="lg"
              loading={mutation.isPending}
              disabled={!canSubmit}
              onClick={() =>
                mutation.mutate({
                  test_set_id: testSetId!,
                  agent_id: agentId!,
                  agent_version_id: agentVersionId ?? null,
                  judge_model: judgeModel,
                })
              }
            >
              Start run
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/runs">Cancel</Link>
            </Button>
          </div>
        </div>

        <aside
          className="space-y-4 fade-up self-start lg:sticky lg:top-20"
          style={{ animationDelay: "120ms" }}
        >
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <p className="eyebrow">Run preview</p>
            <PreviewRow label="Test set" value={selectedTestSet?.name ?? "—"} />
            <PreviewRow
              label="Cases"
              value={caseCount > 0 ? caseCount.toString() : "—"}
              mono
            />
            <PreviewRow label="Agent" value={selectedAgent?.name ?? "—"} />
            <PreviewRow
              label="Model"
              value={selectedAgent?.model ?? "—"}
              mono
            />
            <PreviewRow label="Judge" value={judgeModel} mono />
            <div className="border-t border-border pt-4">
              <PreviewRow label="Est. time" value={eta} mono highlight />
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed px-1">
            Each case = 1 agent call + 1 judge call. Throttled to 28 RPM to
            stay under Groq's free-tier ceiling.
          </p>
        </aside>
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  mono = false,
  highlight = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-sm text-right truncate ${mono ? "font-mono" : ""} ${
          highlight ? "text-foreground" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
