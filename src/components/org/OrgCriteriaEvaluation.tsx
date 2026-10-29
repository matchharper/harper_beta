import { Circle, LoaderCircle, X, type LucideProps } from "lucide-react";
import { BareButton } from "@/components/ui/button";
import { Tooltips } from "@/components/ui/tooltip";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { CHANGED_CRITERION_NOTE } from "@/lib/companyFirstSearch/presentation";
import {
  companyCriterionFitnessLabel,
  type OrgCompanyCriteriaEvaluation,
} from "@/lib/org/companyCriteriaEvaluations";

/** ◎: a circle inside a circle, drawn on the same 24px grid as lucide. */
function DoubleCircle(props: LucideProps) {
  const { strokeWidth = 2, ...rest } = props;
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      {...rest}
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
    </svg>
  );
}

/** △ */
function Triangle(props: LucideProps) {
  const { strokeWidth = 2, ...rest } = props;
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      {...rest}
    >
      <path d="M12 4 21 19.5H3Z" />
    </svg>
  );
}

const FIT_ICON = {
  excellent: { Icon: DoubleCircle, tone: "text-positive-strong" },
  good: { Icon: Circle, tone: "text-positive" },
  uncertain: { Icon: Triangle, tone: "text-info-strong" },
  limited: { Icon: Triangle, tone: "text-info-strong" },
  bad: { Icon: X, tone: "text-critical" },
  conflict: { Icon: X, tone: "text-critical" },
} as const;

/** The mark for one criterion's fit, shared by every company-side screen. */
export function OrgCriterionFitIcon({
  className = "size-5",
  fitness,
}: {
  className?: string;
  fitness: OrgCompanyCriteriaEvaluation["fitness"];
}) {
  const { Icon, tone } = FIT_ICON[fitness];
  return (
    <Icon
      aria-hidden="true"
      className={`${className} ${tone} shrink-0`}
      strokeWidth={2}
    />
  );
}

export function OrgCriteriaEvaluation({
  evaluation,
  onClick,
  showContent = false,
}: {
  evaluation: OrgCompanyCriteriaEvaluation;
  onClick?: () => void;
  showContent?: boolean;
}) {
  const { locale } = useOrgLocale();
  const fitnessLabel = companyCriterionFitnessLabel(evaluation.fitness, locale);
  const label = [evaluation.name, fitnessLabel].filter(Boolean).join(" · ");
  const content =
    evaluation.content === CHANGED_CRITERION_NOTE && locale !== "ko"
      ? "The criterion changed and has not been checked again yet."
      : evaluation.content;

  if (evaluation.pending) {
    return (
      <span
        className="inline-flex min-w-0 max-w-full items-center gap-2"
        role="status"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin text-neutral-soft"
        />
        <span className="line-clamp-2 min-w-0 text-[12px] font-medium leading-4 text-neutral-primary">
          {evaluation.name}
        </span>
        <span className="shrink-0 text-[12px] leading-4 text-neutral-soft">
          {locale === "ko" ? "다시 보는 중" : "Reviewing again"}
        </span>
      </span>
    );
  }

  const indicator = (
    <>
      <OrgCriterionFitIcon fitness={evaluation.fitness} />
      <span
        className={`min-w-0 text-[15px] font-medium text-neutral-primary leading-5 truncate`}
      >
        {evaluation.name}
      </span>
    </>
  );

  if (showContent) {
    return (
      <div className="min-w-0 space-y-2">
        <div className="flex items-start gap-2">
          {indicator}
          <span className="sr-only">{fitnessLabel}</span>
        </div>
        {content ? (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] font-normal text-neutral-800">
            {content}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Tooltips text={content}>
      <BareButton
        aria-label={label}
        className="pointer-events-auto inline-flex min-w-0 max-w-full items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
        onClick={onClick}
        type="button"
      >
        {indicator}
      </BareButton>
    </Tooltips>
  );
}
