import { CandidateTypeWithConnection } from "@/hooks/useSearchChatCandidates";
import { SearchSource, isScholarSearchSource } from "@/lib/searchSource";
import React, { useMemo, useRef, useState } from "react";
import CandidateRow from "./CandidatesListTable";
import CandidateCard from "./CandidatesList";
import { CandidateSortMode, useSettingStore } from "@/store/useSettingStore";
import { Tooltips } from "./ui/tooltip";
import {
  ArrowDownUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns2,
  GripVertical,
  Table,
} from "lucide-react";
import { useLogEvent } from "@/hooks/useLog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const asArr = (v: any) => (Array.isArray(v) ? v : []);
const INDEX_COLUMN_WIDTH = "56px";

type TableColumnDef = {
  id: string;
  label: string;
  width: string;
  draggable: boolean;
  kind:
    | "criteria"
    | "company"
    | "evidence"
    | "school"
    | "summary"
    | "memo"
    | "actions";
  tooltip?: string;
};

const arrayEquals = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const SORT_LABELS: Record<CandidateSortMode, string> = {
  best_matched: "Best matched",
  custom: "Custom",
};

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
}: {
  items: any[];
  userId: string;
  criterias: string[];
  isMyList?: boolean;
  showShortlistMemo?: boolean;
  indexStart?: number;
  sourceType?: SearchSource;
}) => {
  const {
    viewType,
    setViewType,
    columnOrderByKey,
    setColumnOrder,
    candidateSortModeByKey,
    setCandidateSortMode,
    candidateSortOrderByKey,
    setCandidateSortOrder,
  } = useSettingStore();
  const [isFolded, setIsFolded] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
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
  const canReorderColumns = isMyList;

  const contextKey = useMemo(
    () =>
      [
        "candidate-table-order",
        isMyList ? "mylist" : "search",
        showShortlistMemo ? "memo-on" : "memo-off",
        sourceType,
        criteriaList.join("||"),
      ].join(":"),
    [criteriaList, isMyList, showShortlistMemo, sourceType]
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
  const [draftSortMode, setDraftSortMode] =
    useState<CandidateSortMode>(savedSortMode);
  const [draftSortOrder, setDraftSortOrder] =
    useState<string[]>(savedSortOrder);

  React.useEffect(() => {
    if (isSortMenuOpen) return;
    setDraftSortMode(savedSortMode);
    setDraftSortOrder(savedSortOrder);
  }, [isSortMenuOpen, savedSortMode, savedSortOrder]);

  const dynamicColumns = useMemo<TableColumnDef[]>(() => {
    const cols: TableColumnDef[] = [];
    const defaultCols = isMyList ? "280px" : "240px";
    const criteriaWidth = isFolded ? "60px" : "140px";

    criteriaList.forEach((criteria, idx) => {
      cols.push({
        id: `criteria:${idx}`,
        label: criteria,
        tooltip: criteria,
        width: criteriaWidth,
        draggable: canReorderColumns,
        kind: "criteria",
      });
    });

    cols.push({
      id: "company",
      label: isScholarSource ? "Affiliation" : "Company",
      width: defaultCols,
      draggable: canReorderColumns,
      kind: "company",
    });
    cols.push({
      id: "school",
      label: isScholarSource ? "Research" : "School",
      width: defaultCols,
      draggable: canReorderColumns,
      kind: "school",
    });

    if (isScholarSource) {
      cols.push({
        id: "evidence",
        label: "Related paper",
        width: "340px",
        draggable: false,
        kind: "evidence",
      });
    }

    if (!isScholarSource && !isMyList && criteriaList.length > 0) {
      cols.push({
        id: "actions",
        label: "",
        width: "80px",
        draggable: false,
        kind: "actions",
      });
    }

    if (isMyList) {
      cols.push({
        id: "summary",
        label: "Summary",
        width: "520px",
        draggable: canReorderColumns,
        kind: "summary",
      });
      if (showShortlistMemo) {
        cols.push({
          id: "memo",
          label: "Memo",
          width: "420px",
          draggable: canReorderColumns,
          kind: "memo",
        });
      }
    }
    return cols;
  }, [
    canReorderColumns,
    criteriaList,
    isFolded,
    isMyList,
    isScholarSource,
    showShortlistMemo,
  ]);

  const defaultColumnIds = useMemo(
    () => dynamicColumns.map((col) => col.id),
    [dynamicColumns]
  );

  const savedColumnIds = useMemo(
    () => columnOrderByKey[contextKey] ?? [],
    [columnOrderByKey, contextKey]
  );

  const orderedColumnIds = useMemo(() => {
    const moveEvidenceToEnd = (ids: string[]) => {
      if (!ids.includes("evidence")) return ids;
      return [...ids.filter((id) => id !== "evidence"), "evidence"];
    };

    if (!canReorderColumns) {
      return moveEvidenceToEnd(defaultColumnIds);
    }
    const validSaved = savedColumnIds.filter((id) =>
      defaultColumnIds.includes(id)
    );
    const missing = defaultColumnIds.filter((id) => !validSaved.includes(id));
    return moveEvidenceToEnd([...validSaved, ...missing]);
  }, [savedColumnIds, defaultColumnIds, canReorderColumns]);

  const columnById = useMemo(() => {
    const map = new Map<string, TableColumnDef>();
    for (const column of dynamicColumns) {
      map.set(column.id, column);
    }
    return map;
  }, [dynamicColumns]);

  const profileWidth = isMyList ? "320px" : "280px";
  const gridTemplateColumns = useMemo(() => {
    const dynamicWidths = orderedColumnIds.map(
      (id) => columnById.get(id)?.width ?? "180px"
    );
    return [INDEX_COLUMN_WIDTH, profileWidth, ...dynamicWidths].join(" ");
  }, [orderedColumnIds, columnById, profileWidth]);

  const lastCriteriaColumnId = useMemo(() => {
    const criteriaIds = orderedColumnIds.filter((id) =>
      id.startsWith("criteria:")
    );
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

  const moveDraftSortCriterion = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draftSortOrder.length) return;

    const next = [...draftSortOrder];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    setDraftSortOrder(next);
  };

  const applySortSettings = () => {
    setCandidateSortMode(sortContextKey, draftSortMode);
    setCandidateSortOrder(sortContextKey, draftSortOrder);
    setIsSortMenuOpen(false);
  };

  const onDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    columnId: string
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
    targetColumnId: string
  ) => {
    const target = columnById.get(targetColumnId);
    if (!draggingColumnId || !target?.draggable) return;
    if (draggingColumnId === targetColumnId) return;
    e.preventDefault();
    setDragOverColumnId(targetColumnId);
  };

  const onDrop = (
    e: React.DragEvent<HTMLDivElement>,
    targetColumnId: string
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
            {!isMyList && criteriaList.length > 0 && (
              <DropdownMenu
                open={isSortMenuOpen}
                onOpenChange={setIsSortMenuOpen}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-hgray900 transition-all duration-200 hover:bg-white/10"
                  >
                    <ArrowDownUp className="h-3.5 w-3.5" strokeWidth={1.6} />
                    <span>{SORT_LABELS[savedSortMode]}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-hgray600" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-[280px] rounded-2xl border-white/10 bg-ngray300/70 p-2 backdrop-blur-sm"
                >
                  <div className="px-2 pb-2 text-[11px] text-hgray600">
                    Sorting
                  </div>
                  <div className="flex flex-col gap-1">
                    {(["best_matched", "custom"] as CandidateSortMode[]).map(
                      (mode) => {
                        const checked = draftSortMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setDraftSortMode(mode)}
                            className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-all duration-200 ${
                              checked ? "bg-white/10" : "hover:bg-white/5"
                            }`}
                          >
                            <span className="text-hgray900">
                              {SORT_LABELS[mode]}
                            </span>
                            {checked ? (
                              <span className="h-2 w-2 rounded-full bg-accenta1" />
                            ) : null}
                          </button>
                        );
                      }
                    )}
                  </div>

                  {draftSortMode === "custom" && (
                    <div className="mt-3">
                      <div className="px-2 pb-2 text-[11px] text-hgray600">
                        Criteria priority
                      </div>
                      <div className="flex flex-col gap-1">
                        {draftSortOrder.map((criterionId, idx) => {
                          const criterionIdx = Number(
                            criterionId.split(":")[1]
                          );
                          const label =
                            criteriaList[criterionIdx] ?? criterionId;

                          return (
                            <div
                              key={criterionId}
                              className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2"
                            >
                              <span className="min-w-0 flex-1 truncate text-sm text-hgray900">
                                {label}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    moveDraftSortCriterion(idx, -1)
                                  }
                                  disabled={idx === 0}
                                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-hgray900 transition-all duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveDraftSortCriterion(idx, 1)}
                                  disabled={idx === draftSortOrder.length - 1}
                                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-hgray900 transition-all duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-end gap-2 px-1 font-normal">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftSortMode(savedSortMode);
                        setDraftSortOrder(savedSortOrder);
                        setIsSortMenuOpen(false);
                      }}
                      className="rounded-full px-3 py-1.5 text-xs text-hgray700 transition-all duration-200 hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={applySortSettings}
                      className="rounded-full bg-accenta1 px-3 py-1.5 text-xs text-black transition-all duration-200 hover:opacity-90"
                    >
                      Apply
                    </button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Tooltips text="Table view">
              <button
                className={`cursor-pointer p-1.5 rounded-sm hover:bg-white/10 transition-all duration-200 ${
                  viewType === "table" ? "bg-white/10" : ""
                }`}
                onClick={() => changeViewType("table")}
              >
                <Table className="w-4 h-4" strokeWidth={1.6} />
              </button>
            </Tooltips>
            <Tooltips text="Card view">
              <button
                className={`cursor-pointer p-1.5 rounded-sm hover:bg-white/10 transition-all duration-200 ${
                  viewType === "card" ? "bg-white/10" : ""
                }`}
                onClick={() => changeViewType("card")}
              >
                <Columns2 className="w-4 h-4" strokeWidth={1.6} />
              </button>
            </Tooltips>
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
                          <div className="w-full pl-2 pr-7 text-left truncate border-r border-white/5">
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
                    showShortlistMemo={showShortlistMemo}
                    gridTemplateColumns={gridTemplateColumns}
                    rowIndex={indexStart + idx}
                    sourceType={sourceType}
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
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(CandidateViews);
