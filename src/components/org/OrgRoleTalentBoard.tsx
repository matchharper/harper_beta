import { ArrowRight, Check, LoaderCircle } from "lucide-react";
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
import { BareButton, MuteButton } from "@/components/ui/button";
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
import { isInternalDomainEmail } from "@/lib/internalAccess";
import {
  isOrgInternalStage,
  shouldOpenOrgAcceptIntroDialog,
  shouldOpenOrgStopCandidateDialog,
} from "@/lib/org/candidateDecision";
import type {
  OrgBoardItem,
  OrgStage,
  OrgStageId,
} from "@/lib/org/server";

function getStageLabel(stage: OrgStage, roleName: string | null) {
  const prefix = roleName ? `${roleName} · ` : "";
  return prefix && stage.label.startsWith(prefix)
    ? stage.label.slice(prefix.length)
    : stage.label;
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

function MatchSignal({ label }: { label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-positive-faded text-positive"
      >
        <Check className="size-3" strokeWidth={2} />
      </span>
      <span className="truncate text-[12px] font-normal text-neutral-primary">
        {label}
      </span>
    </div>
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
    <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-weak text-[11px] font-normal text-neutral-muted">
      {label.slice(0, 1).toUpperCase()}
      {showLogo && logoUrl ? (
        <Image
          alt=""
          className="absolute inset-0 size-full bg-bg-floating object-contain p-1"
          height={32}
          onError={() => setFailedLogoUrl(logoUrl)}
          src={logoUrl}
          unoptimized
          width={32}
        />
      ) : null}
    </span>
  );
}

function TalentExperienceList({ item }: { item: OrgBoardItem }) {
  const recentCompanies = item.talent.recentCompanies.slice(0, 4);
  if (recentCompanies.length === 0) return null;

  return (
    <section
      aria-label="최근 경력"
      className="mt-6 grid max-h-[58px] grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-x-5 gap-y-5 overflow-hidden"
    >
      {recentCompanies.map((company) => (
        <div
          className="flex min-w-[168px] items-start gap-2.5 overflow-hidden"
          key={`${company.label}:${company.period ?? ""}`}
        >
          <CompanyMark label={company.label} logoUrl={company.logoUrl} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-normal text-neutral-primary">
              {company.label}
            </div>
            {company.detail ? (
              <div className="mt-0.5 truncate text-[11px] text-neutral-muted">
                {company.detail}
              </div>
            ) : null}
            {company.period ? (
              <div className="mt-0.5 truncate text-[11px] text-neutral-soft">
                {company.period}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}

function uniqueText(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.map((value) => value?.trim()).filter(Boolean)),
  ] as string[];
}

export function OrgRoleTalentBoardCard({
  canManageCandidates = false,
  item,
  onAccept,
  onMove,
  onOpen,
  onReject,
  pending = false,
  stages,
}: {
  canManageCandidates?: boolean;
  item: OrgBoardItem;
  onAccept?: () => void;
  onMove?: (item: OrgBoardItem, stage: OrgStageId) => void;
  onOpen: () => void;
  onReject?: () => void;
  pending?: boolean;
  stages: OrgStage[];
}) {
  const name = item.talent.name || item.talent.email || "이름 없음";
  const highlights = uniqueText([item.fitSummary, ...item.fitReasons]);
  const signals = highlights.slice(2, 6);
  const isDecisionStage = item.stage === "pending_connection";
  const showDecisionActions = canManageCandidates && isDecisionStage;

  return (
    <article className="rounded-lg border border-neutral-1000-a05 bg-bg-floating px-5 py-5">
      <header className="flex items-start gap-3">
        <BoardTalentAvatar item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <BareButton className="block max-w-full text-left" onClick={onOpen}>
                <h3 className="truncate text-[19px] font-normal leading-6 tracking-[-0.02em] text-neutral-primary hover:underline">
                  {name}
                </h3>
              </BareButton>
              {item.talent.headline ? (
                <p className="mt-0.5 line-clamp-2 text-[13px] font-normal leading-5 text-neutral-muted">
                  {item.talent.headline}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <time className="pt-0.5 text-[11px] font-normal text-neutral-soft">
                {formatKstRelativeDate(item.recommendedAt)}
              </time>
              {!isDecisionStage && canManageCandidates && onMove ? (
                <OrgCandidateStageMenu
                  item={item}
                  onMove={onMove}
                  pending={pending}
                  stages={stages}
                />
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {signals.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-3 lg:grid-cols-3">
          {signals.map((signal) => (
            <MatchSignal key={signal} label={signal} />
          ))}
        </div>
      ) : null}

      <TalentExperienceList item={item} />

      {showDecisionActions ? (
        <div className="mt-6 grid grid-cols-[108px_minmax(0,1fr)] gap-2">
          <MuteButton
            disabled={pending}
            onClick={onReject}
            size="md"
            variant="neutral"
          >
            연결 거절
          </MuteButton>
          <MuteButton
            className="w-full"
            disabled={pending}
            onClick={onAccept}
            size="md"
            variant="dark"
          >
            연결 수락
            <ArrowRight className="size-4" />
          </MuteButton>
        </div>
      ) : null}
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
      (board?.stages ?? []).filter((stage) => !isOrgInternalStage(stage.id)),
    [board?.stages]
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
              label: getStageLabel(stage, activeRole?.name ?? null),
              value: stage.id,
            }))}
            onValueChange={setActiveStageId}
            size="small"
            variant="pills"
          />
        </div>
        <div className="shrink-0">{displayControl}</div>
      </div>

      <div className="mt-4 space-y-4">
        {items.map((item) => (
          <OrgRoleTalentBoardCard
            canManageCandidates={permissions.canManageCandidates}
            item={item}
            key={item.recommendationId}
            onAccept={() => requestMove(item, "connected")}
            onMove={requestMove}
            onOpen={() =>
              selectTalent(item, items, selectedStage?.label ?? "후보자 보드")
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
