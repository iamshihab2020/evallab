import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const labBadge = cva(
  "inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-[11px] border whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-border text-muted-foreground bg-transparent",
        pass: "border-transparent text-foreground bg-secondary",
        secondary: "border-transparent text-foreground bg-secondary",
        destructive:
          "border-destructive/30 text-destructive bg-destructive/[0.08]",
        outline: "border-border text-foreground",
        pending:
          "border-border text-muted-foreground bg-muted/40 pulse-amber",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type LabBadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof labBadge> & { asChild?: boolean };

export const Badge = forwardRef<HTMLSpanElement, LabBadgeProps>(
  ({ className, variant, asChild, ...rest }, ref) => {
    const Comp = asChild ? Slot.Root : "span";
    return (
      <Comp
        ref={ref as never}
        className={cn(labBadge({ variant }), className)}
        {...rest}
      />
    );
  },
);
Badge.displayName = "LabBadge";
