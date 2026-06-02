import { formatRelativeTime } from "@/lib/utils";
import { Building2, GripVertical, Loader2 } from "lucide-react";
import React, { useMemo, useState } from "react";
import { careerCx } from "../ui/CareerPrimitives";
import type { CareerHistoryOpportunity } from "../types";
import {
  getSavedOpportunityManagementStatus,
  SAVED_OPPORTUNITY_STATUS_OPTIONS,
  type SavedOpportunityManagementStatus,
} from "./savedOpportunityStatus";

type SavedOpportunityBoardProps = {
  counts: Record<SavedOpportunityManagementStatus, number>;
  items: CareerHistoryOpportunity[];
  pendingOpportunityIds: Set<string>;
  onOpenDetail: (item: CareerHistoryOpportunity) => void;
  onStatusChange: (
    item: CareerHistoryOpportunity,
    status: SavedOpportunityManagementStatus
  ) => void;
};

const BOARD_AUTO_SCROLL_EDGE_PX = 72;
const BOARD_AUTO_SCROLL_MAX_STEP_PX = 28;

const SavedOpportunityBoardCard = ({
  item,
  pending,
  dragging,
  onDragEnd,
  onDragStart,
  onOpenDetail,
}: {
  item: CareerHistoryOpportunity;
  pending: boolean;
  dragging: boolean;
  onDragEnd: () => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
  onOpenDetail: () => void;
}) => {
  const recommendedAgo = formatRelativeTime(item.recommendedAt);

  return (
    <button
      type="button"
      draggable={!pending}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpenDetail}
      disabled={pending}
      className={careerCx(
        "group w-full rounded-[8px] border border-beige900/10 bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-beige900/25 hover:bg-beige50 disabled:cursor-not-allowed disabled:opacity-60",
        dragging && "opacity-45"
      )}
    >
      <div className="flex items-start gap-1">
        {/* <GripVertical
          className="mt-1 h-4 w-4 shrink-0 text-black/45"
          strokeWidth={1.2}
        /> */}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {item.companyLogoUrl ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-beige900/10 bg-white p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.companyLogoUrl}
                  alt={item.companyName}
                  className="h-full w-full rounded-md object-cover"
                />
              </span>
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-beige900 text-beige50">
                <Building2 className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium leading-5 text-beige900">
                {item.companyName}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-black/65">
                {item.location} {item.workMode ? `· ${item.workMode}` : ""}
              </div>
            </div>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-beige900/65" />
            ) : null}
          </div>

          <div className="mt-3 line-clamp-2 text-[14px] font-normal leading-5 text-hblack900">
            {item.title}
          </div>
          {recommendedAgo ? (
            <div className="mt-2 truncate text-[12px] leading-4 text-black/65">
              {recommendedAgo}
            </div>
          ) : null}

          {item.isInternal ? (
            <span className="inline-flex h-5 items-center rounded-md border border-beige900/15 bg-beige200 px-1.5 text-[11px] font-medium leading-none text-beige900"></span>
          ) : null}
        </div>
      </div>
    </button>
  );
};

function SavedOpportunityBoard({
  counts,
  items,
  pendingOpportunityIds,
  onOpenDetail,
  onStatusChange,
}: SavedOpportunityBoardProps) {
  const [draggingOpportunityId, setDraggingOpportunityId] = useState<
    string | null
  >(null);
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const groupedItems = useMemo(() => {
    const next = new Map<
      SavedOpportunityManagementStatus,
      CareerHistoryOpportunity[]
    >();
    for (const option of SAVED_OPPORTUNITY_STATUS_OPTIONS) {
      next.set(option.id, []);
    }
    for (const item of items) {
      next.get(getSavedOpportunityManagementStatus(item))?.push(item);
    }
    return next;
  }, [items]);
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
        {SAVED_OPPORTUNITY_STATUS_OPTIONS.map((column) => {
          const columnItems = groupedItems.get(column.id) ?? [];

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
                onStatusChange(item, column.id);
                setDraggingOpportunityId(null);
              }}
              className={careerCx(
                "min-h-[520px] w-[300px] shrink-0 rounded-[8px] border border-beige900/10 bg-white/45 p-2 transition-colors",
                draggingOpportunityId && "bg-white/70"
              )}
            >
              <div className="flex items-center justify-between gap-2 px-1 py-1.5">
                <div className="min-w-0 truncate text-[13px] font-medium text-beige900">
                  {column.label}
                </div>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-beige500 px-1.5 text-[11px] font-medium text-beige900">
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
                      pending={pending}
                      dragging={draggingOpportunityId === item.id}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingOpportunityId(item.id);
                      }}
                      onDragEnd={() => setDraggingOpportunityId(null)}
                      onOpenDetail={() => onOpenDetail(item)}
                    />
                  );
                })}

                {columnItems.length === 0 ? (
                  <div className="rounded-[8px] border border-dashed border-beige900/15 bg-white/40 px-3 py-8 text-center text-[13px] font-medium text-beige900/65">
                    여기에 드롭
                  </div>
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
