import { CandidateTypeWithConnection } from "@/hooks/useSearchChatCandidates";
import { SearchSource, isScholarSearchSource } from "@/lib/searchSource";
import { SharedFolderViewerIdentity } from "@/lib/sharedFolder";
import React, { useMemo, useRef, useState } from "react";
import CandidateRow from "./CandidatesListTable";
import CandidateCard from "./CandidatesList";
import {
  buildCandidateTableGridTemplateColumns,
  CandidateTableColumnDef,
  CandidateTableDetachedColumnLayout,
  CandidateTableColumnId,
  CandidateTableStaticColumnId,
  createCandidateTableColumnMap,
  createCandidateTableColumns,
  getCandidateTableDetachedColumnLayout,
  getCandidateTableProfileWidth,
  getOrderedCandidateTableColumnIds,
  isCriteriaColumnId,
} from "./candidateTableColumns";
import { useSettingStore } from "@/store/useSettingStore";
import { Tooltips } from "./ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  GripVertical,
  Table,
} from "lucide-react";
import { useLogEvent } from "@/hooks/useLog";

const asArr = (v: any) => (Array.isArray(v) ? v : []);

const arrayEquals = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const SCORE_WEIGHT: Record<string, number> = {
  만족: 3,
  모호: 2,
  불만족: 1,
};

function parseCandidateScores(candidate: CandidateTypeWithConnection) {
  const rawText = candidate.synthesized_summary?.[0]?.text;
  if (!rawText) return [];

  try {
    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: unknown) =>
      String(item ?? "")
        .split(",")[0]
        ?.trim()
    );
  } catch {
    return [];
  }
}

const CandidateViews = ({
  items,
  userId,
  criterias = [],
  isMyList = false,
  showShortlistMemo = false,
  indexStart = 0,
  sourceType = "linkedin",
  buildProfileHref,
  showBookmarkAction,
  showMarkAction,
  sharedFolderContext,
}: {
  items: any[];
  userId?: string;
  criterias: string[];
  isMyList?: boolean;
  showShortlistMemo?: boolean;
  indexStart?: number;
  sourceType?: SearchSource;
  buildProfileHref?: (candidate: CandidateTypeWithConnection) => string;
  showBookmarkAction?: boolean;
  showMarkAction?: boolean;
  sharedFolderContext?: {
    token: string;
    viewer: SharedFolderViewerIdentity | null;
  } | null;
}) => {
  const {
    viewType,
    setViewType,
    columnOrderByKey,
    setColumnOrder,
    candidateSortModeByKey,
    candidateSortOrderByKey,
  } = useSettingStore();
  const [isFolded, setIsFolded] = useState(true);
  const [draggingColumnId, setDraggingColumnId] =
    useState<CandidateTableColumnId | null>(null);
  const [dragOverColumnId, setDragOverColumnId] =
    useState<CandidateTableColumnId | null>(null);
  const transparentDragImageRef = useRef<HTMLCanvasElement | null>(null);
  const logEvent = useLogEvent();

  const toggleFold = () => {
    setIsFolded(!isFolded);
  };

  const changeViewType = async (type: "table" | "card") => {
    setViewType(type);
    if (userId) await logEvent(type);
  };

  const criteriaList = useMemo(
    () => asArr(criterias).map((c) => String(c ?? "")),
    [criterias]
  );
  const isScholarSource = isScholarSearchSource(sourceType);
  const hasSharedFolderNotes = Boolean(sharedFolderContext?.token);
  const shouldShowBookmarkAction =
    showBookmarkAction ?? (Boolean(userId) && !hasSharedFolderNotes);
  const shouldShowMarkAction =
    showMarkAction ?? (Boolean(userId) && !hasSharedFolderNotes);
  const canReorderColumns = isMyList;

  const contextKey = useMemo(
    () =>
      [
        "candidate-table-order",
        isMyList ? "mylist" : "search",
        showShortlistMemo ? "memo-on" : "memo-off",
        shouldShowMarkAction ? "mark-on" : "mark-off",
        hasSharedFolderNotes ? "shared-notes-on" : "shared-notes-off",
        sourceType,
        criteriaList.join("||"),
      ].join(":"),
    [
      criteriaList,
      hasSharedFolderNotes,
      isMyList,
      shouldShowMarkAction,
      showShortlistMemo,
      sourceType,
    ]
  );
  const sortContextKey = useMemo(
    () =>
      [
        "candidate-sort",
        isMyList ? "mylist" : "search",
        sourceType,
        criteriaList.join("||"),
      ].join(":"),
    [criteriaList, isMyList, sourceType]
  );
  const defaultSortOrder = useMemo(
    () => criteriaList.map((_, idx) => `criteria:${idx}`),
    [criteriaList]
  );
  const savedSortMode =
    candidateSortModeByKey[sortContextKey] ?? "best_matched";
  const savedSortOrder = useMemo(() => {
    const stored = candidateSortOrderByKey[sortContextKey] ?? [];
    const validStored = stored.filter((id) => defaultSortOrder.includes(id));
    const missing = defaultSortOrder.filter((id) => !validStored.includes(id));
    return [...validStored, ...missing];
  }, [candidateSortOrderByKey, defaultSortOrder, sortContextKey]);

  const dynamicColumns = useMemo<CandidateTableColumnDef[]>(() => {
    return createCandidateTableColumns({
      criteriaList,
      canReorderColumns,
      hasSharedFolderNotes,
      isFolded,
      isMyList,
      isScholarSource,
      shouldShowMarkAction,
      showShortlistMemo,
    });
  }, [
    canReorderColumns,
    criteriaList,
    hasSharedFolderNotes,
    isFolded,
    isMyList,
    isScholarSource,
    shouldShowMarkAction,
    showShortlistMemo,
  ]);

  const savedColumnIds = useMemo(
    () => columnOrderByKey[contextKey] ?? [],
    [columnOrderByKey, contextKey]
  );

  const orderedColumnIds = useMemo(() => {
    return getOrderedCandidateTableColumnIds(
      dynamicColumns,
      savedColumnIds,
      canReorderColumns
    );
  }, [canReorderColumns, dynamicColumns, savedColumnIds]);

  const columnById = useMemo(
    () => createCandidateTableColumnMap(dynamicColumns),
    [dynamicColumns]
  );

  const profileWidth = getCandidateTableProfileWidth(isMyList);
  const gridTemplateColumns = useMemo(() => {
    return buildCandidateTableGridTemplateColumns(
      orderedColumnIds,
      columnById,
      profileWidth
    );
  }, [orderedColumnIds, columnById, profileWidth]);
  const sharedNotesLayout = useMemo<CandidateTableDetachedColumnLayout | null>(
    () => {
      if (!hasSharedFolderNotes) return null;

      return getCandidateTableDetachedColumnLayout(
        CandidateTableStaticColumnId.SharedNotes,
        orderedColumnIds,
        columnById,
        profileWidth
      );
    },
    [columnById, hasSharedFolderNotes, orderedColumnIds, profileWidth]
  );

  const lastCriteriaColumnId = useMemo(() => {
    const criteriaIds = orderedColumnIds.filter((id) => isCriteriaColumnId(id));
    return criteriaIds.at(-1) ?? null;
  }, [orderedColumnIds]);
  const sortedItems = useMemo(() => {
    if (savedSortMode !== "custom" || savedSortOrder.length === 0) {
      return items;
    }

    return [...items].sort((left, right) => {
      const leftScores = parseCandidateScores(left);
      const rightScores = parseCandidateScores(right);

      for (const criteriaId of savedSortOrder) {
        const idx = Number(criteriaId.split(":")[1]);
        const leftWeight = SCORE_WEIGHT[leftScores[idx] ?? ""] ?? 0;
        const rightWeight = SCORE_WEIGHT[rightScores[idx] ?? ""] ?? 0;

        if (leftWeight !== rightWeight) {
          return rightWeight - leftWeight;
        }
      }

      return 0;
    });
  }, [items, savedSortMode, savedSortOrder]);

  const onDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    columnId: CandidateTableColumnId
  ) => {
    const column = columnById.get(columnId);
    if (!column || !column.draggable) return;
    setDraggingColumnId(columnId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", columnId);
    if (!transparentDragImageRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      transparentDragImageRef.current = canvas;
    }
    e.dataTransfer.setDragImage(transparentDragImageRef.current, 0, 0);
  };

  const onDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    targetColumnId: CandidateTableColumnId
  ) => {
    const target = columnById.get(targetColumnId);
    if (!draggingColumnId || !target?.draggable) return;
    if (draggingColumnId === targetColumnId) return;
    e.preventDefault();
    setDragOverColumnId(targetColumnId);
  };

  const onDrop = (
    e: React.DragEvent<HTMLDivElement>,
    targetColumnId: CandidateTableColumnId
  ) => {
    e.preventDefault();
    const target = columnById.get(targetColumnId);
    if (!draggingColumnId || !target?.draggable) return;

    const fromIndex = orderedColumnIds.indexOf(draggingColumnId);
    const toIndex = orderedColumnIds.indexOf(targetColumnId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      setDraggingColumnId(null);
      setDragOverColumnId(null);
      return;
    }

    const next = [...orderedColumnIds];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    if (!arrayEquals(next, orderedColumnIds)) {
      setColumnOrder(contextKey, next);
    }

    setDraggingColumnId(null);
    setDragOverColumnId(null);
  };

  const onDragEnd = () => {
    setDraggingColumnId(null);
    setDragOverColumnId(null);
  };

  return (
    <div className="w-full relative h-full">
      {sortedItems.length > 0 && (
        <div className="w-full flex flex-row items-center justify-between mt-2 px-4">
          <div></div>
          <div className="flex flex-row items-center justify-start gap-2">
            <div className="relative inline-flex rounded-lg bg-black/10 border border-white/5">
              <span
                aria-hidden="true"
                className="absolute left-0.5 top-0.5 h-7 w-8 rounded-md bg-white/20 transition-transform duration-300 ease-out"
                style={{
                  transform:
                    viewType === "table" ? "translateX(0)" : "translateX(36px)",
                }}
              />
              <Tooltips text="Table view">
                <button
                  type="button"
                  className="relative z-10 flex h-8 w-9 items-center justify-center rounded-lg text-white/80 transition-colors duration-200 hover:text-white"
                  onClick={() => changeViewType("table")}
                >
                  <Table className="h-4 w-4" strokeWidth={1.6} />
                </button>
              </Tooltips>
              <Tooltips text="Card view">
                <button
                  type="button"
                  className="relative z-10 flex h-8 w-9 items-center justify-center rounded-lg text-white/80 transition-colors duration-200 hover:text-white"
                  onClick={() => changeViewType("card")}
                >
                  <Columns2 className="h-4 w-4" strokeWidth={1.6} />
                </button>
              </Tooltips>
            </div>
          </div>
        </div>
      )}

      {viewType === "table" && sortedItems.length > 0 && (
        <div className="w-full mt-2 h-full flex">
          <div
            className="w-full overflow-x-auto pb-26
            [scrollbar-width:none]
            [-ms-overflow-style:none]
            [&::-webkit-scrollbar]:hidden"
          >
            <div className="w-max min-w-full">
              <div
                className="inline-grid items-center py-2 text-xs text-hgray800 font-light bg-hgray200 border-y border-white/5 w-full relative"
                style={{ gridTemplateColumns }}
              >
                <div className="sticky left-0 z-30 bg-hgray200 w-full border-r border-white/5 h-full" />
                <div className="sticky left-14 z-30 px-4 bg-hgray200 border-r border-white/5">
                  프로필
                </div>

                {orderedColumnIds.map((columnId) => {
                  const column = columnById.get(columnId);
                  if (!column) return null;

                  const isDragOverTarget =
                    !!draggingColumnId &&
                    dragOverColumnId === columnId &&
                    draggingColumnId !== columnId &&
                    column.draggable;

                  if (column.kind === "criteria") {
                    return (
                      <div
                        key={columnId}
                        draggable={column.draggable}
                        onDragStart={(e) => onDragStart(e, columnId)}
                        onDragOver={(e) => onDragOver(e, columnId)}
                        onDrop={(e) => onDrop(e, columnId)}
                        onDragEnd={onDragEnd}
                        className="relative"
                      >
                        {isDragOverTarget && (
                          <span className="pointer-events-none absolute left-0 top-0 h-full w-[2px] bg-accenta1" />
                        )}
                        <Tooltips text={column.tooltip ?? column.label}>
                          <div className="w-full pl-2 pr-4 text-left truncate border-r border-white/5">
                            {column.label}
                          </div>
                        </Tooltips>
                        {column.draggable && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-hgray700/80">
                            <GripVertical className="w-3 h-3" />
                          </span>
                        )}

                        {!isMyList && columnId === lastCriteriaColumnId && (
                          <div
                            onClick={toggleFold}
                            className="absolute top-[-8px] right-0 bg-hgray300 p-0.5 rounded-bl-lg cursor-pointer h-4 w-4 hover:bg-hgray400 transition-colors duration-200"
                          >
                            {isFolded ? (
                              <ChevronRight className="w-3 h-3 absolute top-[1px] right-[1px]" />
                            ) : (
                              <ChevronLeft className="w-3 h-3 absolute top-[1px] right-[1px]" />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={columnId}
                      draggable={column.draggable}
                      onDragStart={(e) => onDragStart(e, columnId)}
                      onDragOver={(e) => onDragOver(e, columnId)}
                      onDrop={(e) => onDrop(e, columnId)}
                      onDragEnd={onDragEnd}
                      className={`relative px-4 flex items-center justify-between gap-2 border-r border-white/5 ${
                        column.draggable ? "cursor-grab" : "cursor-default"
                      }`}
                    >
                      {isDragOverTarget && (
                        <span className="pointer-events-none absolute left-0 top-0 h-full w-[2px] bg-accenta1" />
                      )}
                      <span>{column.label}</span>
                      {column.draggable && (
                        <span className="text-hgray900/50">
                          <GripVertical className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  );
                })}

                <div aria-hidden="true" className="h-full" />
              </div>

              <div className="pb-48">
                {sortedItems.map((c: any, idx: number) => (
                  <CandidateRow
                    isMyList={isMyList}
                    key={c?.id}
                    c={c as CandidateTypeWithConnection}
                    userId={userId}
                    criterias={criteriaList}
                    orderedColumnIds={orderedColumnIds}
                    gridTemplateColumns={gridTemplateColumns}
                    rowIndex={indexStart + idx}
                    sourceType={sourceType}
                    buildProfileHref={buildProfileHref}
                    showBookmarkAction={shouldShowBookmarkAction}
                    showMarkAction={shouldShowMarkAction}
                    sharedNotesLayout={sharedNotesLayout}
                    sharedFolderContext={sharedFolderContext ?? null}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewType === "card" && sortedItems.length > 0 && (
        <div className="w-full flex flex-col space-y-2 mt-4 items-center justify-center">
          <div className="space-y-4 w-full items-center justify-center flex flex-col pb-48">
            {sortedItems.map((c: any) => (
              <CandidateCard
                isMyList={isMyList}
                key={c?.id}
                c={c as CandidateTypeWithConnection}
                userId={userId}
                criterias={criteriaList}
                showShortlistMemo={showShortlistMemo}
                sourceType={sourceType}
                buildProfileHref={buildProfileHref}
                showBookmarkAction={shouldShowBookmarkAction}
                showMarkAction={shouldShowMarkAction}
                sharedFolderContext={sharedFolderContext ?? null}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(CandidateViews);
