import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

const HATCH_BACKGROUND =
  "repeating-linear-gradient(135deg, transparent 0, transparent 5px, rgba(0, 0, 0, 0.05) 5px, rgba(0, 0, 0, 0.05) 6px)";

export function InternalOnlyHatch({
  className,
}: {
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 z-10", className)}
      style={{ backgroundImage: HATCH_BACKGROUND }}
    />
  );
}

export function InternalOnlySurface({
  children,
  className,
  label = "Harper 내부 전용 · 회사 사용자에게 숨김",
  showLabel = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  label?: string;
  showLabel?: boolean;
}) {
  return (
    <div
      {...props}
      className={cn("relative isolate overflow-hidden", className)}
    >
      <InternalOnlyHatch />
      {showLabel ? (
        <span className="pointer-events-none absolute right-3 top-3 z-20 rounded-sm bg-neutral-1000 px-2 py-1 text-[10px] font-medium text-neutral-00 shadow-sm">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}
