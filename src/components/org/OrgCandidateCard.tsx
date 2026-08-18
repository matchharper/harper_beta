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
import { getDisplayableProfileImageUrl } from "@/lib/imageUrl";
import { isOrgInternalStage } from "@/lib/org/candidateDecision";
import type { OrgBoardItem, OrgStage, OrgStageId } from "@/lib/org/server";
import { cn } from "@/lib/utils";

export function getOrgCandidateDisplayName(item: OrgBoardItem) {
  return item.talent.name || item.talent.email || "이름 없음";
}

export function canDropOrgCandidateToStage(
  item: OrgBoardItem,
  stage: OrgStage
) {
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
  const availableStages = stages.filter(
    (stage) =>
      canDropOrgCandidateToStage(item, stage) &&
      (internalOpsAccess || !isOrgInternalStage(stage.id))
  );

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <MuteButton
            aria-label="후보자 이동"
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
  onSelect: (item: OrgBoardItem) => void;
  pending?: boolean;
  profileLabelsError?: boolean;
  profileLabelsLoading?: boolean;
  stages?: OrgStage[];
  viewed?: boolean;
}) {
  const displayName = getOrgCandidateDisplayName(item);
  const profilePicture = getDisplayableProfileImageUrl(
    item.talent.profilePicture
  );
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const showProfilePicture =
    profilePicture && failedImageSrc !== profilePicture;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={canManageCandidates && !pending}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
      onDragStart={(event) => {
        if (!canManageCandidates) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.recommendationId);
      }}
      className={cn(
        "relative overflow-hidden rounded-sm border border-neutral-1000-a05 bg-bg-floating p-3 transition hover:border-neutral-1000-a10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
        canManageCandidates
          ? "cursor-grab active:cursor-grabbing"
          : "cursor-pointer",
        pending && "cursor-wait opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        {showProfilePicture ? (
          <Image
            src={profilePicture}
            alt=""
            width={28}
            height={28}
            unoptimized
            onError={() => setFailedImageSrc(profilePicture)}
            className="h-7 w-7 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[12px] font-normal text-neutral-muted">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-[14px] font-medium text-neutral-primary">
              {displayName}
            </div>
            {!viewed ? (
              <span
                aria-label="아직 열람하지 않음"
                title="아직 열람하지 않음"
                className="h-2 w-2 shrink-0 rounded-full bg-blue-500"
              />
            ) : null}
          </div>
        </div>
        {canManageCandidates && onMove ? (
          <OrgCandidateStageMenu
            internalOpsAccess={internalOpsAccess}
            item={item}
            onMove={onMove}
            pending={pending}
            stages={stages}
          />
        ) : null}
      </div>
      <div className="mt-1 grid gap-2">
        {profileLabelsLoading ? (
          <>
            <div className="h-5 w-3/5 animate-pulse rounded-sm bg-neutral-1000-a05" />
          </>
        ) : profileLabelsError ? (
          <div className="text-[12px] leading-5 text-neutral-soft">
            경력·학력 정보를 불러오지 못했습니다.
          </div>
        ) : (
          <>
            <div className="min-w-0">
              <ProfileLabelCell
                isCompact={true}
                emptyLabel="회사 없음"
                labels={item.talent.recentCompanies}
              />
            </div>
            {/* <div className="min-w-0">
              <ProfileLabelCell
                emptyLabel="학교 없음"
                labels={item.talent.recentSchools}
              />
            </div> */}
          </>
        )}
      </div>
      {item.stage === "pending_connection" ? (
        <div className="-mx-3 mt-3 bg-critical px-3 py-1 text-[12px] font-medium text-neutral-00">
          결정이 필요합니다
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-sm bg-bg-weak px-2 py-1 text-[11px] leading-4 text-neutral-muted">
          추천 {formatKstRelativeDate(item.recommendedAt)}
        </span>
        {/* {item.roleName && (
          <span className="rounded-sm bg-bg-weak px-2 py-1 text-[11px] leading-4 text-neutral-muted">
            {item.roleName}
          </span>
        )} */}
      </div>
      {pending && <ReviewPipelineCardPendingState />}
    </div>
  );
}
