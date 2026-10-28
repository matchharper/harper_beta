import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { cn } from "@/lib/utils";

export type OrgProcessStep = {
  detail?: string;
  /** Shown under the step, e.g. how far it is inside that column. */
  extra?: ReactNode;
  icon: LucideIcon;
  key: string;
  label: string;
  /**
   * `now` is where the candidate is (filled), `done` a place already passed,
   * `next` one still ahead (the default).
   */
  state?: "done" | "next" | "now";
};

/**
 * The pipeline as a line: the candidate's current column filled, the columns
 * ahead outlined. Used by decision dialogs and the candidate's own profile.
 */
export function OrgProcessLine({
  label,
  steps,
}: {
  label?: string;
  steps: OrgProcessStep[];
}) {
  const { c } = useOrgLocale();
  if (steps.length < 2) return null;
  return (
    <section
      aria-label={label ?? c("이후 진행 순서", "What happens next")}
      className="pb-1"
    >
      <ol
        className="relative grid"
        style={{
          gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        }}
      >
        <span
          aria-hidden
          className="absolute left-4 top-4 h-px bg-neutral-1000-a10"
          style={{ width: `${((steps.length - 1) / steps.length) * 100}%` }}
        />
        {steps.map((step) => {
          const Icon = step.icon;
          const state = step.state ?? "next";
          return (
            <li
              aria-current={state === "now" ? "step" : undefined}
              className="relative min-w-0 pr-3"
              key={step.key}
            >
              <span
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-full border",
                  state === "now"
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : state === "done"
                      ? "border-neutral-1000-a10 bg-bg-weak text-neutral-600"
                      : "border-neutral-1000-a10 bg-bg-floating text-neutral-soft"
                )}
              >
                <Icon aria-hidden className="size-3.5" />
              </span>
              <div
                className={cn(
                  "mt-2 break-keep text-[12px] font-medium leading-4",
                  state === "next"
                    ? "text-neutral-muted"
                    : "text-neutral-primary"
                )}
              >
                {step.label}
              </div>
              {step.detail ? (
                <p className="mt-1 break-keep text-[11px] leading-4 text-neutral-muted">
                  {step.detail}
                </p>
              ) : null}
              {step.extra ? <div className="mt-1.5">{step.extra}</div> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
