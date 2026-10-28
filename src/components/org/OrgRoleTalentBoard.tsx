import { OrgPassPopover } from "./OrgPassPopover";
import { OrgCandidateBoardCanvas } from "./OrgCandidateBoardCanvas";
import { TALENT_FIRST_CAPACITY_NOTICE } from "@/lib/org/talentFirstCapacity";
import { OrgAcceptIntroButton } from "./OrgAcceptIntroButton";
import { GraduationCap } from "lucide-react";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { localizeOrgProfilePeriod } from "@/i18n/org/profilePeriod";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  Info,
  ListFilter,
  LoaderCircle,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { StopCandidateDialog } from "@/components/org/OrgCandidateDecisionDialogs";
import { CompanyIntroRequestDialog } from "@/components/org/CompanyIntroDecisionDialogs";
import {
  getOrgCandidateDisplayName,
  formatOrgUpcomingMeetingTime,
  OrgCandidateStageMenu,
} from "@/components/org/OrgCandidateCard";
import { CardButton, MuteButton } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { Tabs } from "@/components/ui/tabs";
import { FilterChipGroup } from "@/components/ui/filter-chip-group";
import { RoleRubricEditor } from "@/components/org/role-start/RoleRubricEditor";
import type { OrgCompanyCriterionFitness } from "@/lib/org/companyCriteriaEvaluations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  compareOrgCandidates,
  type OrgCandidateSort,
} from "@/lib/org/candidateBoardSort";
import {
  humanizeOrgCompanyIntroStatus,
  isOrgInboxStage,
  ORG_STAGE_DESCRIPTIONS,
} from "@/lib/org/pipelineStage";
import {
  useOrgJobsBoard,
  useOrgJobsCandidateActions,
  useOrgJobsNavigation,
} from "@/hooks/org/useOrgJobs";
import {
  useCreateOrgReviewStage,
  usePassOrgCompanyIntro,
  useRequestOrgCompanyIntro,
} from "@/hooks/org/useOrg";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import {
  getDisplayableCompanyLogoUrl,
  getDisplayableProfileImageUrl,
} from "@/lib/imageUrl";
import { InternalOnlyHatch } from "@/components/org/internal/InternalOnlySurface";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import {
  CANDIDATE_DECISION_LABELS,
  isOrgInternalStage,
  shouldOpenOrgAcceptIntroDialog,
  shouldOpenOrgStopCandidateDialog,
} from "@/lib/org/candidateDecision";
import { cn } from "@/lib/utils";
import { suggestOrgStopReasons } from "@/lib/org/evaluationSuggestions";
import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";
import { getOrgCandidateCardDate } from "@/lib/org/candidateCardDate";
import type {
  OrgBoardItem,
  OrgRole,
  OrgStage,
  OrgStageId,
} from "@/lib/org/server";
import { ResponsiveLightTooltip } from "../ui/tooltip";
import {
  OrgCriteriaEvaluation,
  OrgCriterionFitIcon,
} from "./OrgCriteriaEvaluation";
import { useToastStore } from "@/store/useToastStore";
import { useOrgDeferredActionStore } from "@/store/useOrgDeferredActionStore";
import { useOrgCandidateDecisionRunner } from "@/hooks/org/useOrgCandidateDecisionRunner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  OrgStageMoveDialog,
  toOrgStageMoveCandidate,
} from "@/components/org/OrgStageMoveDialog";

const NO_BOARD_SELECTION: ReadonlySet<string> = new Set();

function getStageLabel(stage: OrgStage, roleName: string | null) {
  const prefix = roleName ? `${roleName} · ` : "";
  return prefix && stage.label.startsWith(prefix)
    ? stage.label.slice(prefix.length)
    : stage.label;
}

function getBoardStageLabel(
  stage: OrgStage,
  roleName: string | null,
  sourceT: (source: string) => string
) {
  const label = sourceT(getStageLabel(stage, roleName));
  if (
    stage.id !== "accepted" &&
    !isOrgInboxStage(stage.id) &&
    ORG_STAGE_DESCRIPTIONS[stage.id]
  ) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {label}
        <Info aria-hidden="true" className="size-3.5 text-neutral-soft" />
      </span>
    );
  }
  if (stage.id !== "accepted") return label;

  return (
    <span className="relative isolate overflow-hidden px-0.5">
      <InternalOnlyHatch />
      <span className="relative z-20">{label}</span>
    </span>
  );
}

function OrgRoleRecommendationStatus({
  capacityBlocked,
  roleStatus,
}: {
  capacityBlocked: boolean;
  roleStatus: OrgRole["status"];
}) {
  const { c } = useOrgLocale();
  const status = getOrgRoleStatusPresentation(roleStatus).status;
  const active = status === "active" || status === "top_priority";
  const label =
    active && capacityBlocked
      ? c("연결 결정이 필요해요", "Connection decisions needed")
      : active
        ? c("Harper가 소개하고 있어요", "Harper is introducing your role")
        : status === "paused"
          ? c("후보자 추천 중단", "Recommendations paused")
          : c("후보자 추천 종료", "Recommendations ended");

  const description =
    active && capacityBlocked
      ? c(TALENT_FIRST_CAPACITY_NOTICE.ko, TALENT_FIRST_CAPACITY_NOTICE.en)
      : active
        ? c(
            "직접 검색하거나 Intro를 요청하지 않아도, Harper가 이 역할에 맞는 후보자에게 회사와 역할을 먼저 소개해요.\n\n후보자가 역할을 수락하면 Harper가 소개를 준비해 ‘연결 수락할 후보’에 추천해 드려요.",
            "Harper introduces your company and role to suitable candidates without waiting for a search or Intro request.\n\nWhen someone agrees to talk, Harper prepares their introduction for your team to review in Ready to connect."
          )
        : status === "paused"
          ? c(
              "역할이 중단되어 새로운 후보자 추천도 쉬고 있어요. 역할을 다시 진행하면 추천도 이어집니다.",
              "New candidate recommendations are paused with this role. They'll resume when the role is active again."
            )
          : c(
              "이 역할의 채용이 종료되어 새로운 후보자를 추천하지 않아요.",
              "Hiring for this role has ended, so Harper is no longer recommending new candidates."
            );

  return (
    <ResponsiveLightTooltip
      align="end"
      className="w-auto"
      contentClassName="max-w-[min(340px,calc(100vw-32px))] bg-bg-floating px-4 py-3 text-[13px] leading-5 text-neutral-primary md:text-[13px]"
      mobileAriaLabel={label}
      side="bottom"
      trigger={
        <>
          <span
            aria-hidden="true"
            className="relative flex size-3 items-center justify-center"
          >
            {active && !capacityBlocked ? (
              <StatusDot
                className="absolute opacity-40 motion-safe:animate-ping motion-safe:[animation-duration:3s]"
                tone="positive"
              />
            ) : null}
            <StatusDot
              tone={
                active && capacityBlocked
                  ? "info"
                  : active
                    ? "positive"
                    : "neutral"
              }
            />
          </span>
          <span>{label}</span>
          {/* <Info aria-hidden="true" className="size-3 text-neutral-soft" /> */}
        </>
      }
      triggerClassName="min-h-7 shrink-0 gap-1.5 rounded-md bg-bg-weak px-2 py-1 text-[12px] font-medium leading-5 text-neutral-muted hover:text-neutral-primary"
    >
      <p className="break-keep">{description}</p>
    </ResponsiveLightTooltip>
  );
}

function BoardTalentAvatar({ item }: { item: OrgBoardItem }) {
  const { c } = useOrgLocale();
  const name =
    item.talent.name || item.talent.email || c("이름 없음", "No name");
  const profilePicture = getDisplayableProfileImageUrl(
    item.talent.profilePicture
  );
  const [failedImage, setFailedImage] = useState<string | null>(null);

  if (profilePicture && profilePicture !== failedImage) {
    return (
      <Image
        alt={c("", "")}
        className="size-9 shrink-0 rounded-full object-cover"
        height={36}
        onError={() => setFailedImage(profilePicture)}
        src={profilePicture}
        unoptimized
        width={36}
      />
    );
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[16px] font-normal text-neutral-muted">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function CompanyMark({
  label,
  logoUrl: rawLogoUrl,
}: {
  label: string;
  logoUrl?: string | null;
}) {
  const { c } = useOrgLocale();
  const logoUrl = getDisplayableCompanyLogoUrl(rawLogoUrl);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const showLogo = Boolean(logoUrl && logoUrl !== failedLogoUrl);

  return (
    <span className="relative flex size-3 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-bg-weak text-[7px] font-normal text-neutral-muted md:size-6 md:text-[10px]">
      {label.slice(0, 1).toUpperCase()}
      {showLogo && logoUrl ? (
        <Image
          alt={c("", "")}
          className="absolute inset-0 size-full rounded-sm bg-bg-floating object-contain"
          height={24}
          onError={() => setFailedLogoUrl(logoUrl)}
          src={logoUrl}
          unoptimized
          width={24}
        />
      ) : null}
    </span>
  );
}

function getExperienceTitle({
  detail,
  label,
}: OrgBoardItem["talent"]["recentCompanies"][number]) {
  const companyName = label.trim();
  const role = detail?.trim();
  if (role && companyName && role !== companyName) {
    return `${role} at ${companyName}`;
  }
  return role || companyName;
}

function formatExperienceYearPeriod(period: string) {
  return period.replace(/\b(\d{4})\.\d{1,2}\b/g, "$1");
}

function TalentProfileRow({
  company,
  education = false,
}: {
  company: OrgBoardItem["talent"]["recentCompanies"][number];
  education?: boolean;
}) {
  const { c } = useOrgLocale();
  return (
    <div className="flex min-w-0 items-center gap-1.5 md:gap-2.5 @min-[640px]/talent-board:items-start">
      {education ? (
        <span className="flex size-3 shrink-0 items-center justify-center rounded-sm bg-bg-weak text-neutral-muted md:size-6">
          <GraduationCap aria-hidden="true" className="size-3 md:size-4" />
        </span>
      ) : (
        <CompanyMark label={company.label} logoUrl={company.logoUrl} />
      )}
      <div className="flex min-w-0 flex-1 items-baseline gap-2 @min-[640px]/talent-board:block">
        <div
          className={cn(
            "shrink-0 truncate text-[13px] font-normal text-neutral-primary @min-[640px]/talent-board:max-w-none",
            education ? "max-w-[200px]" : "max-w-[100px]"
          )}
        >
          {company.label}
        </div>
        {company.detail ? (
          <div className="min-w-0 truncate text-[13px] text-neutral-muted @min-[640px]/talent-board:mt-0.5">
            {company.detail}
          </div>
        ) : null}
        {company.period ? (
          <div className="ml-auto shrink-0 whitespace-nowrap text-[12px] text-neutral-muted @min-[640px]/talent-board:ml-0 @min-[640px]/talent-board:mt-0.5">
            {formatExperienceYearPeriod(
              localizeOrgProfilePeriod(company.period, c("현재", "Present")) ??
                ""
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TalentExperienceList({ item }: { item: OrgBoardItem }) {
  const { c } = useOrgLocale();
  const [expanded, setExpanded] = useState(false);
  const recentCompanies = item.talent.recentCompanies;
  const recentSchools = item.talent.recentSchools;
  if (recentCompanies.length === 0 && recentSchools.length === 0) return null;

  return (
    <section
      aria-label={c("경력 및 학력", "Experience and education")}
      className="mt-6"
    >
      <div className="flex flex-col gap-2">
        {recentCompanies.slice(0, expanded ? undefined : 4).map((company) => (
          <TalentProfileRow
            company={company}
            key={`${company.label}:${company.detail ?? ""}:${company.period ?? ""}`}
          />
        ))}
      </div>
      {!expanded && recentCompanies.length > 4 ? (
        <MuteButton
          className="pointer-events-auto mt-2"
          size="sm"
          variant="transparent"
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
        >
          <span className="font-medium text-neutral-primary">
            {c("전체보기({count})", "View all ({count})", {
              count: recentCompanies.length - 4,
            })}
          </span>
        </MuteButton>
      ) : null}
      {recentSchools.length > 0 ? (
        <div
          className={cn(
            "flex flex-col gap-2",
            recentCompanies.length > 0 && "mt-2"
          )}
        >
          {recentSchools.slice(0, 1).map((school) => (
            <TalentProfileRow
              company={school}
              education
              key={`${school.label}:${school.detail ?? ""}:${school.period ?? ""}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function OrgRoleTalentBoardCard({
  canManageCandidates = false,
  internalOpsAccess = false,
  item,
  onAccept,
  onMove,
  onOpen,
  onReject,
  onPass,
  onSelectedChange,
  pending = false,
  selected = false,
  stages,
}: {
  canManageCandidates?: boolean;
  internalOpsAccess?: boolean;
  item: OrgBoardItem;
  onAccept?: () => void;
  onMove?: (item: OrgBoardItem, stage: OrgStageId) => void;
  onOpen: () => void;
  onReject?: () => void;
  onPass?: (reason: string) => Promise<void>;
  /** Shows the selection box used by the inbox bulk actions. */
  onSelectedChange?: (selected: boolean) => void;
  pending?: boolean;
  selected?: boolean;
  stages: OrgStage[];
}) {
  const [passOpen, setPassOpen] = useState(false);
  const sourceT = useOrgSourceT();
  const { locale, c } = useOrgLocale();
  const name =
    item.talent.name || item.talent.email || c("이름 없음", "No name");
  const isDecisionStage =
    item.stage === "pending_connection" ||
    (item.source === "company_intro" && item.companyIntro?.status === "ready");
  const showDecisionActions = canManageCandidates && isDecisionStage;
  const cardDate = getOrgCandidateCardDate(item);
  const latestExperience = item.talent.recentCompanies[0] ?? null;

  return (
    <article className="@container/talent-card relative isolate min-w-0 overflow-hidden rounded-lg">
      <CardButton
        aria-label={c("{p0} 후보자 상세 보기", "View {p0}'s details", {
          p0: name,
        })}
        className={cn(
          "absolute inset-0 z-0 h-full rounded-lg border-neutral-1000-a05 p-0 hover:border-neutral-1000-a05",
          selected &&
            "border-neutral-800 bg-neutral-200 hover:border-neutral-800"
        )}
        data-board-drag-surface=""
        onClick={onOpen}
      >
        <span className="sr-only">
          {c("{name} 후보자 상세 보기", "View {name}'s details", {
            name,
          })}
        </span>
      </CardButton>
      <div className="pointer-events-none relative z-10 p-4 sm:p-5">
        <header className="flex items-start gap-3">
          {onSelectedChange ? (
            <Checkbox
              aria-label={c("{p0} 선택", "Select {p0}", { p0: name })}
              checked={selected}
              className="pointer-events-auto mt-0.5"
              onChange={(event) => onSelectedChange(event.target.checked)}
            />
          ) : null}
          <BoardTalentAvatar item={item} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="truncate text-base font-normal tracking-[-0.02em] text-neutral-primary sm:text-[19px] sm:leading-6">
                  {name}
                </h3>
                {latestExperience ? (
                  <p className="mt-0.5 line-clamp-2 text-[12px] font-normal leading-5 text-neutral-muted sm:text-[13px]">
                    {getExperienceTitle(latestExperience)}
                  </p>
                ) : null}
                {item.talent.location ? (
                  <p className="mt-0.5 text-[12px] leading-5 text-neutral-muted">
                    {item.talent.location}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <time
                  className="pt-0.5 text-[11px] font-normal text-neutral-soft"
                  dateTime={cardDate ?? undefined}
                >
                  {formatKstRelativeDate(cardDate, { locale })}
                </time>
                {!isDecisionStage &&
                item.capabilities.moveStage &&
                canManageCandidates &&
                onMove ? (
                  <div className="pointer-events-auto">
                    <OrgCandidateStageMenu
                      internalOpsAccess={internalOpsAccess}
                      item={item}
                      onMove={onMove}
                      pending={pending}
                      stages={stages}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        {item.criteriaEvaluations.length > 0 ? (
          <section
            aria-label={c("평가 기준별 적합도", "Fit by criterion")}
            className="mt-6 grid grid-cols-1 gap-2 @sm/talent-card:grid-cols-2 @xl/talent-card:grid-cols-3"
          >
            {item.criteriaEvaluations.map((evaluation, index) => (
              <OrgCriteriaEvaluation
                evaluation={evaluation}
                key={`${evaluation.name}:${index}`}
                onClick={onOpen}
              />
            ))}
          </section>
        ) : null}

        <TalentExperienceList item={item} />

        {item.companyIntro?.status === "ready" &&
        item.companyIntro.harperRecommendation ? (
          <p className="mt-4 text-[13px] text-neutral-muted">
            {item.companyIntro.harperRecommendation.emailSentAt
              ? c(
                  "Harper가 후보자에게도 이 역할을 추천하는 메일을 보냈어요.",
                  "Harper has also emailed this role to the candidate as a recommendation."
                )
              : c(
                  "후보자의 추천함에도 이 역할이 추가되어 있어요.",
                  "This role is also available in the candidate’s recommendations."
                )}
          </p>
        ) : null}

        {item.companyIntro ? (
          <p className="mt-4 text-[13px] text-neutral-muted">
            {sourceT(humanizeOrgCompanyIntroStatus(item.companyIntro))}
          </p>
        ) : null}

        {item.processClosureNoticeUnresolved ? (
          <div className="-mx-4 mt-5 bg-critical px-4 py-1.5 text-[12px] font-medium text-neutral-00 sm:-mx-5 sm:px-5">
            {c("프로세스 종료 안내됨", "Hiring ended · candidate notified")}
          </div>
        ) : item.upcomingMeeting ? (
          <div className="-mx-4 -mb-4 mt-5 bg-positive px-4 py-1.5 text-[12px] font-medium text-neutral-00 sm:-mx-5 sm:-mb-5 sm:px-5">
            {formatOrgUpcomingMeetingTime(item.upcomingMeeting.startAt, locale)}{" "}
            {c("Interview 예정", "Interview scheduled")}
          </div>
        ) : null}

        {showDecisionActions ? (
          <div className="pointer-events-auto mt-6 grid grid-cols-[108px_minmax(0,1fr)] gap-2">
            {item.source === "company_intro" ? (
              <OrgPassPopover
                open={passOpen}
                onOpenChange={setPassOpen}
                onSubmit={async (reason) => {
                  await onPass?.(reason);
                }}
                pending={pending}
                shortcut={false}
              />
            ) : (
              <MuteButton
                disabled={pending}
                onClick={onReject}
                size="md"
                variant="neutral"
                className="py-2"
              >
                {CANDIDATE_DECISION_LABELS.reject}
              </MuteButton>
            )}
            {item.source === "company_intro" ? (
              <MuteButton
                className="w-full py-2"
                disabled={pending}
                onClick={onAccept}
                size="md"
                variant="dark"
              >
                {c("Send Intro", "Send Intro")}
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
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function OrgRoleTalentBoard({
  displayControl,
  layout = "grid",
  section = "pipeline",
  inboxItems,
  onSelectionReplace,
  onToggleSelected,
  selectedIds,
}: {
  displayControl?: ReactNode;
  /** "board" places the cards on a free-form board instead of the grid. */
  layout?: "board" | "grid";
  section?: "inbox" | "pipeline";
  inboxItems?: OrgBoardItem[];
  /** Board area selection replaces the whole selection at once. */
  onSelectionReplace?: (ids: Set<string>) => void;
  onToggleSelected?: (item: OrgBoardItem, selected: boolean) => void;
  selectedIds?: ReadonlySet<string>;
}) {
  const router = useRouter();

  const sourceT = useOrgSourceT();
  const { locale, c } = useOrgLocale();
  const { board, boardQuery } = useOrgJobsBoard();
  const {
    changeStage,
    isCandidateStagePending,
    requestCandidateReengagementBeforeStageChange,
  } = useOrgJobsCandidateActions();
  const { activeRole, selectTalent, workspaceId } = useOrgJobsNavigation();
  const { bootstrap, currentUserEmail, internalOpsAccess, permissions } =
    useOrgWorkspace();
  const members = bootstrap.members;
  const createCustomStage = useCreateOrgReviewStage();
  const requestCompanyIntro = useRequestOrgCompanyIntro();
  const passCompanyIntro = usePassOrgCompanyIntro();
  const addToast = useToastStore((state) => state.add);
  const decisions = useOrgCandidateDecisionRunner(workspaceId);
  const deferredStages = useOrgDeferredActionStore(
    (state) => state.deferredStages
  );
  const [activeStageId, setActiveStageId] = useState("");
  const [sort, setSort] = useState<OrgCandidateSort>("latest");
  const [filterOpen, setFilterOpen] = useState(false);
  const [rubricEditing, setRubricEditing] = useState(false);
  // Criterion name → grades to keep. Empty means no filter on that criterion.
  const [gradeFilters, setGradeFilters] = useState<
    Record<string, OrgCompanyCriterionFitness[]>
  >({});
  const gradeOptions = (
    ["excellent", "good", "uncertain", "bad"] as OrgCompanyCriterionFitness[]
  ).map((grade) => ({
    value: grade,
    label: (
      <span className="inline-flex items-center gap-1.5">
        <OrgCriterionFitIcon className="size-3.5" fitness={grade} />
        {grade === "excellent"
          ? c("매우 잘 맞음", "Excellent fit")
          : grade === "good"
            ? c("잘 맞음", "Good fit")
            : grade === "uncertain"
              ? c("확인 필요", "More information needed")
              : c("맞지 않음", "Not a fit")}
      </span>
    ),
  }));
  const sortOptions = [
    { value: "latest", label: c("최신순", "Newest first") },
    { value: "recommended", label: c("추천순", "Recommended") },
  ] as const;
  const sortLabel = sortOptions.find((option) => option.value === sort)!.label;
  const requestedStageId =
    section === "inbox"
      ? typeof router.query.inboxStage === "string"
        ? router.query.inboxStage
        : ""
      : activeStageId;
  // In the pipeline, 저장함 is its own tab instead of sitting above every stage.
  const showingSaved = section === "pipeline" && requestedStageId === "saved";
  const [acceptRequest, setAcceptRequest] = useState<{
    item: OrgBoardItem;
    reengagementResolution?: "company_confirmed";
    stage: OrgStageId;
  } | null>(null);
  const [stopItem, setStopItem] = useState<OrgBoardItem | null>(null);
  const [companyIntroRequest, setCompanyIntroRequest] = useState<{
    item: OrgBoardItem;
  } | null>(null);

  const visibleStages = useMemo(() => {
    const stages = (board?.stages ?? []).filter(
      (stage) =>
        isOrgInboxStage(stage.id) === (section === "inbox") &&
        (!isOrgInternalStage(stage.id) ||
          (internalOpsAccess && stage.id === "accepted"))
    );
    if (section === "inbox") {
      stages.sort(
        (left, right) =>
          Number(right.id === "pending_connection") -
          Number(left.id === "pending_connection")
      );
    }
    return stages;
  }, [board?.stages, internalOpsAccess, section]);
  const stageCounts = useMemo(() => {
    const counts = new Map<OrgStageId, number>();
    for (const item of board?.items ?? []) {
      counts.set(item.stage, (counts.get(item.stage) ?? 0) + 1);
    }
    return counts;
  }, [board?.items]);
  const defaultStageId = visibleStages[0]?.id ?? "";
  const selectedStageId = visibleStages.some(
    (stage) => stage.id === requestedStageId
  )
    ? requestedStageId
    : defaultStageId;
  const selectStage = (stageId: string) => {
    if (stageId === selectedStageId && !showingSaved) return;
    if (section !== "inbox") {
      setActiveStageId(stageId);
      return;
    }
    void router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, inboxStage: stageId },
      },
      undefined,
      { shallow: true, scroll: false }
    );
  };
  const selectedStage = visibleStages.find(
    (stage) => stage.id === selectedStageId
  );
  const savedCount = (board?.items ?? []).filter(
    (item) => item.savedAt && !deferredStages.has(item.recommendationId)
  ).length;
  // Criteria changed from the filter panel or the 매칭 기준 tab are reviewed
  // again in the background; refresh until no card shows "다시 보는 중".
  const reviewingAgain = (board?.items ?? []).some((item) =>
    item.criteriaEvaluations.some((evaluation) => evaluation.pending)
  );
  const refetchBoard = boardQuery.refetch;
  useEffect(() => {
    if (!reviewingAgain) return;
    const timer = window.setInterval(() => void refetchBoard(), 2_000);
    return () => window.clearInterval(timer);
  }, [reviewingAgain, refetchBoard]);
  const stageItems = useMemo(
    () =>
      inboxItems ??
      (board?.items ?? [])
        .filter(
          (item) =>
            (showingSaved
              ? Boolean(item.savedAt)
              : item.stage === selectedStageId && !item.savedAt) &&
            !deferredStages.has(item.recommendationId)
        )
        .sort((left, right) => compareOrgCandidates(left, right, sort)),
    [
      board?.items,
      deferredStages,
      selectedStageId,
      showingSaved,
      sort,
      inboxItems,
    ]
  );
  const criterionNames = useMemo(
    () =>
      Array.from(
        new Set(
          stageItems.flatMap((item) =>
            item.criteriaEvaluations.map((evaluation) => evaluation.name)
          )
        )
      ),
    [stageItems]
  );
  const activeGradeFilters = Object.entries(gradeFilters).filter(
    ([name, grades]) => grades.length > 0 && criterionNames.includes(name)
  );
  const items = useMemo(
    () =>
      activeGradeFilters.length
        ? stageItems.filter((item) =>
            activeGradeFilters.every(([name, grades]) => {
              const evaluation = item.criteriaEvaluations.find(
                (entry) => entry.name === name
              );
              return Boolean(
                evaluation &&
                !evaluation.pending &&
                grades.includes(evaluation.fitness)
              );
            })
          )
        : stageItems,
    [activeGradeFilters, stageItems]
  );
  const recommendationStatus =
    section === "inbox" && !inboxItems && activeRole ? (
      <OrgRoleRecommendationStatus
        capacityBlocked={
          board?.talentFirstCapacityBlockedRoleIds?.includes(
            activeRole.roleId
          ) ?? false
        }
        roleStatus={activeRole.status}
      />
    ) : null;

  const continueMove = (
    item: OrgBoardItem,
    stage: OrgStageId,
    reengagementResolution?: "company_confirmed"
  ) => {
    if (shouldOpenOrgStopCandidateDialog(item.stage, stage)) {
      setStopItem(item);
      return;
    }
    if (shouldOpenOrgAcceptIntroDialog(item.stage, stage)) {
      setAcceptRequest({ item, reengagementResolution, stage });
      return;
    }
    void Promise.resolve(
      changeStage(
        item,
        stage,
        reengagementResolution ? { reengagementResolution } : undefined
      )
    ).catch(() => undefined);
  };

  const requestMove = (item: OrgBoardItem, stage: OrgStageId) => {
    if (!permissions.canManageCandidates || item.stage === stage) return;
    if (item.source === "company_intro") {
      if (item.companyIntro?.status !== "ready") return;
      setCompanyIntroRequest({
        item,
      });
      return;
    }
    if (
      requestCandidateReengagementBeforeStageChange(item, stage, () =>
        continueMove(item, stage, "company_confirmed")
      )
    ) {
      return;
    }
    continueMove(item, stage);
  };

  if (boardQuery.isLoading) {
    return (
      <section className="@container/talent-board min-w-0">
        {recommendationStatus ? (
          <div className="flex justify-end">{recommendationStatus}</div>
        ) : null}
        <div className="flex min-h-56 items-center justify-center text-[13px] text-neutral-muted">
          <LoaderCircle className="mr-2 size-4 animate-spin" />
          {c("후보자를 불러오는 중입니다.", "Loading candidates.")}
        </div>
      </section>
    );
  }

  if (visibleStages.length === 0) {
    return (
      <section className="@container/talent-board min-w-0">
        {recommendationStatus ? (
          <div className="flex justify-end">{recommendationStatus}</div>
        ) : null}
        <div className="px-4 py-10 text-center text-[13px] text-neutral-muted">
          {c("표시할 단계가 없습니다.", "No stages to display.")}
        </div>
      </section>
    );
  }

  const renderCard = (item: OrgBoardItem) => (
    <OrgRoleTalentBoardCard
      canManageCandidates={permissions.canManageCandidates}
      internalOpsAccess={internalOpsAccess}
      item={item}
      key={item.recommendationId}
      onAccept={() =>
        item.source === "company_intro"
          ? setCompanyIntroRequest({ item })
          : requestMove(item, "connected")
      }
      onMove={requestMove}
      onOpen={() =>
        selectTalent(
          item,
          items,
          selectedStage
            ? getStageLabel(selectedStage, activeRole?.name ?? null)
            : c("후보자 보드", "Candidate board")
        )
      }
      onReject={() => requestMove(item, "process_stopped")}
      onPass={async (reason) => decisions.pass([item], reason)}
      onSelectedChange={
        onToggleSelected
          ? (selected) => onToggleSelected(item, selected)
          : undefined
      }
      pending={isCandidateStagePending(item) || passCompanyIntro.isPending}
      selected={selectedIds?.has(item.recommendationId) ?? false}
      stages={board?.stages ?? []}
    />
  );

  return (
    <section
      aria-label={c("후보자 보드", "Candidate board")}
      className="@container/talent-board min-w-0"
    >
      {!inboxItems && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 overflow-x-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10">
            <Tabs
              activeValue={showingSaved ? "saved" : selectedStageId}
              aria-label={c("보드 단계 선택", "Select board stage")}
              className="min-w-max w-fit gap-0.5"
              items={[
                ...(section === "pipeline"
                  ? [
                      {
                        label: (
                          <span className="inline-flex items-center gap-2">
                            {c("저장함", "Saved")}
                            <span className="ml-0.5 flex items-center justify-center text-xs text-neutral-700">
                              {savedCount}
                            </span>
                          </span>
                        ),
                        value: "saved",
                      },
                    ]
                  : []),
                ...visibleStages.map((stage) => ({
                  label: (
                    <span className="inline-flex items-center gap-2">
                      {getBoardStageLabel(
                        stage,
                        activeRole?.name ?? null,
                        sourceT
                      )}
                      <span
                        className={cn(
                          "flex items-center justify-center text-neutral-700 ml-0.5 text-xs"
                        )}
                      >
                        {stageCounts.get(stage.id) ?? 0}
                      </span>
                    </span>
                  ),
                  tooltip: sourceT(ORG_STAGE_DESCRIPTIONS[stage.id] ?? ""),
                  tooltipVariant: isOrgInboxStage(stage.id)
                    ? ("light" as const)
                    : ("dark" as const),
                  value: stage.id,
                })),
              ]}
              onValueChange={selectStage}
              size="small"
              variant="pills"
            />
          </div>
          {criterionNames.length ? (
            <MuteButton
              aria-expanded={filterOpen}
              aria-label={c(
                "기준별 등급으로 거르기",
                "Filter by criterion grade"
              )}
              className="shrink-0"
              onClick={() => setFilterOpen((open) => !open)}
              size="md"
              title={c("기준별 등급으로 거르기", "Filter by criterion grade")}
              variant={activeGradeFilters.length ? "neutral" : "transparent"}
            >
              <ListFilter aria-hidden="true" className="size-4" />
              {activeGradeFilters.length ? (
                <span className="text-[12px] tabular-nums">
                  {activeGradeFilters.length}
                </span>
              ) : null}
            </MuteButton>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MuteButton
                aria-label={c("정렬: {p0}", "Sort: {p0}", { p0: sortLabel })}
                title={c("정렬: {p0}", "Sort: {p0}", { p0: sortLabel })}
                className="shrink-0"
                size="md"
                variant="transparent"
              >
                <ArrowDownWideNarrow aria-hidden="true" className="size-4" />
              </MuteButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(value) => {
                  if (value === "latest" || value === "recommended")
                    setSort(value);
                }}
              >
                {sortOptions.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {displayControl ? (
            <div className="shrink-0">{displayControl}</div>
          ) : null}
        </div>
      )}

      {recommendationStatus ? (
        <div className="mt-2">{recommendationStatus}</div>
      ) : null}

      {filterOpen && criterionNames.length ? (
        <section
          aria-label={c("기준별 등급 필터", "Criterion grade filters")}
          className="mt-3 grid gap-2 rounded-md bg-bg-basement p-3"
        >
          {criterionNames.map((name) => (
            <FilterChipGroup<OrgCompanyCriterionFitness>
              aria-label={name}
              key={name}
              label={name}
              onValueChange={(value) =>
                setGradeFilters((current) => ({ ...current, [name]: value }))
              }
              options={gradeOptions}
              value={gradeFilters[name] ?? []}
            />
          ))}
          <div className="flex items-center justify-between gap-2 text-[12px] text-neutral-muted">
            {activeRole && permissions.canManageCandidates && !rubricEditing ? (
              <MuteButton
                onClick={() => setRubricEditing(true)}
                size="sm"
                variant="transparent"
              >
                {c("기준 고치기", "Edit criteria")}
              </MuteButton>
            ) : null}
            <span className="ml-auto">
              {c("{p0}명 중 {p1}명", "{p1} of {p0}", {
                p0: stageItems.length,
                p1: items.length,
              })}
            </span>
            {activeGradeFilters.length ? (
              <MuteButton
                onClick={() => setGradeFilters({})}
                size="sm"
                variant="transparent"
              >
                {c("필터 지우기", "Clear filters")}
              </MuteButton>
            ) : null}
          </div>
          {rubricEditing && activeRole ? (
            <div className="mt-2 border-t border-neutral-1000-a05 pt-3">
              <RoleRubricEditor
                onClose={() => setRubricEditing(false)}
                onSaved={() => void boardQuery.refetch()}
                roleId={activeRole.roleId}
                workspaceId={workspaceId}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {layout === "board" && activeRole ? (
        <OrgCandidateBoardCanvas
          items={items}
          key={`${activeRole.roleId}:${showingSaved ? "saved" : selectedStageId}`}
          onSelectionChange={onSelectionReplace}
          renderCard={renderCard}
          roleId={activeRole.roleId}
          selectedIds={selectedIds ?? NO_BOARD_SELECTION}
          workspaceId={workspaceId}
        />
      ) : (
        <div
          className={cn(
            "relative isolate grid grid-cols-1 items-start gap-4 @min-[640px]/talent-board:grid-cols-2",
            !inboxItems && "mt-4",
            selectedStage?.id === "accepted" && "overflow-hidden"
          )}
        >
          {selectedStage?.id === "accepted" ? <InternalOnlyHatch /> : null}
          {items.map(renderCard)}
        </div>
      )}

      <OrgStageMoveDialog
        key={acceptRequest?.item.recommendationId ?? "stage-move-dialog"}
        allowContactDirectly={isInternalDomainEmail(currentUserEmail)}
        candidates={
          acceptRequest
            ? [
                {
                  ...toOrgStageMoveCandidate(
                    acceptRequest.item,
                    sourceT(getOrgCandidateDisplayName(acceptRequest.item))
                  ),
                  // Already confirmed in the reengagement dialog.
                  processClosureNoticeUnresolved: false,
                },
              ]
            : []
        }
        initialStage={acceptRequest?.stage}
        members={members}
        onClose={() => setAcceptRequest(null)}
        onSubmit={(submit) => {
          if (!acceptRequest) return;
          const { item, reengagementResolution } = acceptRequest;
          decisions.move([item], {
            ...submit,
            options: (candidate) => ({
              ...submit.options(candidate),
              reengagementResolution,
            }),
          });
          setAcceptRequest(null);
        }}
        open={Boolean(acceptRequest)}
        roleId={acceptRequest?.item.roleId ?? null}
        roleTitle={acceptRequest?.item.roleName ?? ""}
        stages={board?.stages ?? []}
      />

      <StopCandidateDialog
        candidateName={
          stopItem?.talent.name ||
          stopItem?.talent.email ||
          c("이 후보자", "This candidate")
        }
        connectionStarted={Boolean(
          stopItem && stopItem.stage !== "pending_connection"
        )}
        onClose={() => setStopItem(null)}
        onSubmit={({ note, notifyCandidateOnClosure }) => {
          if (!stopItem) return;
          decisions.reject([stopItem], { note, notifyCandidateOnClosure });
          setStopItem(null);
        }}
        open={Boolean(stopItem)}
        pending={Boolean(stopItem && isCandidateStagePending(stopItem))}
        suggestedReasons={
          stopItem
            ? [suggestOrgStopReasons(stopItem.criteriaEvaluations, locale)]
            : undefined
        }
      />

      <CompanyIntroRequestDialog
        key={companyIntroRequest?.item.companyIntro?.id ?? "closed"}
        candidateName={
          companyIntroRequest
            ? sourceT(getOrgCandidateDisplayName(companyIntroRequest.item))
            : ""
        }
        roleId={companyIntroRequest?.item.roleId}
        workspaceId={workspaceId}
        members={members}
        defaultEmail={currentUserEmail}
        onClose={() => setCompanyIntroRequest(null)}
        onSubmit={async ({ companyAppeal, introRecipientEmails }) => {
          if (!companyIntroRequest?.item.companyIntro) return;
          await requestCompanyIntro.mutateAsync({
            companyAppeal,
            introCandidateId: companyIntroRequest.item.companyIntro.id,
            introRecipientEmails,
            workspaceId,
          });
          setCompanyIntroRequest(null);
          addToast({
            message: c("Intro를 요청했어요.", "Intro requested."),
            variant: "success",
          });
        }}
        open={Boolean(companyIntroRequest)}
        pending={requestCompanyIntro.isPending}
      />
    </section>
  );
}
