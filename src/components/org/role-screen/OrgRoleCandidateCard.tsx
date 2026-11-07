import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import {
  createContext,
  useContext,
  useId,
  useState,
  type ComponentProps,
} from "react";
import { CareerAnimatedRegion } from "@/components/career/CareerAnimatedRegion";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { MuteButton } from "@/components/ui/button";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgTalentDetail } from "@/hooks/org/useOrg";
import { useOrgCandidateSave } from "@/hooks/org/useOrgCandidateSave";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { isOrgCandidateProfilePreview } from "@/lib/org/candidatePreview";
import { getOrgCandidateCardDate } from "@/lib/org/candidateCardDate";
import {
  humanizeOrgCompanyIntroStatus,
  isOrgInboxStage,
} from "@/lib/org/pipelineStage";
import type { OrgBoardItem } from "@/lib/org/server";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import { cn } from "@/lib/utils";
import { OrgAcceptIntroButton } from "../OrgAcceptIntroButton";
import {
  formatOrgUpcomingMeetingTime,
  OrgCandidateStageMenu,
} from "../OrgCandidateCard";
import { OrgCriteriaEvaluation, OrgCriterionFitIcon } from "../OrgCriteriaEvaluation";
import {
  companyCriterionFitnessLabel,
  type OrgCompanyCriteriaEvaluation,
} from "@/lib/org/companyCriteriaEvaluations";
import { OrgPassPopover } from "../OrgPassPopover";
import type { OrgRoleTalentBoardCard } from "../OrgRoleTalentBoard";
import {
  MarkdownProfile,
  OrgCriteriaLegend,
  orgCandidateSummary,
} from "../OrgTalentProfile";

/**
 * One mark per criterion (◎ ○ △ ✕) beside the name, in the order of 확인할 기준,
 * so candidates compare at a glance. The same row, size and place whether the
 * card is open or closed; the name and fit show on hover.
 */
function CandidateCriteriaMarks({
  evaluations,
}: {
  evaluations: OrgCompanyCriteriaEvaluation[] | null | undefined;
}) {
  const { locale } = useOrgLocale();
  if (!evaluations?.length) return null;
  return (
    <span aria-hidden="true" className="org-candidate-marks">
      {evaluations.map((evaluation, index) => (
        <span
          key={`${evaluation.name}:${index}`}
          title={`${evaluation.name} · ${companyCriterionFitnessLabel(evaluation.fitness, locale)}`}
        >
          <OrgCriterionFitIcon className="size-3.5" fitness={evaluation.fitness} />
        </span>
      ))}
    </span>
  );
}

type CandidateSummaryDetail = Parameters<typeof orgCandidateSummary>[0];

type OrgRoleCandidateCardProps = ComponentProps<typeof OrgRoleTalentBoardCard> & {
  /**
   * Given for people outside Harper: their summary comes from it instead of a
   * profile read, and they cannot be saved (no recommendation to save).
   */
  profileDetail?: CandidateSummaryDetail;
};

/** One open card per list, and the way to ask Harper about a candidate. */
export const OrgCandidateListContext = createContext<{
  expandedId: string | null;
  onAskHarper?: (item: OrgBoardItem) => void;
  onToggle: (recommendationId: string) => void;
} | null>(null);

const sectionTitle = "text-[13px] font-normal text-neutral-primary";

function experienceTitle(item: OrgBoardItem) {
  const latest = item.talent.recentCompanies[0];
  if (!latest) return item.talent.headline;
  const company = latest.label.trim();
  const role = latest.detail?.trim();
  if (role && company && role !== company) return `${role} at ${company}`;
  return role || company || item.talent.headline;
}

/** 한 줄 요약, Harper 메모, 확인할 기준: the same order as the full profile. */
function CandidateSummary({ item }: { item: OrgBoardItem }) {
  const { workspace } = useOrgWorkspace();
  const detailQuery = useOrgTalentDetail({
    recommendationId: item.recommendationId,
    roleId: item.roleId,
    talentId: item.talentId,
    workspaceId: workspace.workspaceId,
  });
  const detail =
    detailQuery.data && !isOrgCandidateProfilePreview(detailQuery.data)
      ? detailQuery.data
      : null;
  if (detailQuery.isLoading && !detail) {
    return (
      <div aria-busy="true" className="space-y-2" role="status">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  // Without the detail, the list item still has the proposal text and criteria.
  return (
    <CandidateSummaryBody
      {...(detail
        ? orgCandidateSummary(detail)
        : {
            criteriaEvaluations: item.criteriaEvaluations,
            harperNote: item.companyIntro?.harperNote?.trim() ?? "",
            tldr: item.companyIntro?.tldr?.trim() ?? "",
          })}
    />
  );
}

function CandidateSummaryBody({
  criteriaEvaluations,
  harperNote,
  tldr,
}: ReturnType<typeof orgCandidateSummary>) {
  const { c } = useOrgLocale();
  return (
    <>
      {tldr ? (
        <section className="career-opportunity-detail-section">
          <h4 className={sectionTitle}>{ct(c, COMPANY_TERMS.detail.summary)}</h4>
          <p className="break-keep text-[14px] leading-[22px] text-neutral-primary">
            {tldr}
          </p>
        </section>
      ) : null}
      {harperNote ? (
        <section className="career-opportunity-detail-section">
          <h4 className={sectionTitle}>
            {ct(c, COMPANY_TERMS.detail.harperNote)}
          </h4>
          <MarkdownProfile value={harperNote} />
        </section>
      ) : null}
      {criteriaEvaluations.length > 0 ? (
        <section className="career-opportunity-detail-section">
          <h4 className={sectionTitle}>{ct(c, COMPANY_TERMS.criteria.section)}</h4>
          <OrgCriteriaLegend />
          <div className="grid gap-4">
            {criteriaEvaluations.map((evaluation, index) => (
              <OrgCriteriaEvaluation
                evaluation={evaluation}
                key={`${evaluation.name}:${index}`}
                showContent
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/**
 * A candidate in the role screen's 후보 lists, in the candidate side's
 * opportunity card style: a quiet row that opens in place to 한 줄 요약,
 * Harper 메모 and 확인할 기준, then the decision buttons with their captions.
 * The callbacks are OrgRoleTalentBoard's, so every decision runs as before.
 */
export function OrgRoleCandidateCard({
  acceptSlot,
  canManageCandidates = false,
  footer,
  internalOpsAccess = false,
  item,
  onAccept,
  onMove,
  onOpen,
  onPass,
  onReject,
  pending = false,
  profileDetail,
  stages,
}: OrgRoleCandidateCardProps) {
  const { c, locale } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const { workspace } = useOrgWorkspace();
  const list = useContext(OrgCandidateListContext);
  const [localOpen, setLocalOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const saveCandidate = useOrgCandidateSave();
  const contentId = useId();
  const expanded = list ? list.expandedId === item.recommendationId : localOpen;
  const toggle = () =>
    list ? list.onToggle(item.recommendationId) : setLocalOpen((open) => !open);
  const name = item.talent.name || item.talent.email || c("이름 없음", "No name");
  const title = experienceTitle(item);
  const cardDate = getOrgCandidateCardDate(item);
  const isDecisionStage =
    item.stage === "pending_connection" ||
    (item.source === "company_intro" && item.companyIntro?.status === "ready");
  const introStatus = item.companyIntro
    ? sourceT(humanizeOrgCompanyIntroStatus(item.companyIntro))
    : "";
  const meta = [
    item.talent.location,
    item.upcomingMeeting
      ? `${formatOrgUpcomingMeetingTime(item.upcomingMeeting.startAt, locale)} ${c("인터뷰 예정", "Interview scheduled")}`
      : null,
    item.processClosureNoticeUnresolved
      ? c("진행 종료 안내됨", "Hiring ended · candidate notified")
      : null,
    introStatus || null,
  ].filter(Boolean);
  const canSave = canManageCandidates && isOrgInboxStage(item.stage) && !profileDetail;
  const criteriaSummary = (item.criteriaEvaluations ?? [])
    .map((evaluation) => `${evaluation.name} ${companyCriterionFitnessLabel(evaluation.fitness, locale)}`)
    .join(", ");

  return (
    <article
      className={cn(
        "career-opportunity-card org-candidate-card group relative rounded-opportunity border-(length:--opportunity-border-width) border-opportunity-border text-opportunity-foreground transition-colors",
        expanded
          ? "bg-opportunity-expanded bg-opportunity-image shadow-(--shadow-opportunity) backdrop-blur-opportunity"
          : "bg-opportunity"
      )}
      data-candidate-id={item.recommendationId}
      data-expanded={expanded}
    >
      <ClickablePanel
        aria-controls={contentId}
        aria-expanded={expanded}
        aria-label={[name, title, criteriaSummary].filter(Boolean).join(" · ")}
        className="career-opportunity-header min-w-0 cursor-pointer"
        onActivate={toggle}
      >
        <div className="relative flex min-w-0 items-center gap-2">
          <div className="career-opportunity-heading">
            <div className="career-opportunity-company">
              <span
                aria-hidden="true"
                className="career-opportunity-logo bg-bg-weak text-[11px] text-neutral-muted"
              >
                {name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 wrap-break-word">{name}</span>
              <CandidateCriteriaMarks evaluations={item.criteriaEvaluations} />
            </div>
            <time
              className="career-opportunity-type"
              dateTime={cardDate ?? undefined}
            >
              {formatKstRelativeDate(cardDate, { locale })}
            </time>
            {title ? (
              <span className="career-opportunity-role">
                <span className="career-opportunity-title">{title}</span>
              </span>
            ) : null}
          </div>
          <ChevronRight
            aria-hidden
            className={cn(
              "career-opportunity-chevron size-3.5 shrink-0 text-neutral-soft transition-transform",
              expanded && "rotate-90"
            )}
          />
        </div>
        {meta.length ? (
          <div className="career-opportunity-footer">
            <span className="career-opportunity-meta">{meta.join(" · ")}</span>
          </div>
        ) : null}
      </ClickablePanel>
      <CareerAnimatedRegion open={expanded}>
        <div className="career-opportunity-content space-y-6" id={contentId}>
          {profileDetail ? (
            <CandidateSummaryBody {...orgCandidateSummary(profileDetail)} />
          ) : (
            <CandidateSummary item={item} />
          )}
          {footer ? <div>{footer}</div> : null}
          {canManageCandidates && isDecisionStage ? (
            <div className="grid grid-cols-[minmax(108px,auto)_minmax(0,1fr)] gap-2">
              {item.source === "company_intro" ? (
                <OrgPassPopover
                  onOpenChange={setPassOpen}
                  onSubmit={async (reason) => {
                    await onPass?.(reason);
                  }}
                  open={passOpen}
                  pending={pending}
                  shortcut={false}
                />
              ) : (
                <MuteButton
                  className="py-2 whitespace-nowrap"
                  disabled={pending}
                  onClick={onReject}
                  size="md"
                  variant="neutral"
                >
                  {ct(c, COMPANY_TERMS.action.pass)}
                </MuteButton>
              )}
              {acceptSlot !== undefined ? (
                acceptSlot
              ) : item.source === "company_intro" ? (
                <MuteButton
                  className="w-full py-2"
                  disabled={pending}
                  onClick={onAccept}
                  size="md"
                  variant="dark"
                >
                  {ct(c, COMPANY_TERMS.action.request)}
                  <ArrowRight className="size-4" />
                </MuteButton>
              ) : (
                <OrgAcceptIntroButton
                  className="w-full py-2"
                  disabled={pending}
                  onClick={onAccept}
                  size="md"
                />
              )}
              {acceptSlot === undefined ? (
                <p className="col-span-2 text-right text-[11px] leading-4 text-neutral-muted">
                  {item.source === "company_intro"
                    ? ct(c, COMPANY_TERMS.caption.requestUsesIntro)
                    : ct(c, COMPANY_TERMS.caption.connectUsesIntro)}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1">
            {canSave ? (
              <MuteButton
                aria-pressed={Boolean(item.savedAt)}
                disabled={saveCandidate.isPending}
                onClick={() =>
                  saveCandidate.mutate({
                    recommendationId: item.recommendationId,
                    roleId: item.roleId,
                    saved: !item.savedAt,
                    talentId: item.talentId,
                    workspaceId: workspace.workspaceId,
                  })
                }
                size="sm"
                variant="transparent"
              >
                {item.savedAt ? (
                  <BookmarkCheck aria-hidden className="size-4" />
                ) : (
                  <Bookmark aria-hidden className="size-4" />
                )}
                {item.savedAt
                  ? c("저장 해제", "Unsave")
                  : ct(c, COMPANY_TERMS.action.save)}
              </MuteButton>
            ) : null}
            {!isDecisionStage &&
            item.capabilities.moveStage &&
            canManageCandidates &&
            onMove ? (
              <OrgCandidateStageMenu
                internalOpsAccess={internalOpsAccess}
                item={item}
                onMove={onMove}
                pending={pending}
                stages={stages}
              />
            ) : null}
            <MuteButton onClick={onOpen} size="sm" variant="transparent">
              {c("전체 프로필", "Full profile")}
              <ArrowUpRight aria-hidden className="size-4" />
            </MuteButton>
            {list?.onAskHarper ? (
              <MuteButton
                onClick={() => list.onAskHarper?.(item)}
                size="sm"
                variant="transparent"
              >
                <MessageSquare aria-hidden className="size-4" />
                {c("Harper에게 묻기", "Ask Harper")}
              </MuteButton>
            ) : null}
          </div>
          {saveCandidate.error instanceof Error ? (
            <p className="text-[12px] text-critical" role="alert">
              {saveCandidate.error.message}
            </p>
          ) : null}
        </div>
      </CareerAnimatedRegion>
    </article>
  );
}
