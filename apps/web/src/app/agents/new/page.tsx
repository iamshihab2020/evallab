"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AgentForm, type AgentFormValues } from "@/components/agent-form";
import { PageHeader } from "@/components/page-header";
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
    <div>
      <PageHeader
        back={{ href: "/agents", label: "Agents" }}
        eyebrow={
          <>
            <Link href="/agents" className="hover:text-foreground transition-colors">
              Agents
            </Link>
            <span className="mx-1.5 opacity-40">/</span>
            <span>New</span>
          </>
        }
        title="New agent"
        blurb="A system prompt + model. Tune temperature for creativity vs determinism."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 fade-up">
          <div className="rounded-lg border border-border bg-card p-6">
            <AgentForm
              onSubmit={(v) => mutation.mutate(v)}
              submitLabel="Create agent"
              isSubmitting={mutation.isPending}
              onCancel={() => router.push("/agents")}
            />
          </div>
        </div>

        <aside
          className="space-y-4 fade-up self-start lg:sticky lg:top-20"
          style={{ animationDelay: "120ms" }}
        >
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <p className="eyebrow">Tips</p>
            <ul className="text-sm text-muted-foreground space-y-2.5 leading-relaxed">
              <li>
                <span className="text-foreground">Be specific in the prompt.</span>{" "}
                Reference the domain (e.g. "e-commerce SMS support") and the
                tone you want.
              </li>
              <li>
                <span className="text-foreground">Temperature 0.5–0.9</span> is
                typical for agents. The judge always runs at 0.0.
              </li>
              <li>
                <span className="text-foreground">Max tokens 512</span> covers
                most replies. Bump to 1024+ if the agent needs to explain
                multi-step things.
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 space-y-2">
            <p className="eyebrow">Free-tier limit</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Groq caps at 30 RPM / 1k requests/day. EvalLab self-throttles to
              28 RPM. A 30-case run = 60 calls ≈ 2–3 min.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
