"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AgentForm, type AgentFormValues } from "@/components/agent-form";
import { api } from "@/lib/api";
import type { Agent } from "@/lib/types";

export default function NewAgentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (values: AgentFormValues) =>
      api<Agent>("/api/v1/agents", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent created");
      router.push(`/agents/${agent.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href="/agents"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Agents
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New Agent</h1>
      </div>

      <AgentForm
        onSubmit={(v) => mutation.mutate(v)}
        submitLabel="Create"
        isSubmitting={mutation.isPending}
        onCancel={() => router.push("/agents")}
      />
    </div>
  );
}
