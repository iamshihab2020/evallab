import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  back,
  eyebrow,
  title,
  blurb,
  action,
}: {
  back?: { href: string; label: string };
  eyebrow?: ReactNode;
  title: ReactNode;
  blurb?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="pb-6 mb-8 border-b border-border/60 fade-up">
      {back && (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1.5 mb-3 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          <span aria-hidden>←</span>
          <span>Back to {back.label}</span>
        </Link>
      )}
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="space-y-2">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
          {blurb && (
            <p className="text-sm text-muted-foreground max-w-xl">{blurb}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
