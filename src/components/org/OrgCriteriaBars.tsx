import { ResponsiveLightTooltip } from "@/components/ui/tooltip";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  companyCriterionFitnessLabel,
  companyCriterionScoreLabel,
  companyCriterionScoreExplanation,
  type OrgCompanyCriteriaEvaluation,
} from "@/lib/org/companyCriteriaEvaluations";
import { cn } from "@/lib/utils";

const colors = {
  excellent: "bg-positive-strong",
  good: "bg-positive/65",
  uncertain: "bg-info/65",
  bad: "bg-critical/65",
  limited: "bg-info/65",
  conflict: "bg-critical/65",
};

/** The compact inbox summary uses six slots; full evidence remains in the profile. */
export function OrgCriteriaBars({
  evaluations,
}: {
  evaluations: OrgCompanyCriteriaEvaluation[];
}) {
  const { c, locale } = useOrgLocale();
  return (
    <div
      aria-label={c("평가 기준별 적합도", "Fit by criterion")}
      className="flex shrink-0 gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {Array.from({ length: 6 }, (_, index) => {
        const evaluation = evaluations[index];
        const fit = evaluation
          ? companyCriterionFitnessLabel(
              evaluation.fitness,
              locale
            )
          : c("평가 없음", "Not evaluated");
        const scoreLabel = companyCriterionScoreLabel(evaluation?.score);
        const label = evaluation
          ? [evaluation.name, fit, scoreLabel].filter(Boolean).join(" · ")
          : fit;
        return (
          <ResponsiveLightTooltip
            key={index}
            className="w-auto"
            triggerClassName="w-auto shrink-0 rounded-sm focus-visible:ring-2 focus-visible:ring-neutral-400"
            mobileAriaLabel={label}
            trigger={
              <span
                aria-label={label}
                className={cn(
                  "block h-[30px] w-[9px] rounded-[2px]",
                  evaluation
                    ? colors[evaluation.fitness]
                    : "bg-neutral-1000-a05"
                )}
              />
            }
            contentClassName="max-w-72 p-3"
          >
            {evaluation ? (
              <>
                <div className="font-medium">{evaluation.name}</div>
                <div className="mt-1 text-neutral-muted">
                  {fit}{scoreLabel ? ` · ${scoreLabel}` : ""}
                </div>
                <p className="mt-2">{evaluation.content}</p>
                {scoreLabel ? (
                  <p className="mt-3 text-neutral-muted">
                    {companyCriterionScoreExplanation(locale)}
                  </p>
                ) : null}
              </>
            ) : (
              fit
            )}
          </ResponsiveLightTooltip>
        );
      })}
    </div>
  );
}
