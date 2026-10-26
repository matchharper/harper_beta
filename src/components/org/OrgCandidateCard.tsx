import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { localizeOrgProfilePeriod } from "@/i18n/org/profilePeriod";
import Image from "next/image";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { ProfileLabelCell } from "@/components/ops/matching/MatchingTalentCells";
import { InternalOnlyHatch } from "@/components/org/internal/InternalOnlySurface";
import { ReviewPipelineCardPendingState } from "@/components/review-pipeline/ReviewPipelinePrimitives";
import { MuteButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isOrgInternalStage } from "@/lib/org/candidateDecision";
import { getOrgCandidateCardDate } from "@/lib/org/candidateCardDate";
import { getDisplayableProfileImageUrl } from "@/lib/imageUrl";
import { humanizeOrgCompanyIntroStatus } from "@/lib/org/pipelineStage";
import type { OrgBoardItem, OrgStage, OrgStageId } from "@/lib/org/server";
import { cn } from "@/lib/utils";
import { OrgPassPopover } from "./OrgPassPopover";

export function getOrgCandidateDisplayName(item: OrgBoardItem) {
  return item.talent.name || item.talent.email || "이름 없음";
}

export function formatOrgUpcomingMeetingTime(
  startAt: string,
  locale: "ko" | "en" = "ko"
) {
  if (locale === "en") {
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      timeZone: "Asia/Seoul",
    }).format(new Date(startAt));
  }
  const parts = new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date(startAt));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const month = value("month");
  const day = value("day");
  const dayPeriod = value("dayPeriod");
  const hour = value("hour");
  const minute = value("minute");
  const date = month && day ? `${month}월 ${day}일` : "";
  const time = [dayPeriod, hour && minute ? `${hour}:${minute}` : hour]
    .filter(Boolean)
    .join(" ");

  return [date, time].filter(Boolean).join(" ");
}

export function canDropOrgCandidateToStage(
  item: OrgBoardItem,
  stage: OrgStage
) {
  if (item.source === "company_intro") {
    return item.companyIntro?.status === "ready" && stage.id === "connected";
  }
  return !stage.roleId || stage.roleId === item.roleId;
}

export function OrgCandidateStageMenu({
  internalOpsAccess = false,
  item,
  onMove,
  pending = false,
  stages,
}: {
  internalOpsAccess?: boolean;
  item: OrgBoardItem;
  onMove: (item: OrgBoardItem, stage: OrgStageId) => void;
  pending?: boolean;
  stages: OrgStage[];
}) {
  const { c } = useOrgLocale();
  const availableStages = stages.filter(
    (stage) =>
      canDropOrgCandidateToStage(item, stage) &&
      (item.source !== "company_intro" || stage.id === "connected") &&
      (!isOrgInternalStage(stage.id) ||
        (internalOpsAccess && stage.id === "archived"))
  );

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <MuteButton
            aria-label={c("후보자 이동", "Move candidate")}
            size="sm"
            variant="transparent"
          >
            <MoreHorizontal className="h-4 w-4" />
          </MuteButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {availableStages.map((stage) => {
            const isInternalStage = isOrgInternalStage(stage.id);
            return (
              <DropdownMenuItem
                className={cn(
                  isInternalStage && "relative isolate overflow-hidden"
                )}
                key={stage.id}
                disabled={pending || stage.id === item.stage}
                onSelect={() => onMove(item, stage.id)}
              >
                {isInternalStage && (
                  <InternalOnlyHatch className="opacity-70" />
                )}
                <span className={cn(isInternalStage && "relative z-20")}>
                  {stage.label}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function OrgCandidateCard({
  canManageCandidates = false,
  internalOpsAccess = false,
  item,
  onMove,
  onPass,
  onRequestIntro,
  onSelect,
  pending,
  profileLabelsError,
  profileLabelsLoading,
  stages = [],
  viewed = true,
}: {
  canManageCandidates?: boolean;
  internalOpsAccess?: boolean;
  item: OrgBoardItem;
  onMove?: (item: OrgBoardItem, stage: OrgStageId) => void;
  onPass?: (item: OrgBoardItem, reason: string) => Promise<void>;
  onRequestIntro?: (item: OrgBoardItem) => void;
  onSelect: (item: OrgBoardItem) => void;
  pending?: boolean;
  profileLabelsError?: boolean;
  profileLabelsLoading?: boolean;
  stages?: OrgStage[];
  viewed?: boolean;
}) {
  const { locale, c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const displayName = sourceT(getOrgCandidateDisplayName(item));
  const [passOpen, setPassOpen] = useState(false);
  const recentCompanies = item.talent.recentCompanies.map((company) => ({
    ...company,
    period: localizeOrgProfilePeriod(company.period, c("현재", "Present")),
  }));
  const profilePicture = getDisplayableProfileImageUrl(
    item.talent.profilePicture
  );
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const showProfilePicture =
    profilePicture && failedImageSrc !== profilePicture;
  const canDrag =
    canManageCandidates &&
    !pending &&
    (item.source !== "company_intro" || item.companyIntro?.status === "ready");

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={canDrag}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
      onDragStart={(event) => {
        if (
          !canManageCandidates ||
          (item.source === "company_intro" &&
            item.companyIntro?.status !== "ready")
        ) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.recommendationId);
      }}
      className={cn(
        "relative overflow-hidden group rounded-lg border border-neutral-1000-a05 bg-bg-floating p-3 transition hover:border-neutral-1000-a10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        pending && "cursor-wait opacity-60"
      )}
    >
      <div className="flex items-start gap-2.5">
        {showProfilePicture ? (
          <Image
            src={profilePicture}
            alt={c("", "")}
            width={28}
            height={28}
            unoptimized
            onError={() => setFailedImageSrc(profilePicture)}
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[12px] font-normal text-neutral-muted">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-base font-medium text-neutral-primary">
              {displayName}
            </div>
            {!viewed ? (
              <span
                aria-label={c("아직 열람하지 않음", "Not viewed")}
                title={c("아직 열람하지 않음", "Not viewed")}
                className="h-2 w-2 shrink-0 rounded-full bg-blue-500"
              />
            ) : null}
          </div>
          <div className="gap-2">
            {profileLabelsLoading ? (
              <>
                <div className="h-5 w-3/5 animate-pulse rounded-sm bg-neutral-1000-a05" />
              </>
            ) : profileLabelsError ? (
              <div className="text-[12px] leading-5 text-neutral-soft">
                {c(
                  "경력·학력 정보를 불러오지 못했습니다.",
                  "Failed to load experience and education info."
                )}
              </div>
            ) : (
              <>
                <div className="min-w-0">
                  <ProfileLabelCell
                    isCompact={true}
                    emptyLabel={c("정보 없음", "No info")}
                    labels={recentCompanies}
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex flex-wrap mt-1 gap-1.5 text-[13px] font-normal text-neutral-600">
            {/* {item.stage === "pending_connection"
                  ? c("연결 대기 등록", "Ready to connect since")
                  : item.source === "company_intro"
                    ? c("회사에 제안", "Offer to company")
                    : c("추천", "Recommend")}{" "} */}
            {formatKstRelativeDate(getOrgCandidateCardDate(item), {
              locale,
            })}
            {/* {item.roleName && (
                <span className="rounded-sm bg-bg-weak px-2 py-1 text-[11px] leading-4 text-neutral-muted">
                  {item.roleName}
                </span>
              )} */}
          </div>
        </div>
        {/* Keep the trigger measurable while its portalled menu owns focus/hover. */}
        {canManageCandidates && onMove && item.capabilities.moveStage ? (
          <div className="absolute right-2 top-2 md:opacity-0 md:pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:focus-within:opacity-100 md:focus-within:pointer-events-auto md:[&:has([data-state=open])]:opacity-100 md:[&:has([data-state=open])]:pointer-events-auto">
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
      {item.processClosureNoticeUnresolved ? (
        <div className="-mx-3 mt-3 bg-critical px-3 py-1 text-[12px] font-medium text-neutral-00">
          {c("프로세스 종료 안내됨", "Candidate notified that hiring has ended")}
        </div>
      ) : item.upcomingMeeting ? (
        <div className="-mx-3 mt-3 bg-positive px-3 py-1 text-[12px] font-medium text-neutral-00">
          {formatOrgUpcomingMeetingTime(item.upcomingMeeting.startAt, locale)}{" "}
          {c("Interview 예정", "Interview scheduled")}
        </div>
      ) : item.stage === "pending_connection" ? (
        <div className="-mx-3 mt-3 bg-critical px-3 py-1 text-[12px] font-medium text-neutral-00">
          {c("결정이 필요합니다", "Decision required")}
        </div>
      ) : item.companyIntro && item.companyIntro.status !== "ready" ? (
        <div
          className={cn(
            "-mx-3 mt-3 px-3 py-1 text-[12px] font-medium",
            item.companyIntro.status === "connecting"
              ? "bg-positive-faded text-positive"
              : "bg-primary-faded text-primary"
          )}
        >
          {sourceT(humanizeOrgCompanyIntroStatus(item.companyIntro))}
        </div>
      ) : null}
      {canManageCandidates &&
      item.source === "company_intro" &&
      item.companyIntro?.status === "ready" ? (
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <div onClick={(event) => event.stopPropagation()}>
            <OrgPassPopover
              open={passOpen}
              onOpenChange={setPassOpen}
              onSubmit={async (reason) => {
                await onPass?.(item, reason);
              }}
              pending={Boolean(pending)}
              shortcut={false}
            />
          </div>
          <MuteButton
            disabled={pending}
            onClick={(event) => {
              event.stopPropagation();
              onRequestIntro?.(item);
            }}
            size="sm"
            variant="dark"
          >
            {c("Intro 보내기", "Send intro")}
          </MuteButton>
        </div>
      ) : null}
      {pending && <ReviewPipelineCardPendingState />}
    </div>
  );
}
