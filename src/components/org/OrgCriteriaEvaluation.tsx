import Image from "next/image";
import { LoaderCircle } from "lucide-react";
import { BareButton } from "@/components/ui/button";
import { Tooltips } from "@/components/ui/tooltip";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { CHANGED_CRITERION_NOTE } from "@/lib/companyFirstSearch/presentation";
import {
  companyCriterionFitnessLabel,
  type OrgCompanyCriteriaEvaluation,
} from "@/lib/org/companyCriteriaEvaluations";

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
      <Image
        alt=""
        aria-hidden="true"
        className="size-5 shrink-0"
        height={16}
        src={`/svgs/${evaluation.fitness === "conflict" ? "bad" : evaluation.fitness === "limited" ? "uncertain" : evaluation.fitness}.svg`}
        width={16}
      />
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
