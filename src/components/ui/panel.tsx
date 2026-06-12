import * as React from "react";

import { cn } from "@/lib/utils";

export const panelClassName =
  "rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-4 py-4 shadow-sm";

export const InlinePanel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => <div className={cn(panelClassName, className)}>{children}</div>;

export const FieldLabel = ({
  icon,
  label,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
}) => (
  <div className="flex flex-row items-center gap-2 text-sm text-neutral-primary">
    {icon && <span>{icon}</span>}
    <span>{label}</span>
  </div>
);

export const Field = ({
  icon,
  label,
  children,
  hint,
  className,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "flex flex-col items-start justify-start gap-3 pb-8",
      className
    )}
  >
    <div className="pt-1">
      <FieldLabel icon={icon} label={label} />
      {hint ? (
        <div className="mt-1 text-[13px] leading-5 text-neutral-muted">
          {hint}
        </div>
      ) : null}
    </div>
    <div className="w-full">{children}</div>
  </div>
);
