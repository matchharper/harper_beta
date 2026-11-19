import { memo } from "react";
import { Check, Circle, LoaderCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useCareerT } from "@/i18n/useCareerT";
import type { CareerTurnPlanItem } from "@/lib/career/turnPlan";

/** Harper's checklist for the current reply. Harper writes and advances every row. */
export const CareerTurnPlan = memo(function CareerTurnPlan({ items, active }: {
  items: CareerTurnPlanItem[];
  active: boolean;
}) {
  const t = useCareerT();
  if (!items.length) return null;
  return (
    <Card className="px-4 py-3 shadow-none">
      <ul className="flex flex-col gap-2">
        {items.map(item => {
          const done = item.status === "done";
          const running = item.status === "in_progress" && active;
          return (
            <li key={item.id} className="flex items-start gap-2.5" aria-current={running ? "step" : undefined}>
              <span aria-hidden className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                {done ? (
                  <span className="flex size-4 items-center justify-center rounded-full bg-action text-white">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                ) : running ? (
                  <LoaderCircle className="size-4 animate-spin text-neutral-primary motion-reduce:animate-none" />
                ) : (
                  <Circle className="size-4 text-neutral-soft" />
                )}
              </span>
              <span className={`min-w-0 text-sm leading-5 break-keep [overflow-wrap:anywhere] ${done
                ? "text-neutral-muted line-through decoration-neutral-soft"
                : running ? "font-medium text-neutral-primary" : "text-neutral-secondary"}`}>
                {item.text}
                {(done || running) && <span className="sr-only">
                  {` (${done ? t("career.resources.work_completed", "완료") : t("career.resources.work_active", "진행 중")})`}
                </span>}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
});
