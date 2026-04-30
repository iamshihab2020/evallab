"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { SeedLoadResult, TestSet } from "@/lib/types";

export default function TestSetsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ["test-sets"],
    queryFn: () => api<TestSet[]>("/api/v1/test-sets"),
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      api<SeedLoadResult>("/api/v1/seeds/sms-support-v1", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(r.already_loaded ? "Seed data already loaded" : "Seed data loaded");
      queryClient.invalidateQueries({ queryKey: ["test-sets"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const totalCases = (data ?? []).reduce((sum, t) => sum + t.case_count, 0);

  return (
    <div>
      <PageHeader
        title="Test sets"
        blurb="Lists of inputs + expected behaviors used to score agents."
        action={
          <Button asChild variant="primary">
            <Link href="/test-sets/new">+ New test set</Link>
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground font-mono">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load: {error.message}</p>
      ) : data && data.length === 0 ? (
        <EmptyState
          eyebrow="Empty"
          title="Nothing to score yet"
          description="Load the SMS Support demo (30 cases, 2 agents) or build one from scratch."
          action={
            <div className="flex gap-2 justify-center">
              <Button
                variant="primary"
                loading={seedMutation.isPending}
                onClick={() => seedMutation.mutate()}
              >
                Load demo
              </Button>
              <Button asChild variant="outline">
                <Link href="/test-sets/new">+ New test set</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <StatStrip
            items={[
              { label: data && data.length === 1 ? "test set" : "test sets", value: data?.length ?? 0 },
              { label: "total cases", value: totalCases },
            ]}
          />
          <ul className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden fade-up">
            {data?.map((ts) => (
              <li key={ts.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/test-sets/${ts.id}`)}
                  className="group w-full text-left flex items-center gap-6 px-5 py-4 hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3">
                      <span className="font-medium text-base truncate">
                        {ts.name}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0">
                        {ts.case_count} {ts.case_count === 1 ? "case" : "cases"}
                      </span>
                    </div>
                    {ts.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                        {ts.description}
                      </p>
                    )}
                  </div>
                  <span className="hidden sm:block font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatDateTime(ts.created_at)}
                  </span>
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
