import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusDotTone =
  | "action"
  | "critical"
  | "info"
  | "neutral"
  | "positive"
  | "primary";

export type StatusDotSize = "md" | "sm";

const toneClassNames: Record<StatusDotTone, string> = {
  action: "bg-action",
  critical: "bg-critical",
  info: "bg-info",
  neutral: "bg-neutral-500",
  positive: "bg-positive",
  primary: "bg-primary",
};

const sizeClassNames: Record<StatusDotSize, string> = {
  md: "size-2",
  sm: "size-1.5",
};

export interface StatusDotProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  label?: string;
  size?: StatusDotSize;
  tone: StatusDotTone;
}

export function StatusDot({
  className,
  label,
  size = "sm",
  tone,
  ...props
}: StatusDotProps) {
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cn(
        "inline-block shrink-0 rounded-full",
        sizeClassNames[size],
        toneClassNames[tone],
        className
      )}
      role={label ? "img" : undefined}
      {...props}
    />
  );
}
