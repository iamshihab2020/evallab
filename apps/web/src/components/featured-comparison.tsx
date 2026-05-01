"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { api } from "@/lib/api";
import type { RunCompare, RunListItem } from "@/lib/types";

// Pinstripe of dimensions the compare layer also uses. Keep in sync with
// services/judge.py:DIMENSIONS — we read the same JSON keys.
const DIMENSIONS = [
  { key: "accuracy", label: "Accuracy" },
  { key: "completeness", label: "Completeness" },
  { key: "tone", label: "Tone" },
  { key: "safety", label: "Safety" },
] as const;

type FeaturedPair = {
  a: RunListItem;
  b: RunListItem;
  delta: number; // b.pass_rate - a.pass_rate, always >= 0 (b is the winner)
};

/** Pick the run pair on the same test set with the largest pass-rate delta.
 *  We orient so B is the winner — recruiters read "v2 beat v1" faster than
 *  "v1 lost to v2." Returns null when fewer than two completed runs share a
 *  test set; the home page falls back to the StepRail in that case. */
function pickFeaturedPair(runs: RunListItem[]): FeaturedPair | null {
  const eligible = runs.filter(
    (r) => r.status === "completed" && r.pass_rate != null,
  );
  const groups = new Map<string, RunListItem[]>();
  for (const r of eligible) {
    const list = groups.get(r.test_set_id) ?? [];
    list.push(r);
    groups.set(r.test_set_id, list);
  }
  let best: FeaturedPair | null = null;
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const ra = list[i];
        const rb = list[j];
        const pa = ra.pass_rate!;
        const pb = rb.pass_rate!;
        const [a, b] = pa <= pb ? [ra, rb] : [rb, ra];
        const delta = b.pass_rate! - a.pass_rate!;
        if (!best || delta > best.delta) {
          best = { a, b, delta };
        }
      }
    }
  }
  return best;
}

/** Hook for the home page to decide whether to show the featured card or
 *  fall back to the step rail. Reads the same `["runs"]` query so there is
 *  exactly one network call. */
export function useFeaturedPair(): FeaturedPair | null {
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<RunListItem[]>("/api/v1/runs"),
  });
  return useMemo(
    () => pickFeaturedPair(runsQuery.data ?? []),
    [runsQuery.data],
  );
}

export function FeaturedComparison() {
  const pair = useFeaturedPair();

  // Same query key as /compare — instant render if user has already visited.
  const compareQuery = useQuery({
    queryKey: ["compare", pair?.a.id, pair?.b.id],
    queryFn: () =>
      api<RunCompare>(
        `/api/v1/runs/compare?a=${pair!.a.id}&b=${pair!.b.id}`,
      ),
    enabled: !!pair,
    staleTime: 5 * 60 * 1000,
  });

  if (!pair) return null;

  const data = compareQuery.data;
  const dimsA = data?.run_a.stats?.per_dimension ?? null;
  const dimsB = data?.run_b.stats?.per_dimension ?? null;
  const showDims = !!(dimsA && dimsB);

  const aPct = Math.round((pair.a.pass_rate ?? 0) * 100);
  const bPct = Math.round((pair.b.pass_rate ?? 0) * 100);
  const deltaPct = Math.round(pair.delta * 100);

  // Editorial framing line. Reuses what we know about the pair without
  // burning an LLM call — the compare insight is one click away if the user
  // wants the prose version.
  const sameAgent = pair.a.agent_id === pair.b.agent_id;
  const framing = sameAgent
    ? `Same agent, two prompt versions. v${pair.a.agent_version} → v${pair.b.agent_version}.`
    : "Two agents, the same test set. Iteration with numbers, not vibes.";

  return (
    <article className="relative overflow-hidden rounded-lg border border-border bg-card fade-up">
      {/* Hairline diagonal accent in the corner — a single decorative line
          that says "this is the headline card" without using color */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rotate-45 border-t border-foreground/15"
      />

      <header className="flex items-center justify-between border-b border-border/60 px-6 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-foreground" />
          <p className="eyebrow">Featured comparison</p>
        </div>
        <Link
          href={`/compare?a=${pair.a.id}&b=${pair.b.id}`}
          className="group inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          Open in Compare
          <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </header>

      <div className="px-6 py-7 sm:px-10 sm:py-9 space-y-8">
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          {framing}
        </p>

        {/* Scoreboard: A · Δ · B. On lg, a hairline divider runs through
            the middle column to suggest a tabletop scoreboard partition. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-end gap-y-8 gap-x-6 sm:gap-x-10">
          <ScoreSide
            side="A"
            agentName={pair.a.agent_name}
            agentVersion={pair.a.agent_version}
            pct={aPct}
            tone="muted"
          />

          <DeltaBlock pct={deltaPct} />

          <ScoreSide
            side="B"
            agentName={pair.b.agent_name}
            agentVersion={pair.b.agent_version}
            pct={bPct}
            tone="winner"
            align="right"
          />
        </div>

        {/* Dimension deltas — only renders when BOTH runs have dim data.
            Old runs (pre-dimensional rubric) gracefully hide this section. */}
        {showDims && (
          <div className="border-t border-border/60 pt-6 space-y-3 fade-up">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow">Per-dimension delta</p>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                A → B · scale of 5
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2.5">
              {DIMENSIONS.map(({ key, label }) => {
                const va = dimsA![key] ?? 0;
                const vb = dimsB![key] ?? 0;
                const d = vb - va;
                return (
                  <DimDeltaRow
                    key={key}
                    label={label}
                    valueA={va}
                    valueB={vb}
                    delta={d}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Footer: factual provenance. All-mono, all-uppercase, all-muted. */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 border-t border-border/60 pt-4 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <span className="truncate">{pair.a.test_set_name}</span>
          <span className="opacity-60">·</span>
          <span>{pair.a.total_cases} cases</span>
          <span className="opacity-60">·</span>
          <span className="truncate">judge {pair.a.judge_model}</span>
        </div>
      </div>
    </article>
  );
}

function ScoreSide({
  side,
  agentName,
  agentVersion,
  pct,
  tone,
  align = "left",
}: {
  side: "A" | "B";
  agentName: string;
  agentVersion: number | null;
  pct: number;
  tone: "muted" | "winner";
  align?: "left" | "right";
}) {
  const alignClass = align === "right" ? "lg:text-right lg:items-end" : "";
  const numColor =
    tone === "winner" ? "text-foreground" : "text-muted-foreground/80";
  const pctColor =
    tone === "winner" ? "text-foreground/60" : "text-muted-foreground/40";

  return (
    <div className={`flex flex-col gap-2 ${alignClass}`}>
      <div className="flex items-center gap-2 lg:flex-wrap">
        <span className="inline-flex h-5 items-center rounded-sm border border-border px-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Run {side}
        </span>
        {agentVersion != null && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            v{agentVersion}
          </span>
        )}
      </div>
      <p className="text-base sm:text-lg font-medium leading-tight">
        {agentName}
      </p>
      <p
        className={`mt-1 text-7xl sm:text-[5.5rem] font-light tracking-tight tabular-nums leading-none ${numColor}`}
      >
        {pct}
        <span className={`text-2xl sm:text-3xl align-top ml-0.5 ${pctColor}`}>
          %
        </span>
      </p>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        pass rate
      </p>
    </div>
  );
}

function DeltaBlock({ pct }: { pct: number }) {
  const isPositive = pct >= 0;
  const Trend = isPositive ? TrendingUp : TrendingDown;
  return (
    <div className="flex flex-col items-center gap-2 lg:px-2 lg:py-1">
      {/* Vertical hairline on lg, horizontal on smaller — a small visual
          partition so A and B feel separated even before the numbers do */}
      <span aria-hidden className="hidden lg:block h-8 w-px bg-border" />
      <div className="inline-flex items-center gap-1.5 rounded-md border border-foreground/30 bg-foreground/5 px-2.5 py-1">
        <Trend className="h-3 w-3" strokeWidth={2.25} />
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Δ
        </span>
        <span className="font-mono text-sm tabular-nums">
          {isPositive ? "+" : ""}
          {pct}%
        </span>
      </div>
      <span aria-hidden className="hidden lg:block h-8 w-px bg-border" />
    </div>
  );
}

function DimDeltaRow({
  label,
  valueA,
  valueB,
  delta,
}: {
  label: string;
  valueA: number;
  valueB: number;
  delta: number;
}) {
  // Stacked-bar trick: paint the LOWER value in muted tone, then paint the
  // delta segment continuing in either accent (positive) or destructive
  // (negative). One bar communicates magnitude AND direction at once.
  const lo = Math.min(valueA, valueB);
  const hi = Math.max(valueA, valueB);
  const baseWidth = (lo / 5) * 100;
  const deltaWidth = ((hi - lo) / 5) * 100;
  const positive = delta >= 0;

  const tone = positive
    ? delta === 0
      ? "text-muted-foreground"
      : "text-foreground"
    : "text-destructive";

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 text-muted-foreground">{label}</span>
      <div className="relative flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-foreground/30"
          style={{ width: `${baseWidth}%` }}
        />
        <div
          className={`absolute inset-y-0 ${positive ? "bg-foreground/80" : "bg-destructive/80"}`}
          style={{
            left: `${baseWidth}%`,
            width: `${deltaWidth}%`,
          }}
        />
      </div>
      <span className={`w-14 text-right font-mono tabular-nums ${tone}`}>
        {delta > 0 ? "+" : ""}
        {delta.toFixed(2)}
      </span>
    </div>
  );
}
