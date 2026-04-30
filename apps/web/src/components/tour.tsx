"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const KEY = "evallab.tour.completed";

const STEPS = [
  {
    title: "Welcome to EvalLab",
    body: "Build evals in four steps. Each one unlocks the next. We'll walk you through it.",
  },
  {
    title: "Step 01 — Test set",
    body: "A list of inputs your agent should handle. Make one from scratch, or load the SMS Support demo (30 cases) with one click.",
  },
  {
    title: "Step 02 — Agent",
    body: "A prompt + model under evaluation. The thing being scored.",
  },
  {
    title: "Step 03 — Run",
    body: "Score one agent against one test set. ~2 min for 30 cases. The judge LLM scores 1–5 against the expected behavior.",
  },
  {
    title: "Step 04 — Compare",
    body: "Diff two runs side by side. See what improved, regressed, or stayed the same.",
  },
];

export function Tour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const onOpen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("evallab:tour-open", onOpen);
    // Auto-show on first ever visit
    try {
      const done = localStorage.getItem(KEY);
      if (!done) onOpen();
    } catch {}
    return () => window.removeEventListener("evallab:tour-open", onOpen);
  }, []);

  function close(markDone = true) {
    setOpen(false);
    if (markDone) {
      try {
        localStorage.setItem(KEY, "true");
      } catch {}
    }
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
          onClick={() => close(false)}
        >
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative max-w-md w-full bg-card border border-border rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">
                  {String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
                </span>
                <button
                  onClick={() => close()}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Skip
                </button>
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-medium tracking-tight">{current.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{current.body}</p>
              </div>
              <div className="flex items-center gap-1 pt-1">
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={`h-0.5 flex-1 rounded-full transition-colors ${
                      i <= step ? "bg-foreground" : "bg-border"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (isLast) close();
                    else setStep((s) => s + 1);
                  }}
                >
                  {isLast ? "Start building" : "Next"}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
