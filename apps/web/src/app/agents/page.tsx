"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

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
import type { Agent } from "@/lib/types";

export default function AgentsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api<Agent[]>("/api/v1/agents"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">
            A prompt + model. The agent under evaluation when you start a run.
          </p>
        </div>
        <Button asChild>
          <Link href="/agents/new">+ New agent</Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load: {error.message}</p>
      ) : data && data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No agents yet. Create one or load the SMS Support seed from the Test
          Sets page.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Temperature</TableHead>
              <TableHead className="text-right">Max tokens</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <Link
                    href={`/agents/${a.id}`}
                    className="font-medium hover:underline"
                  >
                    {a.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {a.model}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {a.temperature.toFixed(1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {a.max_tokens}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(a.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
