"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AgentForm, type AgentFormValues } from "@/components/agent-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Agent, DebugTestPromptResult } from "@/lib/types";

const detailKey = (id: string) => ["agents", id];

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: detailKey(id),
    queryFn: () => api<Agent>(`/api/v1/agents/${id}`),
  });

  const updateMutation = useMutation({
    mutationFn: (values: AgentFormValues) =>
      api<Agent>(`/api/v1/agents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(id) });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/api/v1/agents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent deleted");
      router.push("/agents");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Agent is in use by existing runs and cannot be deleted.");
      } else {
        toast.error(e.message);
      }
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        Failed to load agent{error ? `: ${error.message}` : ""}.
      </p>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href="/agents"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Agents
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
            <p className="text-sm text-muted-foreground">
              Created {formatDateTime(data.created_at)} · edited{" "}
              {formatDateTime(data.updated_at)}
            </p>
          </div>
          <DeleteAgentDialog
            isPending={deleteMutation.isPending}
            onConfirm={() => deleteMutation.mutate()}
          />
        </div>
      </div>

      <AgentForm
        defaultValues={{
          name: data.name,
          system_prompt: data.system_prompt,
          model: data.model,
          temperature: data.temperature,
          max_tokens: data.max_tokens,
        }}
        onSubmit={(v) => updateMutation.mutate(v)}
        submitLabel="Save changes"
        isSubmitting={updateMutation.isPending}
      />

      <TestPromptTool agentId={data.id} />
    </div>
  );
}

function TestPromptTool({ agentId }: { agentId: string }) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<DebugTestPromptResult | null>(null);

  const mutation = useMutation({
    mutationFn: (text: string) =>
      api<DebugTestPromptResult>("/api/v1/debug/test-prompt", {
        method: "POST",
        body: JSON.stringify({ agent_id: agentId, input: text }),
      }),
    onSuccess: (r) => setResult(r),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401) {
        toast.error("Set NEXT_PUBLIC_API_KEY in apps/web/.env.local");
      } else {
        toast.error(e.message);
      }
    },
  });

  return (
    <section className="space-y-3 rounded-md border p-4">
      <div>
        <h2 className="text-lg font-semibold">Test Prompt</h2>
        <p className="text-xs text-muted-foreground">
          One Groq call per click; counts toward your daily 1k-request quota.
        </p>
      </div>
      <Textarea
        rows={4}
        placeholder="i want a refund for #12345"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <Button
        onClick={() => mutation.mutate(input)}
        disabled={mutation.isPending || input.trim().length === 0}
      >
        {mutation.isPending ? "Running…" : "Run"}
      </Button>
      {result && (
        <div className="space-y-2 rounded-md bg-muted p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-background px-2 py-0.5 tabular-nums">
              {result.latency_ms} ms
            </span>
            <span className="font-mono">{result.model_used}</span>
          </div>
          <pre className="whitespace-pre-wrap text-sm">{result.output}</pre>
        </div>
      )}
    </section>
  );
}

function DeleteAgentDialog({
  isPending,
  onConfirm,
}: {
  isPending: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete agent?</DialogTitle>
          <DialogDescription>
            Agents referenced by an existing run can&apos;t be deleted — runs
            need their agent for stats and the compare view.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
