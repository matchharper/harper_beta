import { useOptionalOrgJobsBoard } from "@/hooks/org/useOrgJobs";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgTalentDetailResponse } from "@/lib/org/server";
import { OrgIntroProgress } from "./OrgIntroProgress";
import { OrgProcessLine, type OrgProcessStep } from "./OrgProcessLine";
import { orgStageIcon, orgStageName } from "./orgStageVisuals";

const MAX_STEPS = 6;

/**
 * One candidate's way through this Role's pipeline: the columns already
 * passed with their dates, where they are now, and the columns still ahead.
 */
export function OrgCandidateProgressLine({
  detail,
}: {
  detail: Pick<
    OrgTalentDetailResponse,
    "companyIntro" | "recommendation" | "role" | "stageHistory"
  >;
}) {
  const { c, locale } = useOrgLocale();
  const boardStages = useOptionalOrgJobsBoard()?.board?.stages ?? [];
  const roleId = detail.role.roleId;
  const roleTitle = detail.role.name ?? "";
  const stages = boardStages.filter(
    (stage) => !stage.roleId || stage.roleId === roleId
  );
  const current = detail.recommendation.stage;
  const intro = detail.companyIntro;

  const passed: Array<{ at: string | null; stage: string }> = intro
    ? [
        { at: detail.recommendation.recommendedAt, stage: "company_intro" },
        ...(intro.requestedAt
          ? [{ at: intro.requestedAt, stage: "intro_requested" }]
          : []),
      ]
    : [
        {
          at:
            detail.recommendation.candidateAcceptedAt ??
            detail.recommendation.recommendedAt,
          stage: "pending_connection",
        },
      ];
  for (const move of detail.stageHistory ?? []) {
    if (passed.at(-1)?.stage !== move.stage) passed.push(move);
  }
  if (current === "process_stopped" && passed.at(-1)?.stage !== current) {
    passed.push({ at: intro?.talentDecisionAt ?? null, stage: current });
  }
  const nowIndex = passed.map((entry) => entry.stage).lastIndexOf(current);
  if (nowIndex < 0) passed.push({ at: null, stage: current });
  const here = nowIndex < 0 ? passed.length - 1 : nowIndex;

  // Columns still ahead, in the board's order, skipping the ones passed.
  const order = [
    "intro_requested",
    "connected",
    ...stages
      .filter((stage) => stage.id.startsWith("custom:"))
      .map((stage) => stage.id),
    "final_offer",
  ];
  const ahead =
    current === "process_stopped" || current === "final_offer"
      ? []
      : order.filter(
          (stage) =>
            (intro || stage !== "intro_requested") &&
            !passed.some((entry) => entry.stage === stage) &&
            order.indexOf(stage) > order.indexOf(current)
        );

  const date = (at: string | null) =>
    at
      ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
          day: "numeric",
          month: locale === "en" ? "short" : "numeric",
          timeZone: "Asia/Seoul",
        }).format(new Date(at))
      : undefined;

  const steps: OrgProcessStep[] = [
    ...passed.map((entry, index) => ({
      detail: date(entry.at),
      icon: orgStageIcon(entry.stage),
      key: `${entry.stage}:${index}`,
      label: orgStageName(entry.stage, c, stages, roleTitle),
      state: index === here ? ("now" as const) : ("done" as const),
      // The card's bar, under the column it belongs to.
      extra:
        index === here && entry.stage === "intro_requested" ? (
          <OrgIntroProgress intro={intro} />
        ) : undefined,
    })),
    ...ahead.map((stage) => ({
      icon: orgStageIcon(stage),
      key: stage,
      label: orgStageName(stage, c, stages, roleTitle),
    })),
  ];
  // A long way shows the part around where the candidate is now.
  const start = Math.max(0, Math.min(here - 2, steps.length - MAX_STEPS));
  const shown = steps.slice(start, start + MAX_STEPS);

  return (
    <div>
      <div className="mb-2.5 text-[12px] text-neutral-muted">
        {c("채용 진행", "Hiring progress")}
      </div>
      <OrgProcessLine label={c("채용 진행", "Hiring progress")} steps={shown} />
    </div>
  );
}
