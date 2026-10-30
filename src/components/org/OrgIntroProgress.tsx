import { useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { humanizeOrgCompanyIntroStatus } from "@/lib/org/pipelineStage";
import { cn } from "@/lib/utils";

/**
 * Where an Intro request stands inside 연결 제안한 후보, in the same words
 * and colors as the card: preparing, waiting for the candidate, connecting.
 */
export function OrgIntroProgress({
  intro,
}: {
  intro:
    | {
        candidateSentAt?: string | null;
        status: string;
      }
    | null
    | undefined;
}) {
  const sourceT = useOrgSourceT();
  if (
    !intro ||
    (intro.status !== "awaiting_talent" && intro.status !== "connecting")
  ) {
    return null;
  }
  return (
    <span
      className={cn(
        "inline-block rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-4",
        intro.status === "connecting"
          ? "bg-positive-faded text-positive"
          : "bg-primary-faded text-primary"
      )}
    >
      {sourceT(humanizeOrgCompanyIntroStatus(intro))}
    </span>
  );
}
