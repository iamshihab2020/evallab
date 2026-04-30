"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { SeedLoadResult, TestSet } from "@/lib/types";

export default function TestSetsPage() {
  const queryClient = useQueryClient();

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

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Test Sets</h1>
          <p className="text-sm text-muted-foreground">
            Lists of inputs + expected behaviors used to score agents.
          </p>
        </div>
        <Button asChild>
          <Link href="/test-sets/new">+ New test set</Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load: {error.message}</p>
      ) : data && data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            No test sets yet. Load the SMS Support seed (30 cases) to get started.
          </p>
          <Button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending ? "Loading seed…" : "Load seed data"}
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Cases</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((ts) => (
              <TableRow key={ts.id}>
                <TableCell>
                  <Link
                    href={`/test-sets/${ts.id}`}
                    className="font-medium hover:underline"
                  >
                    {ts.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {ts.description ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ts.case_count}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(ts.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
