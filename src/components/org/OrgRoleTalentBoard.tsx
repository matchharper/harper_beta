import {
  useOrgLocale,
  useOrgSourceT,
  useOrgT,
} from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { localizeOrgProfilePeriod } from "@/i18n/org/profilePeriod";
import { ArrowRight, Info, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { type ReactNode, useMemo, useState } from "react";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import {
  AcceptIntroDialog,
  StopCandidateDialog,
} from "@/components/org/OrgCandidateDecisionDialogs";
import {
  CompanyIntroPassDialog,
  CompanyIntroRequestDialog,
} from "@/components/org/CompanyIntroDecisionDialogs";
import {
  getOrgCandidateDisplayName,
  formatOrgUpcomingMeetingTime,
  OrgCandidateStageMenu,
} from "@/components/org/OrgCandidateCard";
import { CardButton, MuteButton } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { Tabs } from "@/components/ui/tabs";
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
import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";
import type {
  OrgBoardItem,
  OrgRole,
  OrgStage,
  OrgStageId,
} from "@/lib/org/server";
import { ResponsiveLightTooltip, Tooltips } from "../ui/tooltip";
import { useToastStore } from "@/store/useToastStore";

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
  if (ORG_STAGE_DESCRIPTIONS[stage.id]) {
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
  roleStatus,
}: {
  roleStatus: OrgRole["status"];
}) {
  const t = useOrgT();
  const status = getOrgRoleStatusPresentation(roleStatus).status;
  const active = status === "active" || status === "top_priority";
  const label = active
    ? t("OrgRoleTalentBoard.recommendationActive", "Harper가 소개하고 있어요")
    : status === "paused"
      ? t("OrgRoleTalentBoard.recommendationPaused", "후보자 추천 중단")
      : t("OrgRoleTalentBoard.recommendationEnded", "후보자 추천 종료");

  const description = active
    ? t(
        "OrgRoleTalentBoard.recommendationActiveDescription",
        "직접 검색하거나 Intro를 요청하지 않아도, Harper가 이 역할에 맞는 후보자에게 회사와 역할을 먼저 소개해요.\n\n후보자가 역할을 수락하고 Harper가 최종 확인한 뒤 ‘연결 대기’에 추천해 드려요."
      )
    : status === "paused"
      ? t(
          "OrgRoleTalentBoard.recommendationPausedDescription",
          "역할이 중단되어 새로운 후보자 추천도 쉬고 있어요. 역할을 다시 진행하면 추천도 이어집니다."
        )
      : t(
          "OrgRoleTalentBoard.recommendationEndedDescription",
          "이 역할의 채용이 종료되어 새로운 후보자를 추천하지 않아요."
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
            {active ? (
              <StatusDot
                className="absolute opacity-40 motion-safe:animate-ping motion-safe:[animation-duration:3s]"
                tone="positive"
              />
            ) : null}
            <StatusDot tone={active ? "positive" : "neutral"} />
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
  const t = useOrgT();
  const name =
    item.talent.name ||
    item.talent.email ||
    t("OrgRoleTalentBoard.f227651c", "이름 없음");
  const profilePicture = getDisplayableProfileImageUrl(
    item.talent.profilePicture
  );
  const [failedImage, setFailedImage] = useState<string | null>(null);

  if (profilePicture && profilePicture !== failedImage) {
    return (
      <Image
        alt={t("OrgRoleTalentBoard.361dc090", "")}
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

const CRITERIA_FITNESS_PRESENTATION: Record<
  OrgBoardItem["criteriaEvaluations"][number]["fitness"],
  { label: string; surfaceClassName: string }
> = {
  excellent: {
    label: "매우 잘 맞음",
    surfaceClassName: "border-positive/30 bg-positive text-white",
  },
  good: {
    label: "잘 맞음",
    surfaceClassName: "border-positive/20 bg-positive-faded/50 text-positive",
  },
  uncertain: {
    label: "확인 필요",
    surfaceClassName: "border-info/20 bg-info-faded text-info",
  },
  bad: {
    label: "맞지 않음",
    surfaceClassName: "border-critical/25 bg-critical-faded text-critical",
  },
};

function CriteriaEvaluation({
  evaluation,
}: {
  evaluation: OrgBoardItem["criteriaEvaluations"][number];
}) {
  const t = useOrgT();
  const presentation = CRITERIA_FITNESS_PRESENTATION[evaluation.fitness];

  return (
    <Tooltips text={evaluation.content}>
      <div className={cn("min-w-0 flex flex-row gap-2 items-center")}>
        <Image
          src={`/svgs/${evaluation.fitness}.svg`}
          alt={t("OrgRoleTalentBoard.361dc090", "")}
          width={16}
          height={16}
        />
        {/* <div
          className={cn(
            presentation.surfaceClassName,
            "flex items-center p-[2px] rounded-sm"
          )}
        >
          <ChartNoAxesColumnIncreasing className="size-4" strokeWidth={3} />
        </div> */}
        <div className="line-clamp-2 text-[12px] font-medium leading-4 text-neutral-primary">
          {evaluation.name}
        </div>
      </div>
    </Tooltips>
  );
}

function CompanyMark({
  label,
  logoUrl: rawLogoUrl,
}: {
  label: string;
  logoUrl?: string | null;
}) {
  const t = useOrgT();
  const logoUrl = getDisplayableCompanyLogoUrl(rawLogoUrl);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const showLogo = Boolean(logoUrl && logoUrl !== failedLogoUrl);

  return (
    <span className="relative flex size-3 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-bg-weak text-[7px] font-normal text-neutral-muted md:size-7 md:rounded-md md:text-[10px]">
      {label.slice(0, 1).toUpperCase()}
      {showLogo && logoUrl ? (
        <Image
          alt={t("OrgRoleTalentBoard.361dc090", "")}
          className="absolute inset-0 size-full bg-bg-floating object-contain p-0.5 md:p-1"
          height={28}
          onError={() => setFailedLogoUrl(logoUrl)}
          src={logoUrl}
          unoptimized
          width={28}
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

function TalentExperienceList({ item }: { item: OrgBoardItem }) {
  const t = useOrgT();
  const recentCompanies = item.talent.recentCompanies.slice(0, 4);
  if (recentCompanies.length === 0) return null;

  return (
    <section
      aria-label={t("OrgRoleTalentBoard.7d253420", "최근 경력")}
      className="mt-6 grid grid-cols-1 gap-x-5 gap-y-3 @sm/talent-card:grid-cols-2 @sm/talent-card:gap-y-5 @3xl/talent-card:grid-cols-4"
    >
      {recentCompanies.map((company) => (
        <div
          className="flex min-w-0 items-start gap-1.5 overflow-hidden md:gap-2.5"
          key={`${company.label}:${company.detail ?? ""}:${company.period ?? ""}`}
        >
          <CompanyMark label={company.label} logoUrl={company.logoUrl} />
          <div className="min-w-0">
            <div className="line-clamp-2 text-[12px] font-normal leading-4 text-neutral-primary md:hidden">
              {getExperienceTitle(company)}
            </div>
            <div className="hidden truncate text-[13px] font-normal text-neutral-primary md:block">
              {company.label}
            </div>
            {company.detail ? (
              <div className="mt-0.5 hidden truncate text-[11px] text-neutral-muted md:block">
                {company.detail}
              </div>
            ) : null}
            {company.period ? (
              <div className="mt-0.5 truncate text-[11px] text-neutral-soft">
                {formatExperienceYearPeriod(
                  localizeOrgProfilePeriod(
                    company.period,
                    t("profile.current", "현재")
                  ) ?? ""
                )}
              </div>
            ) : null}
          </div>
        </div>
      ))}
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
  pending = false,
  stages,
}: {
  canManageCandidates?: boolean;
  internalOpsAccess?: boolean;
  item: OrgBoardItem;
  onAccept?: () => void;
  onMove?: (item: OrgBoardItem, stage: OrgStageId) => void;
  onOpen: () => void;
  onReject?: () => void;
  pending?: boolean;
  stages: OrgStage[];
}) {
  const t = useOrgT();
  const sourceT = useOrgSourceT();
  const { locale } = useOrgLocale();
  const name =
    item.talent.name ||
    item.talent.email ||
    t("OrgRoleTalentBoard.f227651c", "이름 없음");
  const isDecisionStage =
    item.stage === "pending_connection" ||
    (item.source === "company_intro" && item.companyIntro?.status === "ready");
  const showDecisionActions = canManageCandidates && isDecisionStage;
  const latestExperience = item.talent.recentCompanies[0] ?? null;

  return (
    <article className="@container/talent-card relative isolate min-w-0 overflow-hidden rounded-lg">
      <CardButton
        aria-label={t("OrgRoleTalentBoard.f15e21d3", "{p0} 후보자 상세 보기", {
          p0: name,
        })}
        className="absolute inset-0 z-0 h-full rounded-lg border-neutral-1000-a05 p-0 hover:border-neutral-1000-a05"
        onClick={onOpen}
      >
        <span className="sr-only">
          {t("composed.viewCandidateDetails", "{name} 후보자 상세 보기", {
            name,
          })}
        </span>
      </CardButton>
      <div className="pointer-events-none relative z-10 p-4 sm:p-5">
        <header className="flex items-start gap-3">
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
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <time className="pt-0.5 text-[11px] font-normal text-neutral-soft">
                  {formatKstRelativeDate(item.recommendedAt, { locale })}
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
            aria-label={t("OrgRoleTalentBoard.74a26c33", "평가 기준별 적합도")}
            className="mt-6 grid grid-cols-1 gap-2 @sm/talent-card:grid-cols-2 @xl/talent-card:grid-cols-3"
          >
            {item.criteriaEvaluations.map((evaluation, index) => (
              <CriteriaEvaluation
                evaluation={evaluation}
                key={`${evaluation.name}:${index}`}
              />
            ))}
          </section>
        ) : null}

        <TalentExperienceList item={item} />

        {item.companyIntro ? (
          <p className="mt-4 text-[13px] text-neutral-muted">
            {sourceT(humanizeOrgCompanyIntroStatus(item.companyIntro))}
          </p>
        ) : null}

        {item.processClosureNoticeUnresolved ? (
          <div className="-mx-4 mt-5 bg-critical px-4 py-1.5 text-[12px] font-medium text-neutral-00 sm:-mx-5 sm:px-5">
            {t("OrgRoleTalentBoard.5c285374", "프로세스 종료 안내됨")}
          </div>
        ) : item.upcomingMeeting ? (
          <div className="-mx-4 -mb-4 mt-5 bg-positive px-4 py-1.5 text-[12px] font-medium text-neutral-00 sm:-mx-5 sm:-mb-5 sm:px-5">
            {formatOrgUpcomingMeetingTime(item.upcomingMeeting.startAt, locale)}{" "}
            {t("OrgRoleTalentBoard.7720ce33", "Interview 예정")}
          </div>
        ) : null}

        {showDecisionActions ? (
          <div className="pointer-events-auto mt-6 grid grid-cols-[108px_minmax(0,1fr)] gap-2">
            <MuteButton
              disabled={pending}
              onClick={onReject}
              size="md"
              variant="neutral"
            >
              {item.source === "company_intro"
                ? "Pass"
                : CANDIDATE_DECISION_LABELS.reject}
            </MuteButton>
            <MuteButton
              className="w-full"
              disabled={pending}
              onClick={onAccept}
              size="md"
              variant="dark"
            >
              {item.source === "company_intro"
                ? t("OrgRoleTalentBoard.f4e85c84", "Intro 요청")
                : CANDIDATE_DECISION_LABELS.connect}
              <ArrowRight className="size-4" />
            </MuteButton>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function OrgRoleTalentBoard({
  displayControl,
  section = "pipeline",
}: {
  displayControl?: ReactNode;
  section?: "inbox" | "pipeline";
}) {
  const t = useOrgT();
  const sourceT = useOrgSourceT();
  const { locale } = useOrgLocale();
  const { board, boardQuery } = useOrgJobsBoard();
  const {
    changeStage,
    isCandidateStagePending,
    requestCandidateReengagementBeforeStageChange,
  } = useOrgJobsCandidateActions();
  const { activeRole, selectTalent, workspaceId } = useOrgJobsNavigation();
  const {
    bootstrap,
    currentUser,
    currentUserEmail,
    internalOpsAccess,
    permissions,
  } = useOrgWorkspace();
  const members = bootstrap.members;
  const createCustomStage = useCreateOrgReviewStage();
  const requestCompanyIntro = useRequestOrgCompanyIntro();
  const passCompanyIntro = usePassOrgCompanyIntro();
  const addToast = useToastStore((state) => state.add);
  const [activeStageId, setActiveStageId] = useState("");
  const [acceptRequest, setAcceptRequest] = useState<{
    item: OrgBoardItem;
    reengagementResolution?: "company_confirmed";
    stage: OrgStageId;
  } | null>(null);
  const [stopItem, setStopItem] = useState<OrgBoardItem | null>(null);
  const [companyIntroRequest, setCompanyIntroRequest] = useState<{
    item: OrgBoardItem;
  } | null>(null);
  const [companyIntroPass, setCompanyIntroPass] = useState<OrgBoardItem | null>(
    null
  );
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
    (stage) => stage.id === activeStageId
  )
    ? activeStageId
    : defaultStageId;
  const selectedStage = visibleStages.find(
    (stage) => stage.id === selectedStageId
  );
  const items = useMemo(
    () =>
      (board?.items ?? [])
        .filter((item) => item.stage === selectedStageId)
        .sort((left, right) =>
          right.recommendedAt.localeCompare(left.recommendedAt)
        ),
    [board?.items, selectedStageId]
  );
  const recommendationStatus =
    section === "inbox" && activeRole ? (
      <OrgRoleRecommendationStatus roleStatus={activeRole.status} />
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
          {t("OrgRoleTalentBoard.8a6c6d35", "후보자를 불러오는 중입니다.")}
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
          {t("OrgRoleTalentBoard.3f651826", "표시할 단계가 없습니다.")}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={t("OrgRoleTalentBoard.3767a293", "후보자 보드")}
      className="@container/talent-board min-w-0"
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3",
          section === "inbox" &&
            "flex-wrap gap-y-2 @min-[560px]/talent-board:flex-nowrap"
        )}
      >
        <div
          className={cn(
            "min-w-0 overflow-x-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10",
            section === "inbox" && "w-full @min-[560px]/talent-board:w-auto"
          )}
        >
          <Tabs
            activeValue={selectedStageId}
            aria-label={t("OrgRoleTalentBoard.4458527b", "보드 단계 선택")}
            className="min-w-max w-fit gap-0.5"
            items={visibleStages.map((stage) => ({
              label: (
                <span className="inline-flex items-center gap-2">
                  {getBoardStageLabel(stage, activeRole?.name ?? null, sourceT)}
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
              value: stage.id,
            }))}
            onValueChange={setActiveStageId}
            size="small"
            variant="pills"
          />
        </div>
        {recommendationStatus ? (
          <div className="shrink-0 @min-[560px]/talent-board:ml-auto">
            {recommendationStatus}
          </div>
        ) : null}
        {displayControl ? (
          <div className="shrink-0">{displayControl}</div>
        ) : null}
      </div>

      <div
        className={cn(
          "relative isolate mt-4 grid grid-cols-1 items-start gap-4 @min-[640px]/talent-board:grid-cols-2",
          selectedStage?.id === "accepted" && "overflow-hidden"
        )}
      >
        {selectedStage?.id === "accepted" ? <InternalOnlyHatch /> : null}
        {items.map((item) => (
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
                  : t("OrgRoleTalentBoard.3767a293", "후보자 보드")
              )
            }
            onReject={() =>
              item.source === "company_intro"
                ? setCompanyIntroPass(item)
                : requestMove(item, "process_stopped")
            }
            pending={isCandidateStagePending(item)}
            stages={board?.stages ?? []}
          />
        ))}
        {items.length === 0 ? (
          <div className="col-span-full px-4 py-12 text-center text-[13px] text-neutral-muted">
            {t(
              "OrgRoleTalentBoard.964b74fd",
              "이 단계에는 아직 후보자가 없습니다."
            )}
          </div>
        ) : null}
      </div>

      <AcceptIntroDialog
        key={acceptRequest?.item.recommendationId ?? "accept-dialog"}
        allowContactDirectly={isInternalDomainEmail(currentUserEmail)}
        candidateEmail={acceptRequest?.item.talent.email}
        candidateName={
          acceptRequest
            ? sourceT(getOrgCandidateDisplayName(acceptRequest.item))
            : ""
        }
        companyContactName={currentUser?.name}
        defaultContactDirectly={isInternalDomainEmail(currentUserEmail)}
        defaultEmail={currentUserEmail}
        destinationLabel={
          board?.stages.find((stage) => stage.id === acceptRequest?.stage)
            ?.label
        }
        members={members}
        onClose={() => setAcceptRequest(null)}
        onSubmit={async ({
          acceptReason,
          additionalMessage,
          additionalMessageVisibility,
          attendeeEmails,
          contactDirectly,
          durationMinutes,
          introEmails,
          meetingCandidateMessage,
          meetingPurpose,
          scheduleInterview,
          title,
        }) => {
          if (!acceptRequest) return;
          const stage = acceptRequest.stage;
          const result = await changeStage(acceptRequest.item, stage, {
            acceptReason,
            additionalMessage,
            additionalMessageVisibility,
            attendeeEmails,
            contactDirectly,
            durationMinutes,
            introEmails,
            meetingCandidateMessage,
            meetingPurpose,
            reengagementResolution: acceptRequest.reengagementResolution,
            scheduleInterview,
            title,
          });
          setAcceptRequest(null);
          return result;
        }}
        open={Boolean(acceptRequest)}
        pending={Boolean(
          acceptRequest && isCandidateStagePending(acceptRequest.item)
        )}
        roleTitle={acceptRequest?.item.roleName ?? ""}
      />

      <StopCandidateDialog
        candidateName={
          stopItem?.talent.name ||
          stopItem?.talent.email ||
          t("OrgRoleTalentBoard.c6d68c5d", "이 후보자")
        }
        connectionStarted={Boolean(
          stopItem && stopItem.stage !== "pending_connection"
        )}
        onClose={() => setStopItem(null)}
        onSubmit={async ({ note }) => {
          if (!stopItem) return;
          await changeStage(stopItem, "process_stopped", { stopNote: note });
          setStopItem(null);
        }}
        open={Boolean(stopItem)}
        pending={Boolean(stopItem && isCandidateStagePending(stopItem))}
      />

      <CompanyIntroRequestDialog
        key={companyIntroRequest?.item.companyIntro?.id ?? "closed"}
        candidateName={
          companyIntroRequest
            ? sourceT(getOrgCandidateDisplayName(companyIntroRequest.item))
            : ""
        }
        defaultEmail={currentUserEmail}
        onClose={() => setCompanyIntroRequest(null)}
        onSubmit={async ({ companyAppeal, introRecipientEmails }) => {
          if (!companyIntroRequest?.item.companyIntro) return;
          try {
            await requestCompanyIntro.mutateAsync({
              companyAppeal,
              introCandidateId: companyIntroRequest.item.companyIntro.id,
              introRecipientEmails,
              workspaceId,
            });
            setCompanyIntroRequest(null);
            addToast({
              message: t(
                "OrgRoleTalentBoard.2e9b2805",
                "후보자에게 보낼 제안 준비를 시작했습니다. 발송 후 후보자의 답변을 기다립니다."
              ),
              variant: "success",
            });
          } catch (error) {
            addToast({
              message: localizedOrgErrorMessage(
                error,
                locale,
                t("OrgRoleTalentBoard.7d2cc265", "제안을 처리하지 못했습니다.")
              ),
              variant: "error",
            });
            throw error;
          }
        }}
        open={Boolean(companyIntroRequest)}
        pending={requestCompanyIntro.isPending}
      />

      <CompanyIntroPassDialog
        candidateName={
          companyIntroPass
            ? sourceT(getOrgCandidateDisplayName(companyIntroPass))
            : ""
        }
        onClose={() => setCompanyIntroPass(null)}
        onConfirm={async () => {
          if (!companyIntroPass?.companyIntro) return;
          await passCompanyIntro.mutateAsync({
            introCandidateId: companyIntroPass.companyIntro.id,
            workspaceId,
          });
          setCompanyIntroPass(null);
          addToast({
            message: t(
              "OrgRoleTalentBoard.ce127878",
              "후보자에게 제안하지 않고 목록에서 제외했습니다."
            ),
            variant: "success",
          });
        }}
        open={Boolean(companyIntroPass)}
        pending={passCompanyIntro.isPending}
      />
    </section>
  );
}
