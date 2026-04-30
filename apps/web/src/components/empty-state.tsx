import type { ReactNode } from "react";

export function EmptyState({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/30 px-8 py-14 text-center fade-up">
      <div className="space-y-3 max-w-md mx-auto">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h3 className="text-lg font-medium">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {action && <div className="pt-3 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
