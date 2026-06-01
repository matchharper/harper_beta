import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { showToast } from "@/components/toast/toast";
import { Calendar } from "@/components/ui/calendar";
import {
  useBulkUpdateOpsInternalRecommendationStages,
  useHideOpsInternalRecommendation,
  useOpsInternalRecommendations,
} from "@/hooks/useOpsCareer";
import { isInternalEmail } from "@/lib/internalAccess";
import type {
  OpsInternalRecommendationAcceptedFilter,
  OpsInternalRecommendationItem,
} from "@/lib/opsCareerServer";
import {
  isEmailExcludedByOpsInternalTerms,
  useOpsInternalDataExclusionStore,
} from "@/store/useOpsInternalDataExclusionStore";
import { useOpsInternalRecommendationsBoardStore } from "@/store/useOpsInternalRecommendationsBoardStore";
import { useAuthStore } from "@/store/useAuthStore";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  EyeOff,
  ExternalLink,
  GripVertical,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  Table2,
  User,
} from "lucide-react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";

const FETCH_LIMIT = 80;
const AUTO_STAGE_VALUE = "__auto__";
const CUSTOM_STAGE_VALUE = "__custom__";
const EMPTY_COLLAPSED_BOARD_COLUMNS: string[] = [];
const INTERNAL_RECOMMENDATION_FIXED_STAGES = [
  "회사에 전달됨",
  "회사에서 거절됨",
  "연결시켜줌",
  "채용됨",
  "프로세스종료됨",
] as const;

type ViewMode = "table" | "board";
type StageDrafts = Record<string, string | null>;
type RecommendationFilter = OpsInternalRecommendationAcceptedFilter | "hidden";

const FILTER_OPTIONS = [
  { id: "all", label: "전체보기" },
  { id: "accepted", label: "유저가 수락한 것만" },
] as const satisfies readonly {
  id: OpsInternalRecommendationAcceptedFilter;
  label: string;
}[];

const VIEW_OPTIONS = [
  { icon: Table2, id: "table", label: "Table" },
  { icon: Columns3, id: "board", label: "Board" },
] as const satisfies readonly {
  icon: typeof Table2;
  id: ViewMode;
  label: string;
}[];

const normalizeStage = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const isFixedStage = (value: string | null | undefined) =>
  Boolean(
    value &&
    INTERNAL_RECOMMENDATION_FIXED_STAGES.includes(
      value as (typeof INTERNAL_RECOMMENDATION_FIXED_STAGES)[number]
    )
  );

const formatKst = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const toDateOnly = (date: Date | undefined) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatShortDate = (date: Date | undefined) => {
  if (!date) return "";
  return date.toLocaleDateString("ko-KR", {
    day: "2-digit",
    month: "2-digit",
  });
};

const formatRecommendedDateRangeButtonLabel = (
  range: DateRange | undefined
) => {
  if (!range?.from) return "추천일 전체";
  const from = formatShortDate(range.from);
  const to = formatShortDate(range.to ?? range.from);
  return from === to ? `추천 ${from}` : `${from} - ${to}`;
};

const getAutoStageLabel = (item: OpsInternalRecommendationItem) =>
  item.feedback ? "수락-거절함" : "추천됨";

const getFeedbackLabel = (feedback: string | null | undefined) => {
  const normalized = String(feedback ?? "").toLowerCase();
  if (normalized === "like" || normalized === "positive") return "수락";
  if (normalized === "dislike" || normalized === "negative") return "거절";
  return "-";
};

const getFeedbackClass = (feedback: string | null | undefined) => {
  const normalized = String(feedback ?? "").toLowerCase();
  if (normalized === "like" || normalized === "positive") {
    return "bg-[#E4EDE2] text-[#29513A]";
  }
  if (normalized === "dislike" || normalized === "negative") {
    return "bg-[#F7DBD3] text-[#8A2E1D]";
  }
  return "bg-beige500/55 text-beige900/40";
};

function TalentAvatar({
  item,
  size = "h-9 w-9",
}: {
  item: OpsInternalRecommendationItem;
  size?: string;
}) {
  const displayName = item.talent.name || item.talent.email || "이름 없음";

  if (item.talent.profilePicture) {
    return (
      <Image
        src={item.talent.profilePicture}
        alt=""
        width={36}
        height={36}
        unoptimized
        className={cx(size, "shrink-0 rounded-full object-cover")}
      />
    );
  }

  return (
    <div
      className={cx(
        size,
        "flex shrink-0 items-center justify-center rounded-full bg-beige500/70 text-beige900/40"
      )}
      aria-label={displayName}
    >
      <User className="h-4 w-4" />
    </div>
  );
}

function TalentLink({ item }: { item: OpsInternalRecommendationItem }) {
  const displayName = item.talent.name || item.talent.email || "이름 없음";

  return (
    <Link
      href={{ pathname: "/ops/career", query: { userId: item.talent.userId } }}
      className="group flex min-w-0 items-center gap-2.5"
    >
      <TalentAvatar item={item} />
      <div className="min-w-0">
        <div className="truncate font-geist text-sm font-medium text-beige900 group-hover:underline group-hover:decoration-beige900/25 group-hover:underline-offset-4">
          {displayName}
        </div>
        <div className="mt-0 truncate font-geist text-[11px] text-black/30">
          {item.talent.email ?? item.talent.headline ?? "-"}
        </div>
      </div>
    </Link>
  );
}

function getResolvedStage(
  item: OpsInternalRecommendationItem,
  drafts: StageDrafts
) {
  return Object.prototype.hasOwnProperty.call(drafts, item.recommendationId)
    ? normalizeStage(drafts[item.recommendationId])
    : normalizeStage(item.processedStage);
}

function getStageSelectValue(
  item: OpsInternalRecommendationItem,
  drafts: StageDrafts,
  customOpenIds: Set<string>
) {
  if (customOpenIds.has(item.recommendationId)) return CUSTOM_STAGE_VALUE;
  const stage = getResolvedStage(item, drafts);
  if (!stage) return AUTO_STAGE_VALUE;
  return isFixedStage(stage) ? stage : CUSTOM_STAGE_VALUE;
}

function StageEditor({
  customOpenIds,
  customValues,
  disabled,
  drafts,
  item,
  onCustomValueChange,
  onStageSelect,
}: {
  customOpenIds: Set<string>;
  customValues: Record<string, string>;
  disabled: boolean;
  drafts: StageDrafts;
  item: OpsInternalRecommendationItem;
  onCustomValueChange: (
    item: OpsInternalRecommendationItem,
    value: string
  ) => void;
  onStageSelect: (item: OpsInternalRecommendationItem, value: string) => void;
}) {
  const selectValue = getStageSelectValue(item, drafts, customOpenIds);
  const currentStage = getResolvedStage(item, drafts);
  const customValue = customValues[item.recommendationId] ?? currentStage ?? "";

  return (
    <div className="space-y-1.5">
      <select
        value={selectValue}
        onChange={(event) => onStageSelect(item, event.target.value)}
        disabled={disabled}
        className="h-8 w-full rounded-md border border-beige900/10 bg-white/80 px-2 font-geist text-xs text-beige900 outline-none transition focus:border-beige900/25 disabled:opacity-50"
      >
        <option value={AUTO_STAGE_VALUE}>{getAutoStageLabel(item)}</option>
        {INTERNAL_RECOMMENDATION_FIXED_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {stage}
          </option>
        ))}
        <option value={CUSTOM_STAGE_VALUE}>기타(주관식)</option>
      </select>

      {selectValue === CUSTOM_STAGE_VALUE ? (
        <input
          type="text"
          value={customValue}
          onChange={(event) => onCustomValueChange(item, event.target.value)}
          placeholder="상태 입력"
          disabled={disabled}
          className="h-8 w-full rounded-md border border-beige900/10 bg-white/80 px-2 font-geist text-xs text-beige900 outline-none transition placeholder:text-beige900/35 focus:border-beige900/25 disabled:opacity-50"
        />
      ) : null}
    </div>
  );
}

function RecommendationsTable({
  customOpenIds,
  customValues,
  drafts,
  hidingRecommendationId,
  items,
  onCustomValueChange,
  onHideRecommendation,
  onStageSelect,
  savePending,
  showHideAction,
}: {
  customOpenIds: Set<string>;
  customValues: Record<string, string>;
  drafts: StageDrafts;
  hidingRecommendationId: string | null;
  items: OpsInternalRecommendationItem[];
  onCustomValueChange: (
    item: OpsInternalRecommendationItem,
    value: string
  ) => void;
  onHideRecommendation: (item: OpsInternalRecommendationItem) => void;
  onStageSelect: (item: OpsInternalRecommendationItem, value: string) => void;
  savePending: boolean;
  showHideAction: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-beige900/10 bg-white/55">
      <table className="w-full min-w-[1180px] table-fixed border-collapse font-geist text-xs">
        <thead className="bg-beige500/45 text-left text-beige900/45">
          <tr>
            <th className="w-[240px] px-3 py-2 font-medium">유저</th>
            <th className="w-[135px] px-3 py-2 font-medium">추천일</th>
            <th className="px-3 py-2 font-medium">회사 / 역할</th>
            <th className="w-[150px] px-3 py-2 font-medium">열람 / 클릭</th>
            <th className="w-[135px] px-3 py-2 font-medium">피드백</th>
            <th className="w-[240px] px-3 py-2 font-medium">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-beige900/10">
          {items.map((item) => {
            const isHiding = hidingRecommendationId === item.recommendationId;

            return (
              <tr
                key={item.recommendationId}
                className="text-beige900/70 transition hover:bg-white/70"
              >
                <td className="px-3 py-2 align-top">
                  <TalentLink item={item} />
                </td>
                <td className="px-3 py-2 align-top text-beige900/45">
                  {formatKst(item.recommendedAt)}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-beige900/85">
                      {item.roleName}
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-beige900/45">
                      <span className="truncate">{item.companyName}</span>
                      {item.externalJdUrl ? (
                        <a
                          href={item.externalJdUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-beige900/45 transition hover:text-beige900"
                          title="JD 열기"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                    {item.locationText ? (
                      <div className="mt-0.5 truncate text-[11px] text-beige900/35">
                        {item.locationText}
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 align-top text-[11px]">
                  <div
                    className={
                      item.viewedAt ? "text-beige900/65" : "text-beige900/30"
                    }
                  >
                    {item.viewedAt
                      ? `열람 ${formatKst(item.viewedAt)}`
                      : "미열람"}
                  </div>
                  <div
                    className={cx(
                      "mt-0.5",
                      item.clickedAt ? "text-beige900/65" : "text-beige900/30"
                    )}
                  >
                    {item.clickedAt
                      ? `클릭 ${formatKst(item.clickedAt)}`
                      : "미클릭"}
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <span
                    className={cx(
                      "inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium",
                      getFeedbackClass(item.feedback)
                    )}
                  >
                    {getFeedbackLabel(item.feedback)}
                  </span>
                  {item.feedbackAt ? (
                    <div className="mt-1 text-[11px] text-beige900/35">
                      {formatKst(item.feedbackAt)}
                    </div>
                  ) : null}
                  {item.feedbackReason ? (
                    <div
                      className="mt-0.5 truncate text-[11px] text-beige900/45"
                      title={item.feedbackReason}
                    >
                      {item.feedbackReason}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="mb-2 flex justify-end">
                    {showHideAction ? (
                      <button
                        type="button"
                        onClick={() => onHideRecommendation(item)}
                        disabled={savePending || isHiding}
                        className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-geist text-[11px] font-medium text-beige900/38 transition hover:bg-beige900/5 hover:text-beige900 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isHiding ? (
                          <LoaderCircle className="h-3 w-3 animate-spin" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                        숨김
                      </button>
                    ) : (
                      <span className="inline-flex h-7 items-center gap-1 rounded-md bg-beige500/60 px-2 font-geist text-[11px] font-medium text-beige900/45">
                        <EyeOff className="h-3 w-3" />
                        숨김됨
                      </span>
                    )}
                  </div>
                  <StageEditor
                    customOpenIds={customOpenIds}
                    customValues={customValues}
                    disabled={savePending}
                    drafts={drafts}
                    item={item}
                    onCustomValueChange={onCustomValueChange}
                    onStageSelect={onStageSelect}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getBoardColumnId(
  item: OpsInternalRecommendationItem,
  drafts: StageDrafts
) {
  const stage = getResolvedStage(item, drafts);
  if (!stage) return AUTO_STAGE_VALUE;
  return isFixedStage(stage) ? stage : CUSTOM_STAGE_VALUE;
}

function RecommendationsBoard({
  collapsedColumnIds,
  customOpenIds,
  customValues,
  drafts,
  hidingRecommendationId,
  items,
  onCustomValueChange,
  onDropToStage,
  onHideRecommendation,
  onStageSelect,
  onToggleColumnCollapsed,
  savePending,
  showHideAction,
}: {
  collapsedColumnIds: string[];
  customOpenIds: Set<string>;
  customValues: Record<string, string>;
  drafts: StageDrafts;
  hidingRecommendationId: string | null;
  items: OpsInternalRecommendationItem[];
  onCustomValueChange: (
    item: OpsInternalRecommendationItem,
    value: string
  ) => void;
  onDropToStage: (
    item: OpsInternalRecommendationItem,
    stage: string | null
  ) => void;
  onHideRecommendation: (item: OpsInternalRecommendationItem) => void;
  onStageSelect: (item: OpsInternalRecommendationItem, value: string) => void;
  onToggleColumnCollapsed: (columnId: string) => void;
  savePending: boolean;
  showHideAction: boolean;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const hasCustomStages = items.some(
    (item) => getBoardColumnId(item, drafts) === CUSTOM_STAGE_VALUE
  );
  const columns = useMemo(
    () => [
      {
        id: AUTO_STAGE_VALUE,
        label: "추천 / 유저 응답",
        stage: null,
      },
      ...INTERNAL_RECOMMENDATION_FIXED_STAGES.map((stage) => ({
        id: stage,
        label: stage,
        stage,
      })),
      ...(hasCustomStages
        ? [
            {
              id: CUSTOM_STAGE_VALUE,
              label: "기타 상태",
              stage: CUSTOM_STAGE_VALUE,
            },
          ]
        : []),
    ],
    [hasCustomStages]
  );
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.recommendationId, item])),
    [items]
  );
  const collapsedColumnSet = useMemo(
    () => new Set(collapsedColumnIds),
    [collapsedColumnIds]
  );
  const groupedItems = useMemo(() => {
    const next = new Map<string, OpsInternalRecommendationItem[]>();
    for (const column of columns) next.set(column.id, []);
    for (const item of items) {
      const columnId = getBoardColumnId(item, drafts);
      if (!next.has(columnId)) next.set(columnId, []);
      next.get(columnId)?.push(item);
    }
    return next;
  }, [columns, drafts, items]);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex w-max min-w-full gap-3">
        {columns.map((column) => {
          const columnItems = groupedItems.get(column.id) ?? [];
          const isCustomColumn = column.id === CUSTOM_STAGE_VALUE;
          const isCollapsed = collapsedColumnSet.has(column.id);

          return (
            <div
              key={column.id}
              onDragOver={(event) => {
                if (!isCustomColumn) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (isCustomColumn || !draggingId) return;
                const item = itemById.get(draggingId);
                if (!item) return;
                onDropToStage(item, column.stage);
                setDraggingId(null);
              }}
              className={cx(
                "min-h-[520px] shrink-0 rounded-lg border border-beige900/10 bg-white/45 transition-[background-color,width,min-width]",
                isCollapsed
                  ? "flex w-14 min-w-[3.5rem] flex-col items-center p-2"
                  : "w-[320px] min-w-[290px] p-2",
                draggingId && !isCustomColumn && "bg-white/70"
              )}
            >
              {isCollapsed ? (
                <>
                  <button
                    type="button"
                    onClick={() => onToggleColumnCollapsed(column.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-beige900/45 transition hover:bg-beige900/5 hover:text-beige900"
                    aria-label={`${column.label} 펼치기`}
                    title={`${column.label} 펼치기`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <div className="mt-3 flex min-h-0 flex-1 flex-col items-center gap-2">
                    <span className="rounded bg-beige500/70 px-1.5 py-0.5 font-geist text-[10px] text-beige900/45">
                      {columnItems.length}
                    </span>
                    <div
                      className="max-h-[420px] truncate font-geist text-xs font-medium text-beige900/65 [writing-mode:vertical-rl]"
                      title={column.label}
                    >
                      {column.label}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 px-1 py-1.5">
                    <button
                      type="button"
                      onClick={() => onToggleColumnCollapsed(column.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-beige900/35 transition hover:bg-beige900/5 hover:text-beige900"
                      aria-label={`${column.label} 접기`}
                      title={`${column.label} 접기`}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <div className="min-w-0 truncate font-geist text-xs font-medium">
                      {column.label}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded bg-beige500/70 px-1.5 py-0.5 font-geist text-[10px] text-beige900/70">
                        {columnItems.length}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 space-y-2">
                    {columnItems.map((item) => {
                      const isHiding =
                        hidingRecommendationId === item.recommendationId;

                      return (
                        <div
                          key={item.recommendationId}
                          draggable={!savePending && !isHiding}
                          onDragStart={() =>
                            setDraggingId(item.recommendationId)
                          }
                          onDragEnd={() => setDraggingId(null)}
                          className={cx(
                            "rounded-md border border-beige900/10 bg-white/80 p-3 shadow-[0_12px_30px_rgba(89,57,24,0.06)] transition",
                            draggingId === item.recommendationId && "opacity-45"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <GripVertical className="mt-1 h-4 w-4 shrink-0 text-beige900/25" />
                            <div className="min-w-0 flex-1 space-y-3">
                              <TalentLink item={item} />
                              <div className="min-w-0">
                                <div className="truncate font-geist text-sm font-medium text-black/90">
                                  {item.roleName}
                                </div>
                                <div className="mt-0.5 truncate font-geist text-[13px] text-black/60">
                                  {item.companyName}
                                  {item.locationText
                                    ? ` · ${item.locationText}`
                                    : ""}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <span
                                  className={cx(
                                    "rounded px-1.5 py-0.5 font-geist text-[11px] font-medium",
                                    getFeedbackClass(item.feedback)
                                  )}
                                >
                                  {getFeedbackLabel(item.feedback)}
                                </span>
                                <span className="rounded bg-beige500/60 px-1.5 py-0.5 font-geist text-[11px] text-beige900/45">
                                  {formatKst(item.recommendedAt)}
                                </span>
                              </div>
                              <StageEditor
                                customOpenIds={customOpenIds}
                                customValues={customValues}
                                disabled={savePending}
                                drafts={drafts}
                                item={item}
                                onCustomValueChange={onCustomValueChange}
                                onStageSelect={onStageSelect}
                              />
                            </div>
                            {showHideAction ? (
                              <button
                                type="button"
                                onClick={() => onHideRecommendation(item)}
                                disabled={savePending || isHiding}
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-beige900/35 transition hover:bg-beige900/5 hover:text-beige900 disabled:cursor-not-allowed disabled:opacity-45"
                                aria-label="추천 숨김"
                                title="추천 숨김"
                              >
                                {isHiding ? (
                                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <EyeOff className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : (
                              <span
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-beige500/60 text-beige900/45"
                                aria-label="숨김됨"
                                title="숨김됨"
                              >
                                <EyeOff className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {columnItems.length === 0 ? (
                      <div className="rounded-md border border-dashed border-beige900/15 bg-white/35 px-3 py-8 text-center font-geist text-xs text-beige900/35">
                        여기에 드롭
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OpsInternalRecommendationsPage() {
  const { loading: authLoading, user } = useAuthStore();
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const boardStorageUserKey = user?.id ?? user?.email ?? "anonymous";
  const emailExclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );
  const collapsedBoardColumnIds = useOpsInternalRecommendationsBoardStore(
    (state) =>
      state.collapsedColumnIdsByUser[boardStorageUserKey] ??
      EMPTY_COLLAPSED_BOARD_COLUMNS
  );
  const toggleBoardColumnCollapsed = useOpsInternalRecommendationsBoardStore(
    (state) => state.toggleColumnCollapsed
  );
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedFilter, setSelectedFilter] =
    useState<RecommendationFilter>("all");
  const acceptedFilter: OpsInternalRecommendationAcceptedFilter =
    selectedFilter === "accepted" ? "accepted" : "all";
  const hiddenOnly = selectedFilter === "hidden";
  const showHideAction = !hiddenOnly;
  const [searchQuery, setSearchQuery] = useState("");
  const [recommendedDateRange, setRecommendedDateRange] = useState<
    DateRange | undefined
  >();
  const [isRecommendedDateOpen, setIsRecommendedDateOpen] = useState(false);
  const recommendedDateFilterRef = useRef<HTMLDivElement>(null);
  const recommendedFrom = toDateOnly(recommendedDateRange?.from);
  const recommendedTo = toDateOnly(
    recommendedDateRange?.to ?? recommendedDateRange?.from
  );
  const hasRecommendedDateFilter = Boolean(recommendedFrom || recommendedTo);
  const recommendedDateLabel =
    formatRecommendedDateRangeButtonLabel(recommendedDateRange);
  const [stageDrafts, setStageDrafts] = useState<StageDrafts>({});
  const [customOpenIds, setCustomOpenIds] = useState<Set<string>>(
    () => new Set()
  );
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [hidingRecommendationId, setHidingRecommendationId] = useState<
    string | null
  >(null);
  const query = useOpsInternalRecommendations(
    acceptedFilter,
    FETCH_LIMIT,
    canFetchInternal,
    {
      hiddenOnly,
      recommendedFrom,
      recommendedTo,
    }
  );
  const saveStages = useBulkUpdateOpsInternalRecommendationStages();
  const hideRecommendation = useHideOpsInternalRecommendation();

  const handleToggleBoardColumnCollapsed = useCallback(
    (columnId: string) => {
      toggleBoardColumnCollapsed(boardStorageUserKey, columnId);
    },
    [boardStorageUserKey, toggleBoardColumnCollapsed]
  );

  useEffect(() => {
    if (!isRecommendedDateOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!recommendedDateFilterRef.current?.contains(target)) {
        setIsRecommendedDateOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isRecommendedDateOpen]);

  const recommendations = useMemo(() => {
    const byId = new Map<string, OpsInternalRecommendationItem>();
    for (const page of query.data?.pages ?? []) {
      for (const item of page.recommendations) {
        byId.set(item.recommendationId, item);
      }
    }
    return Array.from(byId.values());
  }, [query.data?.pages]);

  const recommendationById = useMemo(
    () => new Map(recommendations.map((item) => [item.recommendationId, item])),
    [recommendations]
  );

  const hiddenByInternalDataExclusionCount = useMemo(
    () =>
      recommendations.filter((item) =>
        isEmailExcludedByOpsInternalTerms(
          item.talent.email,
          emailExclusionTerms
        )
      ).length,
    [emailExclusionTerms, recommendations]
  );

  const visibleRecommendations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return recommendations.filter((item) => {
      if (
        isEmailExcludedByOpsInternalTerms(
          item.talent.email,
          emailExclusionTerms
        )
      ) {
        return false;
      }
      if (!q) return true;
      return [
        item.talent.name,
        item.talent.email,
        item.talent.headline,
        item.companyName,
        item.roleName,
        item.locationText,
        item.processedStage,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [emailExclusionTerms, recommendations, searchQuery]);

  const changedStageUpdates = useMemo(
    () =>
      Object.entries(stageDrafts)
        .map(([recommendationId, processedStage]) => {
          const item = recommendationById.get(recommendationId);
          if (!item) return null;
          const nextStage = normalizeStage(processedStage);
          const originalStage = normalizeStage(item.processedStage);
          if (nextStage === originalStage) return null;
          return {
            processedStage: nextStage,
            recommendationId,
          };
        })
        .filter(
          (
            item
          ): item is {
            processedStage: string | null;
            recommendationId: string;
          } => item !== null
        ),
    [recommendationById, stageDrafts]
  );
  const hasUnsavedChanges = changedStageUpdates.length > 0;

  const setStageDraft = useCallback(
    (item: OpsInternalRecommendationItem, rawStage: string | null) => {
      const nextStage = normalizeStage(rawStage);
      const originalStage = normalizeStage(item.processedStage);

      setStageDrafts((current) => {
        const next = { ...current };
        if (nextStage === originalStage) {
          delete next[item.recommendationId];
        } else {
          next[item.recommendationId] = nextStage;
        }
        return next;
      });
    },
    []
  );

  const handleStageSelect = useCallback(
    (item: OpsInternalRecommendationItem, value: string) => {
      if (value === CUSTOM_STAGE_VALUE) {
        setCustomOpenIds((current) => {
          const next = new Set(current);
          next.add(item.recommendationId);
          return next;
        });
        setCustomValues((current) => ({
          ...current,
          [item.recommendationId]:
            current[item.recommendationId] ??
            getResolvedStage(item, stageDrafts) ??
            "",
        }));
        return;
      }

      setCustomOpenIds((current) => {
        const next = new Set(current);
        next.delete(item.recommendationId);
        return next;
      });
      setStageDraft(item, value === AUTO_STAGE_VALUE ? null : value);
    },
    [setStageDraft, stageDrafts]
  );

  const handleCustomValueChange = useCallback(
    (item: OpsInternalRecommendationItem, value: string) => {
      setCustomValues((current) => ({
        ...current,
        [item.recommendationId]: value,
      }));
      setStageDraft(item, value);
    },
    [setStageDraft]
  );

  const handleDropToStage = useCallback(
    (item: OpsInternalRecommendationItem, stage: string | null) => {
      setCustomOpenIds((current) => {
        const next = new Set(current);
        next.delete(item.recommendationId);
        return next;
      });
      setStageDraft(item, stage);
    },
    [setStageDraft]
  );

  const resetDrafts = useCallback(() => {
    setStageDrafts({});
    setCustomOpenIds(new Set());
    setCustomValues({});
  }, []);

  const clearRecommendationDraft = useCallback((recommendationId: string) => {
    setStageDrafts((current) => {
      const next = { ...current };
      delete next[recommendationId];
      return next;
    });
    setCustomOpenIds((current) => {
      const next = new Set(current);
      next.delete(recommendationId);
      return next;
    });
    setCustomValues((current) => {
      const next = { ...current };
      delete next[recommendationId];
      return next;
    });
  }, []);

  const changeRecommendedDateRange = useCallback(
    (nextRange: DateRange | undefined) => {
      if (
        hasUnsavedChanges &&
        !window.confirm("저장하지 않은 변경사항을 버리고 날짜 필터를 바꿀까요?")
      ) {
        return;
      }
      resetDrafts();
      setRecommendedDateRange(nextRange);
    },
    [hasUnsavedChanges, resetDrafts]
  );

  const changeFilter = useCallback(
    (nextFilter: RecommendationFilter) => {
      if (nextFilter === selectedFilter) return;
      if (
        hasUnsavedChanges &&
        !window.confirm("저장하지 않은 변경사항을 버리고 필터를 바꿀까요?")
      ) {
        return;
      }
      resetDrafts();
      setSelectedFilter(nextFilter);
    },
    [hasUnsavedChanges, resetDrafts, selectedFilter]
  );

  const handleRefresh = useCallback(() => {
    if (
      hasUnsavedChanges &&
      !window.confirm("저장하지 않은 변경사항을 버리고 새로고침할까요?")
    ) {
      return;
    }
    resetDrafts();
    void query.refetch();
  }, [hasUnsavedChanges, query, resetDrafts]);

  const handleSave = useCallback(async () => {
    if (changedStageUpdates.length === 0 || saveStages.isPending) return;

    try {
      await saveStages.mutateAsync({ updates: changedStageUpdates });
      resetDrafts();
      showToast({
        message: `${changedStageUpdates.length}개 추천 상태를 저장했습니다.`,
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "추천 상태 저장에 실패했습니다.",
        variant: "white",
      });
    }
  }, [changedStageUpdates, resetDrafts, saveStages]);

  const handleHideRecommendation = useCallback(
    async (item: OpsInternalRecommendationItem) => {
      if (hidingRecommendationId || hiddenOnly) return;

      setHidingRecommendationId(item.recommendationId);
      try {
        await hideRecommendation.mutateAsync({
          recommendationId: item.recommendationId,
        });
        clearRecommendationDraft(item.recommendationId);
        showToast({
          message: "추천을 숨겼습니다.",
          variant: "white",
        });
      } catch (error) {
        showToast({
          message:
            error instanceof Error
              ? error.message
              : "추천 숨김에 실패했습니다.",
          variant: "white",
        });
      } finally {
        setHidingRecommendationId(null);
      }
    },
    [
      clearRecommendationDraft,
      hiddenOnly,
      hideRecommendation,
      hidingRecommendationId,
    ]
  );

  const hasSearchQuery = Boolean(searchQuery.trim());
  const filterButtonClass = (active: boolean) =>
    cx(
      "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 font-geist text-[12px] font-medium transition",
      active
        ? "border-[#90a88f]/55 bg-[#e4eee4] text-[#2f553d] hover:bg-[#dbe8db]"
        : "border-beige900/10 bg-white/70 text-beige900/55 hover:border-beige900/18 hover:bg-white"
    );
  const emptyMessage =
    hasSearchQuery || hasRecommendedDateFilter
      ? "검색 결과가 없습니다."
      : hiddenByInternalDataExclusionCount > 0
        ? "내부 데이터 제외 설정으로 숨겨진 추천만 있습니다."
        : hiddenOnly
          ? "숨긴 internal 추천이 없습니다."
          : selectedFilter === "accepted"
            ? "유저가 수락한 internal 추천이 없습니다."
            : "internal 추천이 없습니다.";

  return (
    <>
      <Head>
        <title>Internal Recommendations | Harper Ops</title>
      </Head>

      <OpsShell
        compactHeader
        title="Internal Recommendations"
        actions={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={query.isFetching}
            className={cx(opsTheme.buttonSecondary, "h-10 px-3")}
          >
            {query.isFetching ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            새로고침
          </button>
        }
      >
        <section className="space-y-4 px-4">
          <div className="py-2">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="mt-1 font-geist text-sm text-beige900/55">
                사람별로 추천된 internal 기회의 유저 반응과 운영 상태를
                관리합니다.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full min-w-[220px] sm:w-[280px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/30" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="유저, 회사, 역할 검색"
                    className={cx(opsTheme.input, "h-9 pl-9")}
                  />
                </div>
                <div ref={recommendedDateFilterRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsRecommendedDateOpen((open) => !open)}
                    className={filterButtonClass(hasRecommendedDateFilter)}
                  >
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    <span>{recommendedDateLabel}</span>
                    <ChevronDown
                      className={cx(
                        "h-3.5 w-3.5 transition",
                        isRecommendedDateOpen ? "rotate-180" : ""
                      )}
                      aria-hidden
                    />
                  </button>

                  {isRecommendedDateOpen ? (
                    <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px] rounded-md border border-beige900/12 bg-[#fbfaf7] p-2 shadow-[0_18px_48px_rgba(37,28,21,0.16)]">
                      <Calendar
                        mode="range"
                        selected={recommendedDateRange}
                        onSelect={changeRecommendedDateRange}
                        numberOfMonths={1}
                        disabled={{ after: new Date() }}
                        className="p-2 text-[12px] [--cell-size:1.85rem]"
                      />
                      <div className="mt-1 flex items-center justify-end gap-2 border-t border-beige900/10 pt-2">
                        <button
                          type="button"
                          onClick={() => changeRecommendedDateRange(undefined)}
                          disabled={!hasRecommendedDateFilter}
                          className="h-7 rounded-md px-2 font-geist text-[11px] font-medium text-beige900/45 transition hover:bg-beige900/5 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          초기화
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsRecommendedDateOpen(false)}
                          className="h-7 rounded-md bg-beige900 px-2.5 font-geist text-[11px] font-medium text-white transition hover:bg-beige900/88"
                        >
                          닫기
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex rounded-md border border-beige900/10 bg-white/55 p-1">
                  {FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => changeFilter(option.id)}
                      className={cx(
                        "h-7 rounded px-2.5 font-geist text-xs font-medium transition",
                        selectedFilter === option.id
                          ? "bg-beige900 text-beige100"
                          : "text-beige900/55 hover:text-beige900"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="flex rounded-md border border-beige900/10 bg-white/55 p-1">
                  {VIEW_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setViewMode(option.id)}
                        className={cx(
                          "inline-flex h-7 items-center gap-1.5 rounded px-2.5 font-geist text-xs font-medium transition",
                          viewMode === option.id
                            ? "bg-beige900 text-beige100"
                            : "text-beige900/55 hover:text-beige900"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => changeFilter("hidden")}
                  className={cx(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 font-geist text-xs font-medium transition",
                    selectedFilter === "hidden"
                      ? "border-beige900 bg-beige900 text-beige100"
                      : "border-beige900/10 bg-white/55 text-beige900/55 hover:border-beige900/18 hover:bg-white hover:text-beige900"
                  )}
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  숨김
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 font-geist text-[11px] text-beige900/40">
              <span>현재 로드 {visibleRecommendations.length}개</span>
              {hiddenByInternalDataExclusionCount > 0 ? (
                <span>
                  내부 데이터 제외 설정으로 {hiddenByInternalDataExclusionCount}
                  개 숨김
                </span>
              ) : null}
            </div>
          </div>

          {query.isLoading ? (
            <div className={cx(opsTheme.panel, "flex justify-center py-20")}>
              <LoaderCircle className="h-5 w-5 animate-spin text-beige900/30" />
            </div>
          ) : query.error ? (
            <div className={opsTheme.errorNotice}>
              {query.error instanceof Error
                ? query.error.message
                : "internal 추천을 불러오지 못했습니다."}
            </div>
          ) : visibleRecommendations.length === 0 ? (
            <div
              className={cx(
                opsTheme.panel,
                "px-4 py-16 text-center font-geist text-sm text-beige900/40"
              )}
            >
              {emptyMessage}
            </div>
          ) : viewMode === "table" ? (
            <RecommendationsTable
              customOpenIds={customOpenIds}
              customValues={customValues}
              drafts={stageDrafts}
              hidingRecommendationId={hidingRecommendationId}
              items={visibleRecommendations}
              onCustomValueChange={handleCustomValueChange}
              onHideRecommendation={handleHideRecommendation}
              onStageSelect={handleStageSelect}
              savePending={saveStages.isPending}
              showHideAction={showHideAction}
            />
          ) : (
            <RecommendationsBoard
              collapsedColumnIds={collapsedBoardColumnIds}
              customOpenIds={customOpenIds}
              customValues={customValues}
              drafts={stageDrafts}
              hidingRecommendationId={hidingRecommendationId}
              items={visibleRecommendations}
              onCustomValueChange={handleCustomValueChange}
              onDropToStage={handleDropToStage}
              onHideRecommendation={handleHideRecommendation}
              onStageSelect={handleStageSelect}
              onToggleColumnCollapsed={handleToggleBoardColumnCollapsed}
              savePending={saveStages.isPending}
              showHideAction={showHideAction}
            />
          )}

          {query.hasNextPage ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className={cx(opsTheme.buttonSecondary, "h-9 px-4 text-xs")}
              >
                {query.isFetchingNextPage ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    불러오는 중...
                  </>
                ) : (
                  `${FETCH_LIMIT}개 더 보기`
                )}
              </button>
            </div>
          ) : null}
        </section>

        {hasUnsavedChanges ? (
          <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
            <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-lg border border-beige900/10 bg-beige100/95 px-4 py-3 shadow-[0_18px_60px_rgba(89,57,24,0.22)] backdrop-blur">
              <div className="min-w-0 font-geist text-sm text-beige900/70">
                <span className="font-medium text-beige900">
                  {changedStageUpdates.length}개 변경사항
                </span>
                을 저장해야 반영됩니다.
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={resetDrafts}
                  disabled={saveStages.isPending}
                  className={cx(opsTheme.buttonSecondary, "h-9 px-3 text-xs")}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saveStages.isPending}
                  className={cx(opsTheme.buttonPrimary, "h-9 px-3 text-xs")}
                >
                  {saveStages.isPending ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  저장
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </OpsShell>
    </>
  );
}
