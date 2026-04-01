import { CandidateTypeWithConnection } from "@/hooks/useSearchChatCandidates";
import {
  CANDIDATE_MARK_OPTIONS,
  type CandidateMarkStatus,
  isCandidateMarkStatus,
} from "@/lib/candidateMark";
import { SearchSource, isScholarSearchSource } from "@/lib/searchSource";
import { SharedFolderViewerIdentity } from "@/lib/sharedFolder";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import {
  getCandidateMarkFilterStorageKey,
  normalizeCandidateMarkFilter,
  useSettingStore,
} from "@/store/useSettingStore";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "./ui/action-dropdown";
import { DropdownMenuCheckboxItem } from "./ui/dropdown-menu";
import { Tooltips } from "./ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Filter,
  GripVertical,
  Table,
  Unlock,
} from "lucide-react";
import { useLogEvent } from "@/hooks/useLog";
import { useRevealCandidateProfiles } from "@/hooks/useRevealCandidateProfile";
import { showToast } from "./toast/toast";

const asArr = (v: any) => (Array.isArray(v) ? v : []);

const arrayEquals = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const SCORE_WEIGHT: Record<string, number> = {
  만족: 3,
  모호: 2,
  불만족: 1,
};

const FILTER_LABEL_BY_STATUS = {
  not_fit: "부적합 제외",
  hold: "보류 제외",
  fit: "적합 제외",
} satisfies Record<CandidateMarkStatus, string>;

function getBaseCandidateMarkStatus(
  candidate: CandidateTypeWithConnection
): CandidateMarkStatus | null {
  const status = candidate?.candidate_mark?.status;
  return isCandidateMarkStatus(status) ? status : null;
}

function formatAppliedFilterSummary(
  statuses: CandidateMarkStatus[],
  excludeUnopenedProfiles: boolean
) {
  const labels = [...statuses.map((status) => FILTER_LABEL_BY_STATUS[status])];

  if (excludeUnopenedProfiles) {
    labels.push("열람하지 않은 프로필 제외");
  }

  return labels.length > 0 ? labels.join(", ") : "전체보기";
}

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
  showMarkFilter = false,
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
  showMarkFilter?: boolean;
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
    candidateMarkFilterByKey,
    setCandidateMarkFilter,
    candidateExcludeUnopenedByKey,
    setCandidateExcludeUnopened,
  } = useSettingStore();
  const [isFolded, setIsFolded] = useState(true);
  const [draggingColumnId, setDraggingColumnId] =
    useState<CandidateTableColumnId | null>(null);
  const [dragOverColumnId, setDragOverColumnId] =
    useState<CandidateTableColumnId | null>(null);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [draftExcludedStatuses, setDraftExcludedStatuses] = useState<
    CandidateMarkStatus[]
  >([]);
  const [draftExcludeUnopenedProfiles, setDraftExcludeUnopenedProfiles] =
    useState(false);
  const [
    markStatusOverridesByCandidateId,
    setMarkStatusOverridesByCandidateId,
  ] = useState<Record<string, CandidateMarkStatus | null>>({});
  const transparentDragImageRef = useRef<HTMLCanvasElement | null>(null);
  const logEvent = useLogEvent();
  const bulkRevealMutation = useRevealCandidateProfiles();

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
  const canUseMarkFilter = showMarkFilter && !hasSharedFolderNotes && !isMyList;
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
  const filterContextKey = useMemo(
    () => getCandidateMarkFilterStorageKey(isMyList),
    [isMyList]
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
  const appliedExcludedStatuses = useMemo(
    () =>
      normalizeCandidateMarkFilter(
        candidateMarkFilterByKey[filterContextKey] ?? []
      ),
    [candidateMarkFilterByKey, filterContextKey]
  );
  const appliedExcludeUnopenedProfiles = useMemo(
    () => candidateExcludeUnopenedByKey[filterContextKey] === true,
    [candidateExcludeUnopenedByKey, filterContextKey]
  );
  const appliedFilterSummary = useMemo(
    () =>
      formatAppliedFilterSummary(
        appliedExcludedStatuses,
        appliedExcludeUnopenedProfiles
      ),
    [appliedExcludeUnopenedProfiles, appliedExcludedStatuses]
  );
  const hasPendingFilterChanges = useMemo(
    () =>
      !arrayEquals(draftExcludedStatuses, appliedExcludedStatuses) ||
      draftExcludeUnopenedProfiles !== appliedExcludeUnopenedProfiles,
    [
      appliedExcludeUnopenedProfiles,
      appliedExcludedStatuses,
      draftExcludeUnopenedProfiles,
      draftExcludedStatuses,
    ]
  );

  useEffect(() => {
    if (!isFilterMenuOpen) return;
    setDraftExcludedStatuses(appliedExcludedStatuses);
    setDraftExcludeUnopenedProfiles(appliedExcludeUnopenedProfiles);
  }, [
    appliedExcludeUnopenedProfiles,
    appliedExcludedStatuses,
    isFilterMenuOpen,
  ]);

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
  const sharedNotesLayout =
    useMemo<CandidateTableDetachedColumnLayout | null>(() => {
      if (!hasSharedFolderNotes) return null;

      return getCandidateTableDetachedColumnLayout(
        CandidateTableStaticColumnId.SharedNotes,
        orderedColumnIds,
        columnById,
        profileWidth
      );
    }, [columnById, hasSharedFolderNotes, orderedColumnIds, profileWidth]);

  const lastCriteriaColumnId = useMemo(() => {
    const criteriaIds = orderedColumnIds.filter((id) => isCriteriaColumnId(id));
    return criteriaIds.at(-1) ?? null;
  }, [orderedColumnIds]);
  const candidateBaseMarkStatusById = useMemo(() => {
    return items.reduce<Record<string, CandidateMarkStatus | null>>(
      (acc, item) => {
        const candidateId = String(item?.id ?? "");
        if (!candidateId) return acc;
        acc[candidateId] = getBaseCandidateMarkStatus(
          item as CandidateTypeWithConnection
        );
        return acc;
      },
      {}
    );
  }, [items]);
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
  const filteredItems = useMemo(() => {
    if (
      !canUseMarkFilter ||
      (appliedExcludedStatuses.length === 0 && !appliedExcludeUnopenedProfiles)
    ) {
      return sortedItems;
    }

    return sortedItems.filter((candidate) => {
      if (
        appliedExcludeUnopenedProfiles &&
        candidate?.profile_revealed === false
      ) {
        return false;
      }

      const candidateId = String(candidate?.id ?? "");
      const overrideStatus = markStatusOverridesByCandidateId[candidateId];
      const effectiveStatus =
        overrideStatus === undefined
          ? getBaseCandidateMarkStatus(candidate as CandidateTypeWithConnection)
          : overrideStatus;

      return (
        effectiveStatus == null ||
        !appliedExcludedStatuses.includes(effectiveStatus)
      );
    });
  }, [
    appliedExcludedStatuses,
    appliedExcludeUnopenedProfiles,
    canUseMarkFilter,
    markStatusOverridesByCandidateId,
    sortedItems,
  ]);
  const unopenedCandidateIds = useMemo(
    () =>
      filteredItems
        .map((candidate) =>
          candidate?.profile_revealed === false
            ? String(candidate?.id ?? "").trim()
            : ""
        )
        .filter(Boolean),
    [filteredItems]
  );
  const unopenedCandidateCount = unopenedCandidateIds.length;

  const handleFilterMenuOpenChange = (open: boolean) => {
    if (open) {
      setDraftExcludedStatuses(appliedExcludedStatuses);
      setDraftExcludeUnopenedProfiles(appliedExcludeUnopenedProfiles);
    }
    setIsFilterMenuOpen(open);
  };

  const toggleDraftExcludedStatus = (status: CandidateMarkStatus) => {
    setDraftExcludedStatuses((current) => {
      if (current.includes(status)) {
        return current.filter((value) => value !== status);
      }
      return normalizeCandidateMarkFilter([...current, status]);
    });
  };

  const applyExcludedMarkFilter = () => {
    setCandidateMarkFilter(filterContextKey, draftExcludedStatuses);
    setCandidateExcludeUnopened(filterContextKey, draftExcludeUnopenedProfiles);
    setIsFilterMenuOpen(false);
  };

  const resetExcludedMarkFilter = () => {
    setCandidateMarkFilter(filterContextKey, []);
    setCandidateExcludeUnopened(filterContextKey, false);
    setDraftExcludedStatuses([]);
    setDraftExcludeUnopenedProfiles(false);
    setIsFilterMenuOpen(false);
  };

  const handleCandidateMarkChange = (
    candidateId: string,
    status: CandidateMarkStatus | null
  ) => {
    const baseStatus = candidateBaseMarkStatusById[candidateId] ?? null;

    setMarkStatusOverridesByCandidateId((current) => {
      if (status === baseStatus) {
        if (!(candidateId in current)) return current;
        const next = { ...current };
        delete next[candidateId];
        return next;
      }

      return {
        ...current,
        [candidateId]: status,
      };
    });
  };

  const handleBulkOpenProfiles = async () => {
    if (unopenedCandidateIds.length === 0) return;

    try {
      const result = await bulkRevealMutation.mutateAsync(unopenedCandidateIds);
      const message =
        result.revealedCount > 0 && result.alreadyRevealedCount > 0
          ? `현재 페이지의 프로필 ${result.revealedCount}개를 열람했고, ${result.alreadyRevealedCount}개는 이미 열람 상태였습니다.`
          : result.revealedCount > 0
            ? `현재 페이지의 프로필 ${result.revealedCount}개를 열람했습니다.`
            : "현재 페이지의 프로필은 모두 이미 열람 상태입니다.";

      showToast({
        message,
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "현재 페이지의 프로필 열람에 실패했습니다.",
        variant: "white",
      });
    }
  };

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
        <div className="sticky top-0 z-50 w-full flex flex-row items-center justify-between pb-2 px-4">
          <div className="flex min-w-0 items-center gap-3"></div>
          <div className="flex flex-row items-center justify-start gap-2">
            {!hasSharedFolderNotes && userId ? (
              <>
                {unopenedCandidateCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleBulkOpenProfiles();
                    }}
                    disabled={bulkRevealMutation.isPending}
                    className="inline-flex flex-row gap-2 border border-white/80 bg-gradient-to-br from-white/85 via-white/75 to-white/70 text-black items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-normal transition duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>
                      {bulkRevealMutation.isPending
                        ? "열람 중..."
                        : `${unopenedCandidateCount}개 열람하기`}
                    </span>
                  </button>
                ) : null}
              </>
            ) : null}
            {canUseMarkFilter ? (
              <ActionDropdown
                open={isFilterMenuOpen}
                onOpenChange={handleFilterMenuOpenChange}
                align="end"
                sideOffset={10}
                contentClassName="w-[240px] border-white/10 bg-[#101217] text-white shadow-2xl"
                modal={false}
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm bg-black/10 border border-white/5 text-white/80 transition-colors duration-200 hover:border-white/15 hover:bg-black/5 hover:text-white"
                  >
                    <Filter className="h-3.5 w-3.5" strokeWidth={1.8} />
                    <span className="font-normal">Filter:</span>
                    <span className="max-w-[180px] truncate text-white/55">
                      {appliedFilterSummary}
                    </span>
                  </button>
                }
              >
                <div className="px-2 py-2 text-xs font-medium text-white/50">
                  선택한 조건에 해당하는 후보를 결과에서 제외합니다.
                </div>
                <ActionDropdownItem
                  keepOpen
                  onSelect={() => {
                    setDraftExcludedStatuses([]);
                    setDraftExcludeUnopenedProfiles(false);
                  }}
                  className="text-white/85"
                >
                  <span>전체보기</span>
                  {draftExcludedStatuses.length === 0 &&
                  !draftExcludeUnopenedProfiles ? (
                    <span className="ml-auto text-[11px] text-accenta1">
                      선택됨
                    </span>
                  ) : null}
                </ActionDropdownItem>
                <ActionDropdownSeparator />
                <DropdownMenuCheckboxItem
                  checked={draftExcludeUnopenedProfiles}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                  onCheckedChange={() => {
                    setDraftExcludeUnopenedProfiles((current) => !current);
                  }}
                  className="cursor-pointer rounded-[10px] py-2 text-white/85 focus:bg-white/10 focus:text-white"
                >
                  열람하지 않은 프로필 제외
                </DropdownMenuCheckboxItem>
                {/* <ActionDropdownSeparator /> */}
                {CANDIDATE_MARK_OPTIONS.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={draftExcludedStatuses.includes(option.value)}
                    onSelect={(event) => {
                      event.preventDefault();
                    }}
                    onCheckedChange={() => {
                      toggleDraftExcludedStatus(option.value);
                    }}
                    className="cursor-pointer rounded-[10px] py-2 text-white/85 focus:bg-white/10 focus:text-white"
                  >
                    {FILTER_LABEL_BY_STATUS[option.value]}
                  </DropdownMenuCheckboxItem>
                ))}
                <ActionDropdownSeparator />
                <div className="flex items-center justify-end gap-2 px-1 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftExcludedStatuses(appliedExcludedStatuses);
                      setDraftExcludeUnopenedProfiles(
                        appliedExcludeUnopenedProfiles
                      );
                      setIsFilterMenuOpen(false);
                    }}
                    className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs text-white/60 transition-colors duration-200 hover:bg-white/5 hover:text-white"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={applyExcludedMarkFilter}
                    disabled={!hasPendingFilterChanges}
                    className="inline-flex h-8 items-center justify-center rounded-md bg-accenta1 px-3 text-xs font-medium text-black transition duration-200 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    적용
                  </button>
                </div>
              </ActionDropdown>
            ) : null}
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

      {sortedItems.length > 0 && filteredItems.length === 0 && (
        <div className="mx-auto mt-8 flex w-full max-w-[720px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center">
          <div className="text-sm text-white/75">
            현재 필터 조건에 맞는 후보가 없습니다.
          </div>
          {canUseMarkFilter &&
          (appliedExcludedStatuses.length > 0 ||
            appliedExcludeUnopenedProfiles) ? (
            <button
              type="button"
              onClick={resetExcludedMarkFilter}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            >
              전체보기로 되돌리기
            </button>
          ) : null}
        </div>
      )}

      {viewType === "table" && filteredItems.length > 0 && (
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
                {filteredItems.map((c: any, idx: number) => (
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
                    onMarkChange={(status) => {
                      handleCandidateMarkChange(String(c?.id ?? ""), status);
                    }}
                    sharedNotesLayout={sharedNotesLayout}
                    sharedFolderContext={sharedFolderContext ?? null}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewType === "card" && filteredItems.length > 0 && (
        <div className="w-full flex flex-col space-y-2 mt-4 items-center justify-center">
          <div className="space-y-4 w-full items-center justify-center flex flex-col pb-48">
            {filteredItems.map((c: any) => (
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
                onMarkChange={(status) => {
                  handleCandidateMarkChange(String(c?.id ?? ""), status);
                }}
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
