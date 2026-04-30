"use client";

import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const labButton = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground border border-primary hover:bg-primary/90 rounded-md font-medium",
        default:
          "bg-primary text-primary-foreground border border-primary hover:bg-primary/90 rounded-md font-medium",
        outline:
          "bg-transparent text-foreground border border-border hover:bg-secondary rounded-md",
        secondary:
          "bg-secondary text-secondary-foreground border border-transparent hover:bg-muted rounded-md",
        ghost:
          "bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent rounded-md",
        link:
          "bg-transparent text-foreground border-0 px-0 py-0 hover:underline underline-offset-4",
        destructive:
          "bg-transparent text-destructive border border-destructive/40 hover:bg-destructive hover:text-white rounded-md",
        mono:
          "bg-transparent text-muted-foreground border border-border font-mono text-xs hover:text-foreground hover:bg-secondary rounded-md",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-3.5 text-sm",
        default: "h-9 px-3.5 text-sm",
        lg: "h-10 px-5 text-sm",
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-7 w-7 p-0",
        "icon-lg": "h-10 w-10 p-0",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export type LabButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof labButton> & {
    asChild?: boolean;
    loading?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, LabButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...rest }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    const content = loading ? (
      <>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {children}
      </>
    ) : (
      children
    );
    return (
      <Comp
        ref={ref}
        className={cn(labButton({ variant, size }), className)}
        disabled={disabled || loading}
        {...rest}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = "LabButton";
