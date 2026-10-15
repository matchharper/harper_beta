import Image from "next/image";
import { BareButton } from "@/components/ui/button";
import { Tooltips } from "@/components/ui/tooltip";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  companyPresentationFinalFitLabel,
  type OrgCompanyCriteriaEvaluation,
} from "@/lib/org/companyCriteriaEvaluations";

export function OrgCriteriaEvaluation({
  evaluation,
  onClick,
}: {
  evaluation: OrgCompanyCriteriaEvaluation;
  onClick?: () => void;
}) {
  const { locale } = useOrgLocale();
  const fitnessLabel = companyPresentationFinalFitLabel(
    evaluation.fitness === "bad" ? "unfit" : evaluation.fitness,
    locale
  );

  return (
    <Tooltips text={evaluation.content}>
      <BareButton
        aria-label={`${evaluation.name} · ${fitnessLabel}`}
        className="pointer-events-auto inline-flex min-w-0 max-w-full items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
        onClick={onClick}
        type="button"
      >
        <Image
          alt=""
          aria-hidden="true"
          className="size-4 shrink-0"
          height={16}
          src={`/svgs/${evaluation.fitness}.svg`}
          width={16}
        />
        <span className="line-clamp-2 min-w-0 whitespace-normal text-[12px] font-medium leading-4 text-neutral-primary">
          {evaluation.name}
        </span>
      </BareButton>
    </Tooltips>
  );
}
