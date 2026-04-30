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
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Agent } from "@/lib/types";

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

      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        Test Prompt tool ships in Phase 3.
      </p>
    </div>
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
