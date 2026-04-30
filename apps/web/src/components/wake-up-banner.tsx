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

  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b bg-amber-50 text-amber-900 shadow-sm dark:bg-amber-900/30 dark:text-amber-50">
      <div className="container mx-auto flex items-center gap-3 px-4 py-2 text-sm">
        {state === "slow" ? (
          <>
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            <p>
              Waking up backend (Render free tier sleeps after 15 min idle). This usually takes 30
              to 60 seconds. Hang tight!
            </p>
          </>
        ) : (
          <p>
            Backend isn&apos;t responding. The free tier may be over its daily quota — try again
            later.
          </p>
        )}
      </div>
    </div>
  );
}
