import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { tab?: boolean }>(
  ({ className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn("bg-card border border-border rounded-lg", className)}
      {...rest}
    />
  ),
);
Card.displayName = "LabCard";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn("px-5 pt-5 pb-3 space-y-1", className)} {...rest} />
  ),
);
CardHeader.displayName = "LabCardHeader";

export const CardTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn("text-sm font-medium tracking-tight", className)} {...rest} />
  ),
);
CardTitle.displayName = "LabCardTitle";

export const CardDescription = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn("text-xs text-muted-foreground", className)}
      {...rest}
    />
  ),
);
CardDescription.displayName = "LabCardDescription";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn("px-5 pb-5", className)} {...rest} />
  ),
);
CardContent.displayName = "LabCardContent";

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn("px-5 pb-5 pt-3 border-t border-border/60", className)} {...rest} />
  ),
);
CardFooter.displayName = "LabCardFooter";

export const CardAction = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn("ml-auto", className)} {...rest} />
  ),
);
CardAction.displayName = "LabCardAction";
