"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AgentForm, type AgentFormValues } from "@/components/agent-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import type { Agent, AgentVersion, DebugTestPromptResult } from "@/lib/types";

const detailKey = (id: string) => ["agents", id];
const versionsKey = (id: string) => ["agents", id, "versions"];

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
    onSuccess: (saved, values) => {
      queryClient.invalidateQueries({ queryKey: detailKey(id) });
      queryClient.invalidateQueries({ queryKey: versionsKey(id) });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      const promptChanged =
        values.system_prompt !== undefined ||
        values.model !== undefined ||
        values.temperature !== undefined ||
        values.max_tokens !== undefined;
      toast.success(
        promptChanged
          ? `Saved as v${saved.current_version}`
          : "Agent saved",
      );
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
    <div>
      <PageHeader
        eyebrow={
          <>
            <Link href="/agents" className="hover:text-foreground transition-colors">
              Agents
            </Link>
            <span className="mx-1.5 opacity-40">/</span>
            <span className="font-mono normal-case">{data.model}</span>
          </>
        }
        title={
          <span className="flex items-baseline gap-3 flex-wrap">
            <span>{data.name}</span>
            <Badge variant="secondary" className="font-mono text-xs px-2 py-0.5">
              v{data.current_version}
            </Badge>
          </span>
        }
        blurb={`Created ${formatDateTime(data.created_at)} · edited ${formatDateTime(data.updated_at)}`}
        action={
          <DeleteAgentDialog
            isPending={deleteMutation.isPending}
            onConfirm={() => deleteMutation.mutate()}
          />
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 fade-up">
        {/* Left column: editor + test prompt */}
        <div className="space-y-6 min-w-0">
          <section className="rounded-lg border border-border bg-card/40 p-6">
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-sm font-medium">Edit prompt</h2>
              <p className="text-[11px] font-mono text-muted-foreground">
                changing prompt / model / temperature / max_tokens creates a new version
              </p>
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
          </section>

          <TestPromptTool agentId={data.id} />
        </div>

        {/* Right column: version history (sticky on desktop) */}
        <aside className="lg:sticky lg:top-20 self-start">
          <VersionHistory
            agentId={data.id}
            currentVersion={data.current_version}
          />
        </aside>
      </div>
    </div>
  );
}

function VersionHistory({
  agentId,
  currentVersion,
}: {
  agentId: string;
  currentVersion: number;
}) {
  const { data, isLoading } = useQuery({
    queryKey: versionsKey(agentId),
    queryFn: () => api<AgentVersion[]>(`/api/v1/agents/${agentId}/versions`),
  });

  return (
    <section className="rounded-lg border border-border bg-card/40 overflow-hidden">
      <header className="px-5 py-4 border-b border-border/60">
        <p className="eyebrow">Version history</p>
        <p className="text-xs text-muted-foreground mt-1">
          {data && data.length > 0
            ? `${data.length} version${data.length === 1 ? "" : "s"} · v${currentVersion} current`
            : isLoading
            ? "Loading…"
            : "—"}
        </p>
      </header>

      {data && data.length === 1 && (
        <div className="px-5 py-4 text-xs text-muted-foreground leading-relaxed">
          Only v1 exists. Edit the prompt, model, temperature, or max tokens
          and save — a v2 snapshot will appear here. Runs pin to the version
          that was current when they started, so old runs never lie about
          what prompt produced them.
        </div>
      )}

      {data && data.length > 1 && (
        <div className="divide-y divide-border/60">
          {data.map((v) => (
            <Collapsible key={v.id}>
              <CollapsibleTrigger asChild>
                <button className="w-full px-5 py-3 flex items-center gap-3 text-left text-sm hover:bg-muted/40 transition-colors">
                  <Badge
                    variant={
                      v.version === currentVersion ? "default" : "secondary"
                    }
                    className="font-mono text-xs px-2 py-0.5 shrink-0"
                  >
                    v{v.version}
                  </Badge>
                  <span className="font-mono text-[11px] text-muted-foreground truncate">
                    {formatDateTime(v.created_at)}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground shrink-0">
                    T{v.temperature.toFixed(1)} · {v.max_tokens}
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mx-5 mb-4 rounded bg-muted p-3 text-xs whitespace-pre-wrap leading-relaxed">
                  {v.system_prompt}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </section>
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
    <section className="rounded-lg border border-border bg-card/40 p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Test prompt</h2>
        <p className="text-[11px] font-mono text-muted-foreground">
          1 Groq call · counts toward your 1k/day quota
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
        <div className="rounded-md border border-border/60 bg-muted/40 p-4 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <span className="rounded bg-background border border-border/60 px-2 py-0.5 tabular-nums">
              {result.latency_ms} ms
            </span>
            <span>{result.model_used}</span>
          </div>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed">{result.output}</pre>
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
