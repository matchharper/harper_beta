"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, X } from "lucide-react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        solid: "bg-bg-weak text-neutral-primary",
        faded: "bg-bg-weak text-neutral-primary",
        outline:
          "border border-neutral-1000-a10 bg-transparent text-neutral-primary",
        subtle:
          "border border-transparent bg-bg-floating text-neutral-muted hover:bg-bg-weak hover:text-neutral-primary",
        inverse: "bg-black text-neutral-00",
      },
      tone: {
        neutral: "",
        primary: "",
        critical: "",
        positive: "",
        warning: "",
      },
      size: {
        sm: "h-5 gap-1 px-1.5 text-[11px] leading-4 [&_svg]:size-3",
        md: "h-6 gap-1.5 px-2 text-[12px] leading-4 [&_svg]:size-3.5",
        lg: "h-7 gap-1.5 px-2.5 text-[13px] leading-[18px] [&_svg]:size-4",
      },
      radius: {
        md: "rounded-md",
        full: "rounded-full",
      },
    },
    compoundVariants: [
      {
        tone: "primary",
        variant: "solid",
        className: "bg-black text-neutral-00",
      },
      {
        tone: "primary",
        variant: "faded",
        className: "bg-accent-200 text-primary",
      },
      {
        tone: "primary",
        variant: "outline",
        className: "border-accent-200 text-primary",
      },
      {
        tone: "critical",
        variant: "solid",
        className: "bg-critical text-white",
      },
      {
        tone: "critical",
        variant: "faded",
        className: "bg-critical-faded text-critical",
      },
      {
        tone: "critical",
        variant: "outline",
        className: "border-critical/30 text-critical",
      },
      {
        tone: "positive",
        variant: "solid",
        className: "bg-positive text-white",
      },
      {
        tone: "positive",
        variant: "faded",
        className: "bg-positive-faded text-positive",
      },
      {
        tone: "positive",
        variant: "outline",
        className: "border-positive/30 text-positive",
      },
      {
        tone: "warning",
        variant: "solid",
        className: "bg-info text-white",
      },
      {
        tone: "warning",
        variant: "faded",
        className: "bg-info-faded text-info",
      },
      {
        tone: "warning",
        variant: "outline",
        className: "border-info/30 text-info",
      },
    ],
    defaultVariants: {
      radius: "md",
      size: "md",
      tone: "neutral",
      variant: "solid",
    },
  }
);

type BadgeSize = "sm" | "md" | "lg" | "small" | "medium" | "large";
type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    Omit<VariantProps<typeof badgeVariants>, "size" | "tone"> {
  asChild?: boolean;
  color?: BadgeTone;
  dismissible?: boolean;
  empty?: boolean;
  endIcon?: React.ReactNode;
  highlighted?: boolean;
  icon?: React.ReactNode;
  onDismiss?: () => void;
  size?: BadgeSize;
  tone?: BadgeTone;
}

const emptySizeClassNames = {
  sm: "size-2 p-0",
  md: "size-3 p-0",
  lg: "size-3.5 p-0",
} as const;

function normalizeBadgeSize(size: BadgeSize | null | undefined) {
  if (size === "small") return "sm";
  if (size === "large") return "lg";
  return size === "medium" || !size ? "md" : size;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      asChild = false,
      children,
      className,
      color,
      dismissible = false,
      empty = false,
      endIcon,
      highlighted = false,
      icon,
      onDismiss,
      radius,
      size = "md",
      tone,
      variant,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "span";
    const resolvedSize = normalizeBadgeSize(size);
    const resolvedTone = tone ?? color ?? "neutral";

    return (
      <Comp
        ref={ref}
        className={cn(
          badgeVariants({
            radius,
            size: resolvedSize,
            tone: resolvedTone,
            variant,
          }),
          empty && emptySizeClassNames[resolvedSize],
          highlighted && "ring-2 ring-neutral-1000-a10",
          className
        )}
        {...props}
      >
        {empty ? null : (
          <>
            {icon}
            {children ? <span>{children}</span> : null}
            {endIcon}
            {dismissible ? (
              <button
                aria-label="Dismiss"
                className="-mr-1 inline-flex size-4 items-center justify-center rounded-full hover:bg-black-a10"
                type="button"
                onClick={onDismiss}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </>
        )}
      </Comp>
    );
  }
);
Badge.displayName = "Badge";

type BadgeLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> &
  VariantProps<typeof badgeVariants>;

const BadgeLink = React.forwardRef<HTMLAnchorElement, BadgeLinkProps>(
  (
    {
      className,
      radius,
      size,
      target = "_blank",
      rel,
      tone,
      variant,
      ...props
    },
    ref
  ) => (
    <Badge
      asChild
      radius={radius}
      size={size ?? undefined}
      tone={tone ?? undefined}
      variant={variant ?? "subtle"}
      className={className}
    >
      <a
        ref={ref}
        target={target}
        rel={rel ?? (target === "_blank" ? "noreferrer" : undefined)}
        {...props}
      />
    </Badge>
  )
);
BadgeLink.displayName = "BadgeLink";

const AttentionBadge = ({
  label,
  className,
}: {
  label: string;
  className?: string;
}) => (
  <span
    role="img"
    aria-label={label}
    className={cn(
      "pointer-events-none absolute inline-flex h-4 w-4 items-center justify-center rounded-full bg-bg-weak text-[10px] text-neutral-primary",
      className
    )}
  >
    <AlertCircle className="h-3 w-3" strokeWidth={2.7} aria-hidden="true" />
  </span>
);

export { AttentionBadge, Badge, BadgeLink, badgeVariants };
