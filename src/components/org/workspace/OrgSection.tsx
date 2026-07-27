import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function OrgSection({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "border-b border-neutral-1000-a05 pb-8 last:border-b-0",
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function OrgSectionHeader({
  actions,
  className,
  description,
  title,
}: {
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[16px] font-medium text-neutral-primary">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-[14px] font-light leading-5 text-neutral-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
