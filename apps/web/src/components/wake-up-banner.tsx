"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";

type State = "pending" | "ok" | "slow" | "failed";

const SHOW_BANNER_AFTER_MS = 3_000;
const FAILED_AFTER_MS = 90_000;

export function WakeUpBanner() {
  const [state, setState] = useState<State>("pending");

  useEffect(() => {
    let cancelled = false;
    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    let failTimer: ReturnType<typeof setTimeout> | undefined;

    slowTimer = setTimeout(() => {
      if (!cancelled) {
        setState((prev) => (prev === "pending" ? "slow" : prev));
      }
    }, SHOW_BANNER_AFTER_MS);

    failTimer = setTimeout(() => {
      if (!cancelled) {
        setState((prev) => (prev === "ok" ? prev : "failed"));
      }
    }, FAILED_AFTER_MS);

    api("/api/v1/health")
      .then(() => {
        if (!cancelled) setState("ok");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });

    return () => {
      cancelled = true;
      if (slowTimer) clearTimeout(slowTimer);
      if (failTimer) clearTimeout(failTimer);
    };
  }, []);

  if (state === "pending" || state === "ok") return null;

  const isFail = state === "failed";
  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 border-b ${
        isFail
          ? "border-destructive/40 bg-destructive/[0.08] text-destructive"
          : "border-border bg-secondary text-foreground"
      }`}
    >
      <div className="container mx-auto flex items-center gap-3 px-6 py-2 text-xs">
        {state === "slow" ? (
          <p className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            <span className="text-muted-foreground">
              Waking the API… Render free tier wakes from idle in 30–60s.
            </span>
          </p>
        ) : (
          <p>Backend isn&apos;t responding. Free tier daily quota may be exhausted.</p>
        )}
      </div>
    </div>
  );
}
