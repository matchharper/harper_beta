import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import {
  MatchingDateRangeFilter,
  MatchingFilterTagChips,
  MatchingTagFilter,
} from "@/components/ops/matching/MatchingFilterControls";
import {
  TalentIdentity,
  TalentStatusBadges,
} from "@/components/ops/matching/MatchingTalentCells";
import { MatchingTalentDrawer } from "@/components/ops/matching/MatchingTalentDrawer";
import {
  MatchingMemoQuickAdd,
  MatchingTagEditor,
  MatchingTagPill,
} from "@/components/ops/matching/MatchingTalentInlineActions";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import {
  useOpsMatchingReviewBoard,
  useSetOpsMatchingReviewStage,
} from "@/hooks/ops/useOpsMatching";
import { useOpsMatchingStore } from "@/store/useOpsMatchingStore";
import type {
  OpsMatchingReviewItem,
  OpsMatchingReviewStageId,
  OpsMatchingRoleOption,
  OpsMatchingTalentItem,
} from "@/lib/ops/matching";

type MatchingHarperReviewBoardProps = {
  canFetchInternal: boolean;
  onRecommendedDateRangeChange: (from: string, to: string) => void;
  onTagFiltersChange: (tags: string[]) => void;
  recommendedFrom: string;
  recommendedTo: string;
  role: OpsMatchingRoleOption;
  tagFilters: string[];
};

type ReviewColumn = {
  id: OpsMatchingReviewStageId;
  label: string;
  locked?: boolean;
};

const REVIEW_COLUMNS: readonly ReviewColumn[] = [
  { id: "recommended", label: "추천된 사람", locked: true },
  { id: "rejected", label: "거절" },
  { id: "accepted", label: "수락" },
  { id: "hold", label: "보류(정보가 더 필요)" },
  { id: "pending_connection", label: "연결 대기" },
  { id: "archived", label: "아카이브" },
];

function getFeedbackLabel(feedback: string | null | undefined) {
  const normalized = String(feedback ?? "").toLowerCase();
  if (normalized === "like" || normalized === "positive") return "수락";
  if (normalized === "dislike" || normalized === "negative") return "거절";
  return "미응답";
}

function getFeedbackClass(feedback: string | null | undefined) {
  const normalized = String(feedback ?? "").toLowerCase();
  if (normalized === "like" || normalized === "positive") {
    return "bg-positive-faded text-positive";
  }
  if (normalized === "dislike" || normalized === "negative") {
    return "bg-critical-faded text-critical";
  }
  return "bg-bg-weak text-neutral-soft";
}

function ReviewCard({
  draggingId,
  item,
  onDragEnd,
  onDragStart,
  onSelect,
  pending,
}: {
  draggingId: string | null;
  item: OpsMatchingReviewItem;
  onDragEnd: () => void;
  onDragStart: (item: OpsMatchingReviewItem) => void;
  onSelect: (talent: OpsMatchingTalentItem) => void;
  pending: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!pending}
      onClick={() => onSelect(item.talent)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item.talent);
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.recommendationId);
        onDragStart(item);
      }}
      onDragEnd={onDragEnd}
      className={cx(
        "cursor-grab rounded-sm border border-neutral-1000-a05 bg-bg-floating p-3 transition hover:border-neutral-1000-a10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 active:cursor-grabbing",
        draggingId === item.recommendationId && "opacity-45",
        pending && "cursor-wait opacity-60"
      )}
    >
      <TalentIdentity talent={item.talent} />
      <TalentStatusBadges talent={item.talent} />
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span
          className={cx(
            "rounded-sm px-1.5 py-0.5 text-[10px] font-medium leading-4",
            getFeedbackClass(item.feedback)
          )}
        >
          {getFeedbackLabel(item.feedback)}
        </span>
        <span className="rounded-sm bg-bg-weak px-1.5 py-0.5 text-[10px] leading-4 text-neutral-muted">
          추천 {formatKstRelativeDateTime(item.recommendedAt)}
        </span>
        {item.isManualInternalRecommendation ? (
          <span className="rounded-sm bg-primary-faded px-1.5 py-0.5 text-[10px] font-medium leading-4 text-primary">
            Ops 직접 추천
          </span>
        ) : null}
        {item.stageTag ? <MatchingTagPill tag={item.stageTag} /> : null}
      </div>

      {item.talent.latestCompany || item.talent.latestSchool ? (
        <div className="mt-3 space-y-2 text-[11px] leading-4">
          {item.talent.latestCompany ? (
            <div className="min-w-0">
              <div className="truncate font-medium text-neutral-primary">
                {item.talent.latestCompany.label}
              </div>
              {item.talent.latestCompany.detail ? (
                <div className="truncate text-neutral-muted">
                  {item.talent.latestCompany.detail}
                </div>
              ) : null}
            </div>
          ) : null}
          {item.talent.latestSchool ? (
            <div className="min-w-0">
              <div className="truncate font-medium text-neutral-primary">
                {item.talent.latestSchool.label}
              </div>
              {item.talent.latestSchool.detail ? (
                <div className="truncate text-neutral-muted">
                  {item.talent.latestSchool.detail}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {item.talent.memoPreview ? (
        <div className="mt-3 line-clamp-2 rounded-sm bg-bg-weak px-2 py-1.5 text-[11px] leading-4 text-neutral-muted">
          {item.talent.memoPreview}
        </div>
      ) : null}

      <div className="mt-3 space-y-2 border-t border-neutral-1000-a05 pt-3">
        <MatchingMemoQuickAdd
          compact
          memoPreview={item.talent.memoPreview}
          talentId={item.talent.userId}
        />
        <MatchingTagEditor compact roleId={item.roleId} talent={item.talent} />
      </div>
    </div>
  );
}

export function MatchingHarperReviewBoard({
  canFetchInternal,
  onRecommendedDateRangeChange,
  onTagFiltersChange,
  recommendedFrom,
  recommendedTo,
  role,
  tagFilters,
}: MatchingHarperReviewBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedTalent, setSelectedTalent] =
    useState<OpsMatchingTalentItem | null>(null);
  const collapsedColumnIds =
    useOpsMatchingStore(
      (state) => state.collapsedReviewColumnIdsByRole[role.roleId]
    ) ?? [];
  const toggleReviewColumnCollapsed = useOpsMatchingStore(
    (state) => state.toggleReviewColumnCollapsed
  );
  const reviewQuery = useOpsMatchingReviewBoard({
    enabled: canFetchInternal,
    recommendedFrom,
    recommendedTo,
    roleId: role.roleId,
    tags: tagFilters,
  });
  const setReviewStage = useSetOpsMatchingReviewStage();
  const items = useMemo(
    () => reviewQuery.data?.items ?? [],
    [reviewQuery.data?.items]
  );
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.recommendationId, item])),
    [items]
  );
  const groupedItems = useMemo(() => {
    const next = new Map<OpsMatchingReviewStageId, OpsMatchingReviewItem[]>();
    for (const column of REVIEW_COLUMNS) next.set(column.id, []);
    for (const item of items) {
      next.get(item.stage)?.push(item);
    }
    return next;
  }, [items]);

  const handleDrop = (column: ReviewColumn) => {
    if (!draggingId || column.locked) return;
    const item = itemById.get(draggingId);
    if (!item || item.stage === column.id) return;
    setReviewStage.mutate({
      roleId: role.roleId,
      stage: column.id as Exclude<OpsMatchingReviewStageId, "recommended">,
      talentId: item.talent.userId,
    });
    setDraggingId(null);
  };
  const hasActiveFilters = Boolean(
    recommendedFrom || recommendedTo || tagFilters.length > 0
  );

  if (reviewQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
      </div>
    );
  }

  if (reviewQuery.error) {
    return (
      <div className={opsTheme.errorNotice}>
        {reviewQuery.error instanceof Error
          ? reviewQuery.error.message
          : "Harper Review 보드를 불러오지 못했습니다."}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="rounded-md border border-neutral-1000-a05 bg-bg-floating p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-primary">
              Harper Review
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-muted">
              <span>
                {reviewQuery.data?.totalCount.toLocaleString("ko-KR") ?? 0}명
              </span>
              <MatchingFilterTagChips tags={tagFilters} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MatchingDateRangeFilter
              emptyLabel="추천일 전체"
              from={recommendedFrom}
              onChange={onRecommendedDateRangeChange}
              prefix="추천"
              to={recommendedTo}
            />
            <MatchingTagFilter
              selectedTags={tagFilters}
              onChange={onTagFiltersChange}
            />
            {hasActiveFilters ? (
              <BareButton
                type="button"
                onClick={() => {
                  onRecommendedDateRangeChange("", "");
                  onTagFiltersChange([]);
                }}
                className={cx(opsTheme.buttonSecondary, "h-10 px-3 text-xs")}
              >
                초기화
              </BareButton>
            ) : null}
            {setReviewStage.isPending ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-neutral-soft">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                변경 저장 중
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-16 text-center text-sm text-neutral-soft">
          아직 이 role에 추천된 사람이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-0">
            {REVIEW_COLUMNS.map((column, index) => {
              const columnItems = groupedItems.get(column.id) ?? [];
              const canDrop = Boolean(draggingId) && !column.locked;
              const isCollapsed = collapsedColumnIds.includes(column.id);
              return (
                <section
                  key={column.id}
                  onDragOver={(event) => {
                    if (!column.locked) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDrop(column);
                  }}
                  className={cx(
                    "min-h-[560px] shrink-0 border-y border-l border-neutral-1000-a10 bg-bg-default transition-colors",
                    isCollapsed ? "w-14" : "w-[300px]",
                    index === REVIEW_COLUMNS.length - 1 && "border-r",
                    canDrop && "bg-primary-faded/30"
                  )}
                >
                  <div className="border-b border-neutral-1000-a10 bg-bg-floating px-3 py-2.5">
                    {isCollapsed ? (
                      <div className="flex flex-col items-center gap-2">
                        <BareButton
                          type="button"
                          onClick={() =>
                            toggleReviewColumnCollapsed(role.roleId, column.id)
                          }
                          aria-label={`${column.label} 펼치기`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </BareButton>
                        <div className="max-h-[180px] truncate text-[11px] font-semibold text-neutral-primary [writing-mode:vertical-rl]">
                          {column.label}
                        </div>
                        <span className="rounded-sm bg-bg-default px-1.5 py-0.5 text-[10px] text-neutral-muted">
                          {columnItems.length}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-xs font-semibold text-neutral-primary">
                            {column.label}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="rounded-sm bg-bg-default px-1.5 py-0.5 text-[10px] text-neutral-muted">
                              {columnItems.length}
                            </span>
                            <BareButton
                              type="button"
                              onClick={() =>
                                toggleReviewColumnCollapsed(
                                  role.roleId,
                                  column.id
                                )
                              }
                              aria-label={`${column.label} 접기`}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-soft transition hover:bg-bg-weak hover:text-neutral-primary"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </BareButton>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {!isCollapsed ? (
                    <div className="space-y-2 p-2">
                      {columnItems.map((item) => (
                        <ReviewCard
                          key={item.recommendationId}
                          draggingId={draggingId}
                          item={item}
                          onDragEnd={() => setDraggingId(null)}
                          onDragStart={(dragItem) =>
                            setDraggingId(dragItem.recommendationId)
                          }
                          onSelect={setSelectedTalent}
                          pending={setReviewStage.isPending}
                        />
                      ))}
                      {columnItems.length === 0 ? (
                        <div className="border border-dashed border-neutral-1000-a10 bg-bg-floating px-3 py-8 text-center text-xs text-neutral-soft">
                          비어 있음
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="h-full" />
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      <MatchingTalentDrawer
        onClose={() => setSelectedTalent(null)}
        role={role}
        talent={selectedTalent}
      />
    </section>
  );
}
