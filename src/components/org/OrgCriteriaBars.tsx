import { LoaderCircle } from "lucide-react";
import { ResponsiveLightTooltip } from "@/components/ui/tooltip";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  companyCriterionFitnessLabel,
  companyCriterionScoreLabel,
  type OrgCompanyCriteriaEvaluation,
} from "@/lib/org/companyCriteriaEvaluations";
import { OrgCriterionFitIcon } from "./OrgCriteriaEvaluation";

/**
 * One fit mark per criterion, the same marks as the list and the profile.
 * Full evidence stays in the profile.
 */
export function OrgCriteriaBars({
  evaluations,
}: {
  evaluations: OrgCompanyCriteriaEvaluation[];
}) {
  const { c, locale } = useOrgLocale();
  return (
    <div
      aria-label={c("평가 기준별 적합도", "Fit by criterion")}
      className="flex shrink-0 items-center gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {evaluations.map((evaluation, index) => {
        const fit = companyCriterionFitnessLabel(evaluation.fitness, locale);
        const scoreLabel = companyCriterionScoreLabel(evaluation.score);
        const label = [evaluation.name, fit, scoreLabel]
          .filter(Boolean)
          .join(" · ");
        return (
          <ResponsiveLightTooltip
            key={`${evaluation.name}:${index}`}
            className="w-auto"
            triggerClassName="w-auto shrink-0 rounded-sm focus-visible:ring-2 focus-visible:ring-neutral-400"
            mobileAriaLabel={label}
            trigger={
              <span
                aria-label={label}
                className="inline-flex size-7 items-center justify-center rounded-md border border-neutral-1000-a05 bg-bg-weak"
              >
                {evaluation.pending ? (
                  <LoaderCircle
                    aria-hidden
                    className="size-4 animate-spin text-neutral-soft"
                  />
                ) : (
                  <OrgCriterionFitIcon
                    className="size-4"
                    fitness={evaluation.fitness}
                  />
                )}
              </span>
            }
            contentClassName="max-w-72 p-3"
          >
            <div className="font-medium">{evaluation.name}</div>
            <div className="mt-1 text-neutral-muted">
              {fit}
              {scoreLabel ? ` · ${scoreLabel}` : ""}
            </div>
            <p className="mt-2">{evaluation.content}</p>
          </ResponsiveLightTooltip>
        );
      })}
    </div>
  );
}
