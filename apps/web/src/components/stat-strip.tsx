import type { ReactNode } from "react";

export function StatStrip({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 mb-6 fade-up">
      {items.map((s, i) => (
        <div key={i} className="flex items-baseline gap-2">
          <span className="text-2xl font-light tracking-tight tabular-nums">
            {s.value}
          </span>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
