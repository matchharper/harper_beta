import { CandidateTypeWithConnection } from "@/hooks/useSearchChatCandidates";
import React, { useMemo, useRef, useState } from "react";
import CandidateRow from "./CandidatesListTable";
import CandidateCard from "./CandidatesList";
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
const INDEX_COLUMN_WIDTH = "56px";

type TableColumnDef = {
  id: string;
  label: string;
  width: string;
  draggable: boolean;
  kind: "criteria" | "company" | "school" | "summary" | "memo" | "actions";
  tooltip?: string;
};

const arrayEquals = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const CandidateViews = ({
  items,
  userId,
  criterias = [],
  isMyList = false,
  showShortlistMemo = false,
  indexStart = 0,
}: {
  items: any[];
  userId: string;
  criterias: string[];
  isMyList?: boolean;
  showShortlistMemo?: boolean;
  indexStart?: number;
}) => {
  const { viewType, setViewType, columnOrderByKey, setColumnOrder } =
    useSettingStore();
  const [isFolded, setIsFolded] = useState(false);
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
  const canReorderColumns = isMyList;

  const contextKey = useMemo(
    () =>
      [
        "candidate-table-order",
        isMyList ? "mylist" : "search",
        showShortlistMemo ? "memo-on" : "memo-off",
        criteriaList.join("||"),
      ].join(":"),
    [isMyList, showShortlistMemo, criteriaList]
  );

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
      label: "Company",
      width: defaultCols,
      draggable: canReorderColumns,
      kind: "company",
    });
    cols.push({
      id: "school",
      label: "School",
      width: defaultCols,
      draggable: canReorderColumns,
      kind: "school",
    });

    if (!isMyList && criteriaList.length > 0) {
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
  }, [criteriaList, isFolded, isMyList, showShortlistMemo, canReorderColumns]);

  const defaultColumnIds = useMemo(
    () => dynamicColumns.map((col) => col.id),
    [dynamicColumns]
  );

  const savedColumnIds = useMemo(
    () => columnOrderByKey[contextKey] ?? [],
    [columnOrderByKey, contextKey]
  );

  const orderedColumnIds = useMemo(() => {
    if (!canReorderColumns) {
      return defaultColumnIds;
    }
    const validSaved = savedColumnIds.filter((id) =>
      defaultColumnIds.includes(id)
    );
    const missing = defaultColumnIds.filter((id) => !validSaved.includes(id));
    return [...validSaved, ...missing];
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
      {items.length > 0 && (
        <div className="w-full flex flex-row items-center justify-between mt-2 px-4">
          <div></div>
          <div className="flex flex-row items-center justify-start gap-2">
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

      {viewType === "table" && items.length > 0 && (
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
                {items.map((c: any, idx: number) => (
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
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewType === "card" && items.length > 0 && (
        <div className="w-full flex flex-col space-y-2 mt-4 items-center justify-center">
          <div className="space-y-4 w-full items-center justify-center flex flex-col pb-48">
            {items.map((c: any) => (
              <CandidateCard
                isMyList={isMyList}
                key={c?.id}
                c={c as CandidateTypeWithConnection}
                userId={userId}
                criterias={criteriaList}
                showShortlistMemo={showShortlistMemo}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(CandidateViews);
