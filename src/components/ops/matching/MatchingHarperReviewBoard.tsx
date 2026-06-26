import { type FormEvent, useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  LoaderCircle,
  LogIn,
  Pencil,
  Plus,
  Send,
  Trash2,
  type LucideIcon,
  XCircle,
} from "lucide-react";
import {
  formatKstRelativeDate,
  formatKstRelativeDateTime,
} from "@/components/ops/dateUtils";
import { MatchingDateRangeFilter } from "@/components/ops/matching/MatchingFilterControls";
import {
  TalentIdentity,
  TalentStatusBadges,
} from "@/components/ops/matching/MatchingTalentCells";
import { MatchingTalentDrawer } from "@/components/ops/matching/MatchingTalentDrawer";
import {
  MatchingMemoQuickAdd,
  MatchingTagEditor,
} from "@/components/ops/matching/MatchingTalentInlineActions";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCreateOpsMatchingReviewStage,
  useDeleteOpsMatchingReviewStage,
  useOpsMatchingTalents,
  useOpsMatchingReviewBoard,
  useQueueOpsMatchingManualInternalRecommendation,
  useSetOpsMatchingReviewStage,
  useUpdateOpsMatchingReviewStage,
  useUpdateOpsMatchingFitHumanLabel,
} from "@/hooks/ops/useOpsMatching";
import {
  OPS_MATCHING_NO_HUMAN_LABEL_FILTER_VALUE,
} from "@/lib/ops/matchingFilters";
import { useOpsMatchingStore } from "@/store/useOpsMatchingStore";
import { Input as UiInput } from "@/components/ui/input";
import type {
  OpsMatchingReviewItem,
  OpsMatchingReviewStageId,
  OpsMatchingRoleOption,
  OpsMatchingTalentItem,
} from "@/lib/ops/matching";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type MatchingHarperReviewBoardProps = {
  canFetchInternal: boolean;
  onRecommendedDateRangeChange: (from: string, to: string) => void;
  recommendedFrom: string;
  recommendedTo: string;
  role: OpsMatchingRoleOption;
};

type ReviewColumn = {
  customStageId?: string;
  id: OpsMatchingReviewStageId;
  label: string;
  locked?: boolean;
};
type ReviewViewFieldId = "joinedAt" | "lastLoginAt" | "viewedAt";
type DroppableReviewStageId = Exclude<
  OpsMatchingReviewStageId,
  "hold" | "recommended"
>;

const PRE_CUSTOM_REVIEW_COLUMNS: readonly ReviewColumn[] = [
  { id: "recommended", label: "추천된 사람", locked: true },
  { id: "accepted", label: "수락" },
  { id: "pending_connection", label: "연결 대기" },
];
const POST_CUSTOM_REVIEW_COLUMNS: readonly ReviewColumn[] = [
  { id: "final_offer", label: "최종 오퍼" },
  { id: "process_stopped", label: "프로세스 중단" },
];
const BASE_REVIEW_COLUMNS: readonly ReviewColumn[] = [
  ...PRE_CUSTOM_REVIEW_COLUMNS,
  ...POST_CUSTOM_REVIEW_COLUMNS,
];
const REVIEW_LIST_TOGGLE_CONTROLS = [
  { icon: XCircle, id: "rejected", label: "연결을 거절한 목록" },
  { icon: Archive, id: "archived", label: "아카이브" },
] as const satisfies readonly {
  icon: LucideIcon;
  id: DroppableReviewStageId;
  label: string;
}[];
const REVIEW_VIEW_FIELD_OPTIONS = [
  { icon: Eye, id: "viewedAt", label: "열람 날짜" },
  { icon: CalendarDays, id: "joinedAt", label: "회원가입 날짜" },
  { icon: LogIn, id: "lastLoginAt", label: "최근 로그인 날짜" },
] as const satisfies readonly {
  icon: LucideIcon;
  id: ReviewViewFieldId;
  label: string;
}[];
const DEFAULT_REVIEW_VIEW_FIELDS: ReviewViewFieldId[] = ["viewedAt"];

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

function getFitLabelText(label: string | null | undefined) {
  const normalized = String(label ?? "").trim().toLowerCase();
  if (normalized === "fit") return "적합";
  if (normalized === "hold") return "보류";
  if (normalized === "ambiguous") return "애매";
  if (normalized === "unfit") return "부적합";
  if (normalized === "dissatisfied") return "불만족";
  return normalized || "없음";
}

function ReviewCard({
  draggingId,
  item,
  onDragEnd,
  onDragStart,
  onSelect,
  pending,
  visibleFields,
}: {
  draggingId: string | null;
  item: OpsMatchingReviewItem;
  onDragEnd: () => void;
  onDragStart: (item: OpsMatchingReviewItem) => void;
  onSelect: (talent: OpsMatchingTalentItem) => void;
  pending: boolean;
  visibleFields: Set<ReviewViewFieldId>;
}) {
  const showTalentDateRow =
    visibleFields.has("joinedAt") || visibleFields.has("lastLoginAt");

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
      <TalentStatusBadges talent={item.talent} hideReviewStageTags />
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
        {visibleFields.has("viewedAt") ? (
          <span className="rounded-sm bg-bg-weak px-1.5 py-0.5 text-[10px] leading-4 text-neutral-muted">
            {item.viewedAt
              ? `열람 ${formatKstRelativeDateTime(item.viewedAt)}`
              : "미열람"}
          </span>
        ) : null}
        {item.isManualInternalRecommendation ? (
          <span className="rounded-sm bg-primary-faded px-1.5 py-0.5 text-[10px] font-medium leading-4 text-primary">
            Ops 직접 추천
          </span>
        ) : null}
      </div>

      {showTalentDateRow ? (
        <div
          className={cx(
            "mt-3 grid gap-2 rounded-sm border border-neutral-1000-a05 bg-bg-weak px-2.5 py-2 text-[11px] leading-4 text-neutral-muted",
            visibleFields.has("joinedAt") && visibleFields.has("lastLoginAt")
              ? "grid-cols-2"
              : "grid-cols-1"
          )}
        >
          {visibleFields.has("joinedAt") ? (
            <div className="min-w-0 truncate">
              <span className="font-medium text-neutral-primary">가입</span>{" "}
              {formatKstRelativeDate(item.talent.createdAt)}
            </div>
          ) : null}
          {visibleFields.has("lastLoginAt") ? (
            <div className="min-w-0 truncate">
              <span className="font-medium text-neutral-primary">
                최근 로그인
              </span>{" "}
              {formatKstRelativeDate(item.talent.lastLoginedAt)}
            </div>
          ) : null}
        </div>
      ) : null}

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
        <MatchingTagEditor
          compact
          roleId={item.roleId}
          showAddButton={false}
          talent={item.talent}
        />
      </div>
    </div>
  );
}

function ReviewListToggleBox({
  active,
  canDrop,
  count,
  icon: Icon,
  isDropTarget,
  label,
  onClick,
  onDrop,
  onTargetLeave,
  onTargetOver,
  pending,
}: {
  active: boolean;
  canDrop: boolean;
  count: number;
  icon: LucideIcon;
  isDropTarget: boolean;
  label: string;
  onClick: () => void;
  onDrop: () => void;
  onTargetLeave: () => void;
  onTargetOver: () => void;
  pending: boolean;
}) {
  return (
    <BareButton
      type="button"
      onClick={onClick}
      onDragOver={(event) => {
        if (canDrop && !pending) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onTargetOver();
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        onTargetLeave();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (!pending && canDrop) onDrop();
      }}
      aria-pressed={active}
      className={cx(
        "inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-xs font-medium transition",
        isDropTarget
          ? "border-primary bg-primary-faded text-primary shadow-[0_0_0_2px_rgba(37,99,235,0.18)]"
          : active
          ? "border-primary/30 bg-primary-faded text-primary"
          : "border-neutral-1000-a05 bg-bg-default/65 text-neutral-muted hover:bg-bg-default hover:text-neutral-primary",
        canDrop && !isDropTarget && "border-primary/50 bg-primary-faded/30 text-primary",
        pending && "cursor-wait opacity-60"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{isDropTarget ? `${label}로 이동` : label}</span>
      <span className="rounded-sm bg-bg-floating px-1.5 py-0.5 text-[10px] text-neutral-muted">
        {count}
      </span>
    </BareButton>
  );
}

function AmbiguousReviewCard({
  isQueued,
  onDismiss,
  onRecommend,
  onSelect,
  pending,
  roleId,
  talent,
  visibleFields,
}: {
  isQueued: boolean;
  onDismiss: (talent: OpsMatchingTalentItem) => void;
  onRecommend: (talent: OpsMatchingTalentItem) => void;
  onSelect: (talent: OpsMatchingTalentItem) => void;
  pending: boolean;
  roleId: string;
  talent: OpsMatchingTalentItem;
  visibleFields: Set<ReviewViewFieldId>;
}) {
  const fit = talent.fit;
  const showTalentDateRow =
    visibleFields.has("joinedAt") || visibleFields.has("lastLoginAt");

  return (
    <div className="rounded-sm border border-neutral-1000-a05 bg-bg-floating p-3 transition hover:border-neutral-1000-a10">
      <button
        type="button"
        onClick={() => onSelect(talent)}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
      >
        <TalentIdentity talent={talent} />
        <TalentStatusBadges talent={talent} hideReviewStageTags />
      </button>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-sm bg-primary-faded px-1.5 py-0.5 text-[10px] font-medium leading-4 text-primary">
          LLM {getFitLabelText(fit?.label)}
        </span>
      </div>

      {showTalentDateRow ? (
        <div
          className={cx(
            "mt-3 grid gap-2 rounded-sm border border-neutral-1000-a05 bg-bg-weak px-2.5 py-2 text-[11px] leading-4 text-neutral-muted",
            visibleFields.has("joinedAt") && visibleFields.has("lastLoginAt")
              ? "grid-cols-2"
              : "grid-cols-1"
          )}
        >
          {visibleFields.has("joinedAt") ? (
            <div className="min-w-0 truncate">
              <span className="font-medium text-neutral-primary">가입</span>{" "}
              {formatKstRelativeDate(talent.createdAt)}
            </div>
          ) : null}
          {visibleFields.has("lastLoginAt") ? (
            <div className="min-w-0 truncate">
              <span className="font-medium text-neutral-primary">
                최근 로그인
              </span>{" "}
              {formatKstRelativeDate(talent.lastLoginedAt)}
            </div>
          ) : null}
        </div>
      ) : null}

      {talent.latestCompany || talent.latestSchool ? (
        <div className="mt-3 space-y-2 text-[11px] leading-4">
          {talent.latestCompany ? (
            <div className="min-w-0">
              <div className="truncate font-medium text-neutral-primary">
                {talent.latestCompany.label}
              </div>
              {talent.latestCompany.detail ? (
                <div className="truncate text-neutral-muted">
                  {talent.latestCompany.detail}
                </div>
              ) : null}
            </div>
          ) : null}
          {talent.latestSchool ? (
            <div className="min-w-0">
              <div className="truncate font-medium text-neutral-primary">
                {talent.latestSchool.label}
              </div>
              {talent.latestSchool.detail ? (
                <div className="truncate text-neutral-muted">
                  {talent.latestSchool.detail}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-2 border-t border-neutral-1000-a05 pt-3">
        <MatchingMemoQuickAdd
          compact
          memoPreview={talent.memoPreview}
          talentId={talent.userId}
        />
        <MatchingTagEditor
          compact
          hideReviewStageTags
          roleId={roleId}
          showAddButton={false}
          talent={talent}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <BareButton
          type="button"
          onClick={() => onRecommend(talent)}
          disabled={pending || !fit?.fitId || isQueued}
          className={cx(
            "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-70",
            isQueued
              ? "bg-positive-faded text-positive"
              : "bg-primary text-neutral-00 hover:bg-primary/90"
          )}
        >
          {pending ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          추천 발송하기
        </BareButton>
        <BareButton
          type="button"
          onClick={() => onDismiss(talent)}
          disabled={pending || !fit?.fitId}
          className="inline-flex min-h-9 items-center justify-center rounded-md border border-neutral-1000-a10 bg-bg-default px-2 text-xs font-medium text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          추천하지 않음
        </BareButton>
      </div>
      {isQueued ? (
        <div className="mt-2 rounded-sm bg-positive-faded px-2 py-1.5 text-[11px] leading-4 text-positive">
          며칠 뒤 추천 메일이 발송됩니다.
        </div>
      ) : null}
    </div>
  );
}

function ReviewViewDropdown({
  selectedFields,
  onFieldToggle,
}: {
  onFieldToggle: (fieldId: ReviewViewFieldId, selected: boolean) => void;
  selectedFields: ReviewViewFieldId[];
}) {
  const selectedSet = new Set(selectedFields);
  const label =
    selectedFields.length === REVIEW_VIEW_FIELD_OPTIONS.length
      ? "View 전체"
      : `View ${selectedFields.length}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BareButton
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-1000-a05 bg-bg-default/65 px-3 text-xs font-medium text-neutral-muted transition hover:bg-bg-default hover:text-neutral-primary"
        >
          <Eye className="h-3.5 w-3.5" />
          <span>{label}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </BareButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {REVIEW_VIEW_FIELD_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuCheckboxItem
              key={option.id}
              checked={selectedSet.has(option.id)}
              className="gap-2 text-xs"
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                onFieldToggle(option.id, checked === true)
              }
            >
              <Icon className="h-3.5 w-3.5 text-neutral-soft" />
              {option.label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isDroppableReviewStageId(
  stage: OpsMatchingReviewStageId
): stage is DroppableReviewStageId {
  return stage !== "hold" && stage !== "recommended";
}

function DropTargetHint({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-primary/45 bg-primary-faded px-3 py-2 text-center text-xs font-medium text-primary">
      드롭하면 {label}로 이동
    </div>
  );
}

function ReviewColumnAddRail({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative min-h-[560px] w-8 shrink-0 border-y border-neutral-1000-a10 bg-bg-default">
      <div className="absolute left-1/2 top-0 h-full border-l border-dashed border-neutral-1000-a10" />
      <BareButton
        type="button"
        onClick={onClick}
        aria-label="칼럼 추가"
        title="칼럼 추가"
        className="absolute left-1/2 top-2 z-10 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-neutral-1000-a10 bg-bg-floating text-neutral-muted shadow-sm transition hover:border-primary/40 hover:bg-primary-faded hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
      </BareButton>
    </div>
  );
}

export function MatchingHarperReviewBoard({
  canFetchInternal,
  onRecommendedDateRangeChange,
  recommendedFrom,
  recommendedTo,
  role,
}: MatchingHarperReviewBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetStageId, setDropTargetStageId] =
    useState<DroppableReviewStageId | null>(null);
  const [selectedTalent, setSelectedTalent] =
    useState<OpsMatchingTalentItem | null>(null);
  const [reviewViewFields, setReviewViewFields] = useState<ReviewViewFieldId[]>(
    DEFAULT_REVIEW_VIEW_FIELDS
  );
  const [visibleArchiveStageIds, setVisibleArchiveStageIds] = useState<
    DroppableReviewStageId[]
  >([]);
  const [confirmRecommendTalent, setConfirmRecommendTalent] =
    useState<OpsMatchingTalentItem | null>(null);
  const [queuedAmbiguousTalentIds, setQueuedAmbiguousTalentIds] = useState<
    string[]
  >([]);
  const [pendingAmbiguousTalentId, setPendingAmbiguousTalentId] = useState<
    string | null
  >(null);
  const [ambiguousActionError, setAmbiguousActionError] = useState("");
  const [customStageDialogOpen, setCustomStageDialogOpen] = useState(false);
  const [editingCustomStage, setEditingCustomStage] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [customStageLabel, setCustomStageLabel] = useState("");
  const [customStageError, setCustomStageError] = useState("");
  const [customStageActionError, setCustomStageActionError] = useState("");
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
  });
  const ambiguousTalentsQuery = useOpsMatchingTalents({
    enabled: canFetchInternal,
    excludeRecommended: true,
    humanLabels: ["fit", OPS_MATCHING_NO_HUMAN_LABEL_FILTER_VALUE],
    limit: 50,
    llmLabels: ["hold", "ambiguous"],
    roleId: role.roleId,
  });
  const setReviewStage = useSetOpsMatchingReviewStage();
  const createReviewStage = useCreateOpsMatchingReviewStage();
  const updateReviewStage = useUpdateOpsMatchingReviewStage();
  const deleteReviewStage = useDeleteOpsMatchingReviewStage();
  const updateFitHumanLabel = useUpdateOpsMatchingFitHumanLabel();
  const queueManualInternalRecommendation =
    useQueueOpsMatchingManualInternalRecommendation();
  const items = useMemo(
    () => reviewQuery.data?.items ?? [],
    [reviewQuery.data?.items]
  );
  const ambiguousTalents = useMemo(
    () =>
      ambiguousTalentsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [ambiguousTalentsQuery.data?.pages]
  );
  const customReviewColumns = useMemo(
    () =>
      (reviewQuery.data?.customStages ?? []).map((stage) => ({
        customStageId: stage.id,
        id: stage.stage,
        label: stage.label,
      })),
    [reviewQuery.data?.customStages]
  );
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.recommendationId, item])),
    [items]
  );
  const draggingItem = draggingId ? itemById.get(draggingId) : null;
  const groupedItems = useMemo(() => {
    const next = new Map<OpsMatchingReviewStageId, OpsMatchingReviewItem[]>();
    for (const column of BASE_REVIEW_COLUMNS) next.set(column.id, []);
    for (const column of customReviewColumns) next.set(column.id, []);
    for (const control of REVIEW_LIST_TOGGLE_CONTROLS) {
      next.set(control.id, []);
    }
    for (const item of items) {
      next.get(item.stage)?.push(item);
    }
    return next;
  }, [customReviewColumns, items]);
  const visibleArchiveColumns = useMemo(
    () =>
      REVIEW_LIST_TOGGLE_CONTROLS.filter((control) =>
        visibleArchiveStageIds.includes(control.id)
      ).map((control) => ({
        id: control.id,
        label: control.label,
      })),
    [visibleArchiveStageIds]
  );
  const visibleReviewFields = useMemo(
    () => new Set(reviewViewFields),
    [reviewViewFields]
  );
  const queuedAmbiguousTalentIdSet = useMemo(
    () => new Set(queuedAmbiguousTalentIds),
    [queuedAmbiguousTalentIds]
  );
  const pendingCustomStageId =
    (updateReviewStage.isPending
      ? updateReviewStage.variables?.stageId
      : null) ??
    (deleteReviewStage.isPending
      ? deleteReviewStage.variables?.stageId
      : null) ??
    null;
  const isCustomStageSubmitting =
    createReviewStage.isPending || updateReviewStage.isPending;
  const handleReviewViewFieldToggle = (
    fieldId: ReviewViewFieldId,
    selected: boolean
  ) => {
    setReviewViewFields((current) => {
      const next = new Set(current);
      if (selected) next.add(fieldId);
      else next.delete(fieldId);
      return REVIEW_VIEW_FIELD_OPTIONS.map((option) => option.id).filter((id) =>
        next.has(id)
      );
    });
  };

  const handleDropToStage = (stage: DroppableReviewStageId) => {
    if (!draggingId) return;
    const item = itemById.get(draggingId);
    if (!item || item.stage === stage) {
      setDraggingId(null);
      setDropTargetStageId(null);
      return;
    }
    setReviewStage.mutate({
      roleId: role.roleId,
      stage,
      talentId: item.talent.userId,
    });
    setDraggingId(null);
    setDropTargetStageId(null);
  };
  const handleDrop = (column: ReviewColumn) => {
    if (column.locked || column.id === "hold" || column.id === "recommended") {
      return;
    }
    handleDropToStage(column.id);
  };
  const handleDropTargetLeave = (stage: DroppableReviewStageId) => {
    setDropTargetStageId((current) => (current === stage ? null : current));
  };
  const handleArchiveStageToggle = (stage: DroppableReviewStageId) => {
    setVisibleArchiveStageIds((current) =>
      current.includes(stage)
        ? current.filter((item) => item !== stage)
        : [...current, stage]
    );
  };
  const openCreateCustomStageDialog = () => {
    setEditingCustomStage(null);
    setCustomStageLabel("");
    setCustomStageError("");
    setCustomStageActionError("");
    setCustomStageDialogOpen(true);
  };
  const openEditCustomStageDialog = (column: ReviewColumn) => {
    if (!column.customStageId) return;
    setEditingCustomStage({
      id: column.customStageId,
      label: column.label,
    });
    setCustomStageLabel(column.label);
    setCustomStageError("");
    setCustomStageActionError("");
    setCustomStageDialogOpen(true);
  };
  const handleDeleteCustomStage = (column: ReviewColumn) => {
    if (!column.customStageId || deleteReviewStage.isPending) return;
    const confirmed = window.confirm(
      `${column.label} 칼럼을 삭제할까요? 이 칼럼의 사람들은 커스텀 단계에서 제거됩니다.`
    );
    if (!confirmed) return;
    setCustomStageActionError("");
    deleteReviewStage.mutate(
      {
        roleId: role.roleId,
        stageId: column.customStageId,
      },
      {
        onError: (error) => {
          setCustomStageActionError(
            error instanceof Error
              ? error.message
              : "칼럼을 삭제하지 못했습니다."
          );
        },
      }
    );
  };
  const handleCustomStageSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = customStageLabel.trim();
    if (!label) {
      setCustomStageError("칼럼 이름을 입력해 주세요.");
      return;
    }

    setCustomStageError("");
    setCustomStageActionError("");
    try {
      if (editingCustomStage) {
        await updateReviewStage.mutateAsync({
          label,
          roleId: role.roleId,
          stageId: editingCustomStage.id,
        });
      } else {
        await createReviewStage.mutateAsync({
          label,
          roleId: role.roleId,
        });
      }
      setCustomStageLabel("");
      setEditingCustomStage(null);
      setCustomStageDialogOpen(false);
    } catch (error) {
      setCustomStageError(
        error instanceof Error ? error.message : "칼럼을 저장하지 못했습니다."
      );
    }
  };
  const handleAmbiguousDismiss = async (talent: OpsMatchingTalentItem) => {
    const fitId = talent.fit?.fitId;
    if (!fitId) return;
    setAmbiguousActionError("");
    setPendingAmbiguousTalentId(talent.userId);
    try {
      await updateFitHumanLabel.mutateAsync({
        fitId,
        humanLabel: "hold",
        humanReason: "Ops에서 추천하지 않음",
      });
    } catch (error) {
      setAmbiguousActionError(
        error instanceof Error
          ? error.message
          : "추천하지 않음 처리에 실패했습니다."
      );
    } finally {
      setPendingAmbiguousTalentId(null);
    }
  };
  const handleConfirmRecommend = async () => {
    const talent = confirmRecommendTalent;
    const fitId = talent?.fit?.fitId;
    if (!talent || !fitId) return;

    setAmbiguousActionError("");
    setPendingAmbiguousTalentId(talent.userId);
    try {
      if (talent.fit?.humanLabel !== "fit") {
        await updateFitHumanLabel.mutateAsync({
          fitId,
          humanLabel: "fit",
          humanReason: "Ops에서 직접 추천 발송 승인",
        });
      }
      await queueManualInternalRecommendation.mutateAsync({
        reason: "Ops matching Pipeline에서 Harper 애매 판단 후보를 직접 추천",
        roleId: role.roleId,
        userId: talent.userId,
      });
      setQueuedAmbiguousTalentIds((current) =>
        current.includes(talent.userId) ? current : [...current, talent.userId]
      );
      setConfirmRecommendTalent(null);
    } catch (error) {
      setAmbiguousActionError(
        error instanceof Error
          ? error.message
          : "추천 발송 요청에 실패했습니다."
      );
    } finally {
      setPendingAmbiguousTalentId(null);
    }
  };
  const hasActiveFilters = Boolean(recommendedFrom || recommendedTo);
  const totalReviewColumns =
    visibleArchiveColumns.length +
    BASE_REVIEW_COLUMNS.length +
    customReviewColumns.length +
    1;

  const renderReviewColumn = (
    column: ReviewColumn,
    index: number,
    totalColumns: number
  ) => {
    const columnItems = groupedItems.get(column.id) ?? [];
    const canDrop =
      Boolean(draggingItem) &&
      !column.locked &&
      isDroppableReviewStageId(column.id) &&
      draggingItem?.stage !== column.id;
    const isDropTarget =
      canDrop &&
      isDroppableReviewStageId(column.id) &&
      dropTargetStageId === column.id;
    const isCollapsed = collapsedColumnIds.includes(column.id);
    const isCustomColumn = Boolean(column.customStageId);
    const isCustomColumnPending =
      Boolean(column.customStageId) &&
      pendingCustomStageId === column.customStageId;
    return (
      <section
        key={column.id}
        onDragOver={(event) => {
          if (canDrop && isDroppableReviewStageId(column.id)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTargetStageId(column.id);
          }
        }}
        onDragLeave={(event) => {
          if (
            event.currentTarget.contains(event.relatedTarget as Node | null) ||
            !isDroppableReviewStageId(column.id)
          ) {
            return;
          }
          handleDropTargetLeave(column.id);
        }}
        onDrop={(event) => {
          event.preventDefault();
          handleDrop(column);
        }}
        className={cx(
          "min-h-[560px] shrink-0 border-y border-l border-neutral-1000-a10 transition-colors",
          isCollapsed ? "w-14" : "w-[300px]",
          index === totalColumns - 1 && "border-r",
          isDropTarget
            ? "bg-primary-faded/55 ring-2 ring-inset ring-primary/55"
            : canDrop
              ? "bg-primary-faded/20"
            : column.id === "accepted"
              ? "bg-positive-faded"
              : column.id === "rejected"
                ? "bg-critical-faded/40"
              : "bg-bg-default"
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
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-xs font-semibold text-neutral-primary">
                {column.label}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="rounded-sm bg-bg-default px-1.5 py-0.5 text-[10px] text-neutral-muted">
                  {columnItems.length}
                </span>
                {isCustomColumn ? (
                  <>
                    <BareButton
                      type="button"
                      onClick={() => openEditCustomStageDialog(column)}
                      disabled={isCustomColumnPending}
                      aria-label={`${column.label} 이름 수정`}
                      title="이름 수정"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-soft transition hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </BareButton>
                    <BareButton
                      type="button"
                      onClick={() => handleDeleteCustomStage(column)}
                      disabled={isCustomColumnPending}
                      aria-label={`${column.label} 삭제`}
                      title="삭제"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-soft transition hover:bg-critical-faded hover:text-critical disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCustomColumnPending && deleteReviewStage.isPending ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </BareButton>
                  </>
                ) : null}
                <BareButton
                  type="button"
                  onClick={() =>
                    toggleReviewColumnCollapsed(role.roleId, column.id)
                  }
                  aria-label={`${column.label} 접기`}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-soft transition hover:bg-bg-weak hover:text-neutral-primary"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </BareButton>
              </div>
            </div>
          )}
        </div>

        {!isCollapsed ? (
          <div className="space-y-2 p-2">
            {isDropTarget ? <DropTargetHint label={column.label} /> : null}
            {columnItems.map((item) => (
              <ReviewCard
                key={item.recommendationId}
                draggingId={draggingId}
                item={item}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropTargetStageId(null);
                }}
                onDragStart={(dragItem) => {
                  setDraggingId(dragItem.recommendationId);
                  setDropTargetStageId(null);
                }}
                onSelect={setSelectedTalent}
                pending={setReviewStage.isPending}
                visibleFields={visibleReviewFields}
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
  };

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
          : "보드를 불러오지 못했습니다."}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="rounded-md border border-neutral-1000-a05 bg-bg-floating p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-primary">
              Pipeline
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-muted">
              <span>
                {reviewQuery.data?.totalCount.toLocaleString("ko-KR") ?? 0}명
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MatchingDateRangeFilter
              align="end"
              emptyLabel="추천일 전체"
              from={recommendedFrom}
              onChange={onRecommendedDateRangeChange}
              prefix="추천"
              to={recommendedTo}
            />
            <ReviewViewDropdown
              selectedFields={reviewViewFields}
              onFieldToggle={handleReviewViewFieldToggle}
            />
            {hasActiveFilters ? (
              <BareButton
                type="button"
                onClick={() => {
                  onRecommendedDateRangeChange("", "");
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

      <div className="flex flex-wrap items-center gap-2">
        {REVIEW_LIST_TOGGLE_CONTROLS.map((control) => (
          <ReviewListToggleBox
            key={control.id}
            active={visibleArchiveStageIds.includes(control.id)}
            canDrop={draggingItem ? draggingItem.stage !== control.id : false}
            count={groupedItems.get(control.id)?.length ?? 0}
            icon={control.icon}
            isDropTarget={dropTargetStageId === control.id}
            label={control.label}
            onClick={() => handleArchiveStageToggle(control.id)}
            onDrop={() => handleDropToStage(control.id)}
            onTargetLeave={() => handleDropTargetLeave(control.id)}
            onTargetOver={() => setDropTargetStageId(control.id)}
            pending={setReviewStage.isPending}
          />
        ))}
      </div>

      {ambiguousActionError ? (
        <div className={opsTheme.errorNotice}>{ambiguousActionError}</div>
      ) : null}
      {customStageActionError ? (
        <div className={opsTheme.errorNotice}>{customStageActionError}</div>
      ) : null}

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-0">
          {visibleArchiveColumns.map((column, index) =>
            renderReviewColumn(column, index, totalReviewColumns)
          )}
          <section className="min-h-[560px] w-[320px] shrink-0 border-y border-l border-neutral-1000-a10 bg-bg-default">
            <div className="border-b border-neutral-1000-a10 bg-bg-floating px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-xs font-semibold text-neutral-primary">
                  Harper가 애매하다고 판단
                </div>
                <span className="rounded-sm bg-bg-default px-1.5 py-0.5 text-[10px] text-neutral-muted">
                  {ambiguousTalentsQuery.data?.pages[0]?.totalCount ??
                    ambiguousTalents.length}
                </span>
              </div>
            </div>
            <div className="space-y-2 p-2">
              {ambiguousTalentsQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <LoaderCircle className="h-4 w-4 animate-spin text-neutral-soft" />
                </div>
              ) : ambiguousTalentsQuery.error ? (
                <div className={opsTheme.errorNotice}>
                  {ambiguousTalentsQuery.error instanceof Error
                    ? ambiguousTalentsQuery.error.message
                    : "애매 판단 목록을 불러오지 못했습니다."}
                </div>
              ) : ambiguousTalents.length === 0 ? (
                <div className="border border-dashed border-neutral-1000-a10 bg-bg-floating px-3 py-8 text-center text-xs text-neutral-soft">
                  비어 있음
                </div>
              ) : (
                ambiguousTalents.map((talent) => (
                  <AmbiguousReviewCard
                    key={talent.userId}
                    isQueued={
                      queuedAmbiguousTalentIdSet.has(talent.userId) ||
                      Boolean(talent.fit?.manualInternalRecommendationQueuedAt)
                    }
                    onDismiss={(item) => void handleAmbiguousDismiss(item)}
                    onRecommend={setConfirmRecommendTalent}
                    onSelect={setSelectedTalent}
                    pending={pendingAmbiguousTalentId === talent.userId}
                    roleId={role.roleId}
                    talent={talent}
                    visibleFields={visibleReviewFields}
                  />
                ))
              )}
              {ambiguousTalentsQuery.hasNextPage ? (
                <BareButton
                  type="button"
                  onClick={() => void ambiguousTalentsQuery.fetchNextPage()}
                  disabled={ambiguousTalentsQuery.isFetchingNextPage}
                  className={cx(opsTheme.buttonSecondary, "h-9 w-full text-xs")}
                >
                  {ambiguousTalentsQuery.isFetchingNextPage
                    ? "불러오는 중..."
                    : "더 보기"}
                </BareButton>
              ) : null}
            </div>
          </section>
          {PRE_CUSTOM_REVIEW_COLUMNS.map((column, index) =>
            renderReviewColumn(
              column,
              visibleArchiveColumns.length + 1 + index,
              totalReviewColumns
            )
          )}
          {customReviewColumns.map((column, index) =>
            renderReviewColumn(
              column,
              visibleArchiveColumns.length +
                PRE_CUSTOM_REVIEW_COLUMNS.length +
                1 +
                index,
              totalReviewColumns
            )
          )}
          <ReviewColumnAddRail onClick={openCreateCustomStageDialog} />
          {POST_CUSTOM_REVIEW_COLUMNS.map((column, index) =>
            renderReviewColumn(
              column,
              visibleArchiveColumns.length +
                PRE_CUSTOM_REVIEW_COLUMNS.length +
                customReviewColumns.length +
                1 +
                index,
              totalReviewColumns
            )
          )}
        </div>
      </div>

      <Dialog
        open={customStageDialogOpen}
        onOpenChange={(open) => {
          setCustomStageDialogOpen(open);
          if (!open) {
            setCustomStageError("");
            setCustomStageLabel("");
            setEditingCustomStage(null);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-lg" hideCloseButton>
          <form onSubmit={(event) => void handleCustomStageSubmit(event)}>
            <DialogHeader>
              <DialogTitle>
                {editingCustomStage ? "칼럼 이름 수정" : "칼럼 추가"}
              </DialogTitle>
              <DialogDescription>
                {editingCustomStage
                  ? "이 role의 Pipeline 단계 이름을 수정합니다."
                  : "연결 대기와 최종 오퍼 사이에 새 단계를 추가합니다."}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-2">
              <UiInput
                autoFocus
                value={customStageLabel}
                onChange={(event) => {
                  setCustomStageLabel(event.target.value);
                  if (customStageError) setCustomStageError("");
                }}
                maxLength={40}
                placeholder="예: 1차 인터뷰"
              />
              {customStageError ? (
                <div className="text-xs text-critical">{customStageError}</div>
              ) : null}
            </div>
            <DialogFooter className="mt-5">
              <BareButton
                type="button"
                onClick={() => setCustomStageDialogOpen(false)}
                disabled={isCustomStageSubmitting}
                className={cx(opsTheme.buttonSecondary, "h-10 px-4 text-sm")}
              >
                취소
              </BareButton>
              <BareButton
                type="submit"
                disabled={!customStageLabel.trim() || isCustomStageSubmitting}
                className={cx(opsTheme.buttonPrimary, "h-10 px-4 text-sm")}
              >
                {isCustomStageSubmitting
                  ? "저장 중..."
                  : editingCustomStage
                    ? "수정"
                    : "추가"}
              </BareButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmRecommendTalent)}
        onOpenChange={(open) => {
          if (!open) setConfirmRecommendTalent(null);
        }}
      >
        <DialogContent className="max-w-md rounded-lg" hideCloseButton>
          <DialogHeader>
            <DialogTitle>추천 발송하기</DialogTitle>
            <DialogDescription>
              이 후보에게 현재 role 추천을 발송하도록 큐에 넣을까요?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-neutral-1000-a05 bg-bg-weak px-3 py-2 text-sm text-neutral-primary">
            {confirmRecommendTalent?.name ||
              confirmRecommendTalent?.email ||
              "이 후보"}{" "}
            · {role.companyName} · {role.roleName}
          </div>
          <DialogFooter>
            <BareButton
              type="button"
              onClick={() => setConfirmRecommendTalent(null)}
              disabled={Boolean(pendingAmbiguousTalentId)}
              className={cx(opsTheme.buttonSecondary, "h-10 px-4 text-sm")}
            >
              취소
            </BareButton>
            <BareButton
              type="button"
              onClick={() => void handleConfirmRecommend()}
              disabled={Boolean(pendingAmbiguousTalentId)}
              className={cx(opsTheme.buttonPrimary, "h-10 px-4 text-sm")}
            >
              {pendingAmbiguousTalentId ? "처리 중..." : "확인"}
            </BareButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MatchingTalentDrawer
        onClose={() => setSelectedTalent(null)}
        role={role}
        talent={selectedTalent}
      />
    </section>
  );
}
