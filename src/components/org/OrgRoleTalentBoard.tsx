import {
  ArrowRight,
  ChartNoAxesColumnIncreasing,
  LoaderCircle,
} from "lucide-react";
import Image from "next/image";
import { type ReactNode, useMemo, useState } from "react";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import {
  AcceptIntroDialog,
  StopCandidateDialog,
} from "@/components/org/OrgCandidateDecisionDialogs";
import {
  getOrgCandidateDisplayName,
  OrgCandidateStageMenu,
} from "@/components/org/OrgCandidateCard";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import {
  useOrgJobsBoard,
  useOrgJobsCandidateActions,
  useOrgJobsNavigation,
} from "@/hooks/org/useOrgJobs";
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
import type { OrgBoardItem, OrgStage, OrgStageId } from "@/lib/org/server";
import { Tooltips } from "../ui/tooltip";

function getStageLabel(stage: OrgStage, roleName: string | null) {
  const prefix = roleName ? `${roleName} · ` : "";
  return prefix && stage.label.startsWith(prefix)
    ? stage.label.slice(prefix.length)
    : stage.label;
}

function getBoardStageLabel(stage: OrgStage, roleName: string | null) {
  const label = getStageLabel(stage, roleName);
  if (stage.id !== "accepted") return label;

  return (
    <span className="relative isolate overflow-hidden px-0.5">
      <InternalOnlyHatch />
      <span className="relative z-20">{label}</span>
    </span>
  );
}

function BoardTalentAvatar({ item }: { item: OrgBoardItem }) {
  const name = item.talent.name || item.talent.email || "이름 없음";
  const profilePicture = getDisplayableProfileImageUrl(
    item.talent.profilePicture
  );
  const [failedImage, setFailedImage] = useState<string | null>(null);

  if (profilePicture && profilePicture !== failedImage) {
    return (
      <Image
        alt=""
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
  const presentation = CRITERIA_FITNESS_PRESENTATION[evaluation.fitness];

  return (
    <Tooltips text={evaluation.content}>
      <div className={cn("min-w-0 flex flex-row gap-2 items-center")}>
        <Image
          src={`/svgs/${evaluation.fitness}.svg`}
          alt=""
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
  const logoUrl = getDisplayableCompanyLogoUrl(rawLogoUrl);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const showLogo = Boolean(logoUrl && logoUrl !== failedLogoUrl);

  return (
    <span className="relative flex size-3 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-bg-weak text-[7px] font-normal text-neutral-muted md:size-7 md:rounded-md md:text-[10px]">
      {label.slice(0, 1).toUpperCase()}
      {showLogo && logoUrl ? (
        <Image
          alt=""
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
  const recentCompanies = item.talent.recentCompanies.slice(0, 4);
  if (recentCompanies.length === 0) return null;

  return (
    <section
      aria-label="최근 경력"
      className="mt-6 grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2 md:gap-y-5 lg:grid-cols-4"
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
                {formatExperienceYearPeriod(company.period)}
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
  const name = item.talent.name || item.talent.email || "이름 없음";
  const isDecisionStage = item.stage === "pending_connection";
  const showDecisionActions = canManageCandidates && isDecisionStage;
  const latestExperience = item.talent.recentCompanies[0] ?? null;

  return (
    <article className="relative isolate overflow-hidden rounded-lg">
      <CardButton
        aria-label={`${name} 후보자 상세 보기`}
        className="absolute inset-0 z-0 h-full rounded-lg border-neutral-1000-a05 p-0"
        onClick={onOpen}
      >
        <span className="sr-only">{name} 후보자 상세 보기</span>
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
                  {formatKstRelativeDate(item.recommendedAt)}
                </time>
                {!isDecisionStage && canManageCandidates && onMove ? (
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
            aria-label="평가 기준별 적합도"
            className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
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

        {showDecisionActions ? (
          <div className="pointer-events-auto mt-6 grid grid-cols-[108px_minmax(0,1fr)] gap-2">
            <MuteButton
              disabled={pending}
              onClick={onReject}
              size="md"
              variant="neutral"
            >
              {CANDIDATE_DECISION_LABELS.reject}
            </MuteButton>
            <MuteButton
              className="w-full"
              disabled={pending}
              onClick={onAccept}
              size="md"
              variant="dark"
            >
              {CANDIDATE_DECISION_LABELS.connect}
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
}: {
  displayControl?: ReactNode;
}) {
  const { board, boardQuery } = useOrgJobsBoard();
  const { changeStage, isCandidateStagePending } = useOrgJobsCandidateActions();
  const { activeRole, selectTalent } = useOrgJobsNavigation();
  const {
    bootstrap,
    currentUser,
    currentUserEmail,
    internalOpsAccess,
    permissions,
  } = useOrgWorkspace();
  const members = bootstrap.members;
  const [activeStageId, setActiveStageId] = useState("");
  const [acceptRequest, setAcceptRequest] = useState<{
    item: OrgBoardItem;
    stage: OrgStageId;
  } | null>(null);
  const [stopItem, setStopItem] = useState<OrgBoardItem | null>(null);
  const visibleStages = useMemo(
    () =>
      (board?.stages ?? []).filter(
        (stage) =>
          !isOrgInternalStage(stage.id) ||
          (internalOpsAccess && stage.id === "accepted")
      ),
    [board?.stages, internalOpsAccess]
  );
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

  const requestMove = (item: OrgBoardItem, stage: OrgStageId) => {
    if (!permissions.canManageCandidates || item.stage === stage) return;
    if (shouldOpenOrgStopCandidateDialog(item.stage, stage)) {
      setStopItem(item);
      return;
    }
    if (shouldOpenOrgAcceptIntroDialog(item.stage, stage)) {
      setAcceptRequest({ item, stage });
      return;
    }
    void Promise.resolve(changeStage(item, stage)).catch(() => undefined);
  };

  if (boardQuery.isLoading) {
    return (
      <div className="flex min-h-56 items-center justify-center text-[13px] text-neutral-muted">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        후보자를 불러오는 중입니다.
      </div>
    );
  }

  if (visibleStages.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-[13px] text-neutral-muted">
        표시할 파이프라인 단계가 없습니다.
      </div>
    );
  }

  return (
    <section aria-label="후보자 보드" className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 overflow-x-auto pb-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10">
          <Tabs
            activeValue={selectedStageId}
            aria-label="보드 단계 선택"
            className="min-w-max w-fit gap-0.5"
            items={visibleStages.map((stage) => ({
              label: getBoardStageLabel(stage, activeRole?.name ?? null),
              value: stage.id,
            }))}
            onValueChange={setActiveStageId}
            size="small"
            variant="pills"
          />
        </div>
        {displayControl ? (
          <div className="shrink-0">{displayControl}</div>
        ) : null}
      </div>

      <div
        className={cn(
          "relative isolate mt-4 space-y-4",
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
            onAccept={() => requestMove(item, "connected")}
            onMove={requestMove}
            onOpen={() =>
              selectTalent(
                item,
                items,
                selectedStage
                  ? getStageLabel(selectedStage, activeRole?.name ?? null)
                  : "후보자 보드"
              )
            }
            onReject={() => requestMove(item, "process_stopped")}
            pending={isCandidateStagePending(item)}
            stages={board?.stages ?? []}
          />
        ))}
        {items.length === 0 ? (
          <div className="px-4 py-12 text-center text-[13px] text-neutral-muted">
            이 단계에는 아직 후보자가 없습니다.
          </div>
        ) : null}
      </div>

      <AcceptIntroDialog
        allowContactDirectly={isInternalDomainEmail(currentUserEmail)}
        candidateEmail={acceptRequest?.item.talent.email}
        candidateName={
          acceptRequest ? getOrgCandidateDisplayName(acceptRequest.item) : ""
        }
        companyContactName={currentUser?.name}
        defaultContactDirectly={isInternalDomainEmail(currentUserEmail)}
        defaultEmail={currentUserEmail}
        members={members}
        onClose={() => setAcceptRequest(null)}
        onSubmit={async ({ acceptReason, contactDirectly, introEmails }) => {
          if (!acceptRequest) return;
          await changeStage(acceptRequest.item, acceptRequest.stage, {
            acceptReason,
            contactDirectly,
            introEmails,
          });
          setAcceptRequest(null);
        }}
        open={Boolean(acceptRequest)}
        pending={Boolean(
          acceptRequest && isCandidateStagePending(acceptRequest.item)
        )}
        roleTitle={acceptRequest?.item.roleName ?? ""}
      />

      <StopCandidateDialog
        candidateName={
          stopItem?.talent.name || stopItem?.talent.email || "이 후보자"
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
    </section>
  );
}
