import { formatRelativeTime } from "@/lib/utils";
import { Building2, GripVertical, Loader2 } from "lucide-react";
import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { CareerHistoryOpportunity } from "../types";
import {
  canChangeCareerOpportunityManagementStatus,
  getSavedOpportunityStatusOptions,
  getSavedOpportunityManagementStatus,
  type SavedOpportunityManagementStatus,
} from "./savedOpportunityStatus";
import { BareButton } from "@/components/ui/button";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import { InternalOpportunityDecisionMenu } from "./InternalOpportunityDecisionActions";
import type { CareerInternalOpportunityDecisionAction } from "@/lib/career/internalOpportunityDecision";
import UpcomingMeetingStrip from "./UpcomingMeetingStrip";

type SavedOpportunityBoardProps = {
  columnLoadState: Record<
    SavedOpportunityBoardStatus,
    {
      hasMore: boolean;
      loadedCount: number;
      loading: boolean;
      totalCount: number;
    }
  >;
  counts: Record<SavedOpportunityManagementStatus, number>;
  items: CareerHistoryOpportunity[];
  pendingOpportunityIds: Set<string>;
  onOpenDetail: (item: CareerHistoryOpportunity) => void;
  onLoadMoreColumn: (status: SavedOpportunityBoardStatus) => void;
  onInternalDecisionAction?: (
    item: CareerHistoryOpportunity,
    action: CareerInternalOpportunityDecisionAction
  ) => void;
  onStatusChange: (
    item: CareerHistoryOpportunity,
    status: SavedOpportunityBoardStatus
  ) => void;
};

export type SavedOpportunityBoardStatus = Exclude<
  SavedOpportunityManagementStatus,
  "all" | "hidden"
>;

const BOARD_AUTO_SCROLL_EDGE_PX = 72;
const BOARD_AUTO_SCROLL_MAX_STEP_PX = 28;

const SavedOpportunityBoardCard = ({
  item,
  locale,
  pending,
  dragging,
  onDragEnd,
  onDragStart,
  onInternalDecisionAction,
  onOpenDetail,
}: {
  item: CareerHistoryOpportunity;
  locale: Locale;
  pending: boolean;
  dragging: boolean;
  onDragEnd: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onInternalDecisionAction?: (
    action: CareerInternalOpportunityDecisionAction
  ) => void;
  onOpenDetail: () => void;
}) => {
  const recommendedAgo = formatRelativeTime(item.recommendedAt, locale);
  const displayLocation = formatCareerLocation(item.location, locale);
  const locationMeta = [displayLocation, item.workMode]
    .filter(Boolean)
    .join(" · ");
  const canChangeStatus =
    !item.isInternal && canChangeCareerOpportunityManagementStatus(item);

  return (
    <div
      draggable={!pending && canChangeStatus}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative w-full rounded-[8px] border border-neutral-1000-a05 bg-bg-floating text-left transition-colors hover:border-neutral-400 hover:bg-bg-weak",
        pending && "cursor-not-allowed opacity-60",
        dragging && "opacity-45"
      )}
    >
      {item.isInternal && onInternalDecisionAction ? (
        <InternalOpportunityDecisionMenu
          className="absolute right-2 top-2 z-10"
          item={item}
          pending={pending}
          onCard
          onAction={onInternalDecisionAction}
        />
      ) : null}
      <BareButton
        type="button"
        onClick={onOpenDetail}
        disabled={pending}
        className="w-full px-3 py-3 text-left disabled:cursor-not-allowed"
      >
        <div className="flex items-start gap-1">
          {/* <GripVertical
            className="mt-1 h-4 w-4 shrink-0 text-neutral-soft"
            strokeWidth={1.2}
          /> */}
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "flex min-w-0 items-center gap-2",
                item.isInternal && onInternalDecisionAction && "pr-9"
              )}
            >
              {item.companyLogoUrl ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-neutral-1000-a05 bg-bg-default p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.companyLogoUrl}
                    alt={item.companyName}
                    className="h-full w-full rounded-md object-cover"
                  />
                </span>
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-black text-neutral-00">
                  <Building2 className="h-3.5 w-3.5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium leading-5 text-neutral-primary">
                  {item.companyName}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-neutral-muted">
                  {locationMeta}
                </div>
              </div>
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-neutral-muted" />
              ) : null}
            </div>

            <div className="mt-3 line-clamp-2 text-[14px] font-normal leading-5 text-neutral-primary">
              {item.title}
            </div>
            <UpcomingMeetingStrip
              meeting={item.upcomingMeeting}
              className="-mx-3 mt-2 rounded-none px-3 py-1 text-[11px] leading-4"
            />
            {recommendedAgo ? (
              <div className="mt-2 truncate text-[12px] leading-4 text-neutral-muted">
                {recommendedAgo}
              </div>
            ) : null}
          </div>
        </div>
      </BareButton>
    </div>
  );
};

function SavedOpportunityBoard({
  columnLoadState,
  counts,
  items,
  pendingOpportunityIds,
  onOpenDetail,
  onLoadMoreColumn,
  onInternalDecisionAction,
  onStatusChange,
}: SavedOpportunityBoardProps) {
  const t = useCareerT();
  const statusOptions = useMemo(
    () =>
      getSavedOpportunityStatusOptions(t).filter(
        (
          option
        ): option is {
          id: SavedOpportunityBoardStatus;
          label: string;
        } => option.id !== "all" && option.id !== "hidden"
      ),
    [t]
  );

  const { locale } = useMessages();
  const [draggingOpportunityId, setDraggingOpportunityId] = useState<
    string | null
  >(null);
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const groupedItems = useMemo(() => {
    const next = new Map<
      SavedOpportunityBoardStatus,
      CareerHistoryOpportunity[]
    >();
    for (const option of statusOptions) {
      next.set(option.id, []);
    }
    for (const item of items) {
      const status = getSavedOpportunityManagementStatus(item);
      if (status !== "hidden") {
        next.get(status)?.push(item);
      }
    }
    return next;
  }, [items, statusOptions]);
  const handleBoardDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggingOpportunityId) return;

    const container = event.currentTarget;
    if (container.scrollWidth <= container.clientWidth) return;

    const rect = container.getBoundingClientRect();
    const leftDistance = event.clientX - rect.left;
    const rightDistance = rect.right - event.clientX;
    let scrollDelta = 0;

    if (leftDistance < BOARD_AUTO_SCROLL_EDGE_PX) {
      const intensity = Math.min(
        1,
        (BOARD_AUTO_SCROLL_EDGE_PX - leftDistance) / BOARD_AUTO_SCROLL_EDGE_PX
      );
      scrollDelta = -Math.ceil(intensity * BOARD_AUTO_SCROLL_MAX_STEP_PX);
    } else if (rightDistance < BOARD_AUTO_SCROLL_EDGE_PX) {
      const intensity = Math.min(
        1,
        (BOARD_AUTO_SCROLL_EDGE_PX - rightDistance) / BOARD_AUTO_SCROLL_EDGE_PX
      );
      scrollDelta = Math.ceil(intensity * BOARD_AUTO_SCROLL_MAX_STEP_PX);
    }

    if (scrollDelta !== 0) {
      container.scrollLeft += scrollDelta;
    }
  };

  return (
    <div className="overflow-x-auto pb-2" onDragOver={handleBoardDragOver}>
      <div className="flex w-max min-w-full gap-3">
        {statusOptions.map((column) => {
          const columnItems = groupedItems.get(column.id) ?? [];
          const loadState = columnLoadState[column.id];

          return (
            <div
              key={column.id}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!draggingOpportunityId) return;
                const item = itemById.get(draggingOpportunityId);
                if (!item) return;
                if (item.isInternal) return;
                if (!canChangeCareerOpportunityManagementStatus(item)) return;
                onStatusChange(item, column.id);
                setDraggingOpportunityId(null);
              }}
              className={cn(
                "min-h-[520px] w-[300px] shrink-0 rounded-[8px] border border-neutral-1000-a05 bg-bg-basement p-2 transition-colors",
                draggingOpportunityId && "bg-bg-weak"
              )}
            >
              <div className="flex items-center justify-between gap-2 px-1 py-1.5">
                <div className="min-w-0 truncate text-[13px] font-medium text-neutral-primary">
                  {column.label}
                </div>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-bg-weak px-1.5 text-[11px] font-medium text-neutral-primary">
                  {counts[column.id]}
                </span>
              </div>

              <div className="mt-2 space-y-2">
                {columnItems.map((item) => {
                  const pending = pendingOpportunityIds.has(item.id);
                  return (
                    <SavedOpportunityBoardCard
                      key={item.id}
                      item={item}
                      locale={locale}
                      pending={pending}
                      dragging={draggingOpportunityId === item.id}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingOpportunityId(item.id);
                      }}
                      onDragEnd={() => setDraggingOpportunityId(null)}
                      onInternalDecisionAction={
                        onInternalDecisionAction
                          ? (action) => onInternalDecisionAction(item, action)
                          : undefined
                      }
                      onOpenDetail={() => onOpenDetail(item)}
                    />
                  );
                })}

                {columnItems.length === 0 && loadState.loading ? (
                  <div className="flex items-center justify-center gap-2 rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-3 py-8 text-center text-[13px] font-medium text-neutral-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t(
                      "career.history.saved_opportunity_board.loading_column",
                      "불러오는 중"
                    )}
                  </div>
                ) : columnItems.length === 0 ? (
                  <div className="rounded-[8px] border border-dashed border-neutral-1000-a10 bg-bg-floating px-3 py-8 text-center text-[13px] font-medium text-neutral-muted">
                    {t(
                      "career.history.saved_opportunity_board.0965oie",
                      "여기에 드롭"
                    )}
                  </div>
                ) : null}

                {loadState.hasMore ? (
                  <BareButton
                    type="button"
                    disabled={loadState.loading}
                    onClick={() => onLoadMoreColumn(column.id)}
                    className="flex min-h-9 w-full items-center justify-center gap-2 rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-3 py-2 text-[12px] font-medium text-neutral-muted transition-colors hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadState.loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {loadState.loading
                      ? t(
                          "career.history.saved_opportunity_board.loading_more",
                          "불러오는 중"
                        )
                      : t(
                          "career.history.saved_opportunity_board.load_more",
                          "더 불러오기"
                        )}
                    {!loadState.loading ? (
                      <span className="text-neutral-soft">
                        {loadState.loadedCount}/{loadState.totalCount}
                      </span>
                    ) : null}
                  </BareButton>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(SavedOpportunityBoard);
