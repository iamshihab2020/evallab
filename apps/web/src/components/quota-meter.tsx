"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { RunUsage } from "@/lib/types";

function compactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toString();
}

/** Tiny pill in the nav showing today's Groq token usage vs the daily quota.
 *  Renders nothing until there is real spend to report — keeps a fresh DB clean. */
export function QuotaMeter() {
  const { data } = useQuery({
    queryKey: ["usage", "today"],
    queryFn: () => api<RunUsage>("/api/v1/usage/today"),
    refetchOnWindowFocus: true,
    refetchInterval: false,
    retry: 0,
    staleTime: 60_000,
  });

  if (!data || data.tokens_total_today === 0) return null;

  const pct = Math.max(0, Math.min(1, data.percent_used));
  const tone =
    pct >= 0.95
      ? "border-destructive/60 text-destructive"
      : pct >= 0.8
        ? "border-amber-500/60 text-amber-600 dark:text-amber-400"
        : "border-border text-muted-foreground";
  const fillTone =
    pct >= 0.95
      ? "bg-destructive"
      : pct >= 0.8
        ? "bg-amber-500"
        : "bg-foreground/60";

  const label = `${compactTokens(data.tokens_total_today)} / ${compactTokens(data.daily_quota_tokens)} tok today`;

  return (
    <div
      title={`${data.tokens_in_today.toLocaleString()} in · ${data.tokens_out_today.toLocaleString()} out · ${data.runs_today} run${data.runs_today === 1 ? "" : "s"}`}
      className={cn(
        "hidden md:flex h-8 items-center gap-2 rounded-md border px-2.5 text-[11px] font-mono transition-colors",
        tone,
      )}
    >
      <span className="relative inline-block h-1 w-12 overflow-hidden rounded-full bg-secondary">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all", fillTone)}
          style={{ width: `${pct * 100}%` }}
        />
      </span>
      <span className="tabular-nums">{label}</span>
    </div>
  );
}
