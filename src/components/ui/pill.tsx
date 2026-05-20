import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
  {
    variants: {
      variant: {
        default: "border-black/10 bg-white/40 text-beige900",
        muted:
          "border-transparent bg-beige900/[0.04] text-beige900/55 hover:bg-beige900/[0.07] hover:text-beige900",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  }
);

export interface PillProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {
  asChild?: boolean;
}

const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ asChild = false, variant, size, className, ...props }, ref) => {
    const Comp = asChild ? Slot : "span";

    return (
      <Comp
        ref={ref}
        className={cn(pillVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Pill.displayName = "Pill";

type PillLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> &
  VariantProps<typeof pillVariants>;

const PillLink = React.forwardRef<HTMLAnchorElement, PillLinkProps>(
  ({ className, variant, size, target = "_blank", rel, ...props }, ref) => (
    <Pill asChild variant={variant} size={size} className={className}>
      <a
        ref={ref}
        target={target}
        rel={rel ?? (target === "_blank" ? "noreferrer" : undefined)}
        {...props}
      />
    </Pill>
  )
);
PillLink.displayName = "PillLink";

export { Pill, PillLink, pillVariants };
