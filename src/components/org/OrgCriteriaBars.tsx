import { ResponsiveLightTooltip } from "@/components/ui/tooltip";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  companyPresentationFinalFitLabel,
  type OrgCompanyCriteriaEvaluation,
} from "@/lib/org/companyCriteriaEvaluations";
import { cn } from "@/lib/utils";

const colors = {
  excellent: "bg-positive-strong",
  good: "bg-positive/65",
  uncertain: "bg-info/65",
  bad: "bg-critical/65",
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
      aria-label={c("평가 기준별 적합도", "Fit by criteria")}
      className="flex flex-wrap gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {Array.from({ length: 6 }, (_, index) => {
        const evaluation = evaluations[index];
        const fit = evaluation
          ? companyPresentationFinalFitLabel(
              evaluation.fitness === "bad" ? "unfit" : evaluation.fitness,
              locale
            )
          : c("평가 없음", "Not evaluated");
        return (
          <ResponsiveLightTooltip
            key={index}
            className="w-auto"
            triggerClassName="w-auto rounded-sm focus-visible:ring-2 focus-visible:ring-neutral-400"
            mobileAriaLabel={evaluation ? `${evaluation.name} · ${fit}` : fit}
            trigger={
              <span
                aria-label={evaluation ? `${evaluation.name} · ${fit}` : fit}
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
                <div className="mt-1 text-neutral-muted">{fit}</div>
                <p className="mt-2">{evaluation.content}</p>
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
