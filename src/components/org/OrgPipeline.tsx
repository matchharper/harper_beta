import Image from "next/image";
import { LoaderCircle, MoreHorizontal, Search } from "lucide-react";
import {
  type DragEvent,
  type FormEvent,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { OpsDateRangeFilter } from "@/components/ops/OpsDateRangeFilter";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { ProfileLabelCell } from "@/components/ops/matching/MatchingTalentCells";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton, IconButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  ReviewPipelineColumnAddRail,
  ReviewPipelineColumnHeader,
  ReviewPipelineColumnShell,
  ReviewPipelineDropTargetHint,
  ReviewPipelineEmptyState,
  ReviewPipelineStageDialog,
} from "@/components/review-pipeline/ReviewPipelinePrimitives";
import {
  AcceptIntroDialog,
  StopCandidateDialog,
} from "@/components/org/OrgCandidateDecisionDialogs";
import { OrgRoleActionsMenu } from "@/components/org/OrgRoleActionsMenu";
import {
  useCreateOrgReviewStage,
  useDeleteOrgReviewStage,
  useUpdateOrgReviewStage,
} from "@/hooks/org/useOrg";
import type {
  OrgBoardItem,
  OrgBoardResponse,
  OrgRole,
  OrgStageChangeOptions,
  OrgStage,
  OrgStageId,
} from "@/lib/org/server";

function getDisplayName(item: OrgBoardItem) {
  return item.talent.name || item.talent.email || "이름 없음";
}

function canDropToStage(item: OrgBoardItem, stage: OrgStage) {
  return !stage.roleId || stage.roleId === item.roleId;
}

function getCustomStageDbId(stageId: OrgStageId) {
  return stageId.startsWith("custom:") ? stageId.slice("custom:".length) : "";
}

const ORG_PROFILE_VIEWED_STORAGE_PREFIX = "harper:org-profile-viewed:v1";
const ORG_PROFILE_VIEWED_STORAGE_EVENT = "harper:org-profile-viewed-change";

function buildProfileViewedStorageKey(args: {
  currentUserEmail?: string | null;
  workspaceId: string;
}) {
  const userKey = (args.currentUserEmail || "unknown").trim().toLowerCase();
  return `${ORG_PROFILE_VIEWED_STORAGE_PREFIX}:${args.workspaceId}:${userKey}`;
}

function getProfileViewedStorageSnapshot(storageKey: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(storageKey) ?? "[]";
}

function parseProfileViewedIds(rawValue: string | null) {
  if (rawValue === null) return null;
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(
      parsed.filter((value): value is string => typeof value === "string")
    );
  } catch {
    return new Set<string>();
  }
}

function subscribeProfileViewedStorage(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key.startsWith(ORG_PROFILE_VIEWED_STORAGE_PREFIX)) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(ORG_PROFILE_VIEWED_STORAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(ORG_PROFILE_VIEWED_STORAGE_EVENT, onStoreChange);
  };
}

function writeProfileViewedIds(storageKey: string, ids: ReadonlySet<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...ids]));
    window.dispatchEvent(new Event(ORG_PROFILE_VIEWED_STORAGE_EVENT));
  } catch {
    // Ignore storage failures; viewed state is only a local UI hint.
  }
}

function RecommendedDateFilter({
  onChange,
  from,
  to,
}: {
  from: string;
  onChange: (from: string, to: string) => void;
  to: string;
}) {
  return (
    <OpsDateRangeFilter
      align="end"
      buttonClassName="w-full min-w-0"
      buttonSize="default"
      emptyLabel="추천일 전체"
      from={from}
      inactiveButtonClassName="border-neutral-1000-a05 bg-bg-floating text-neutral-muted hover:border-neutral-1000-a10 hover:bg-bg-weak"
      onChange={onChange}
      prefix="추천"
      to={to}
    />
  );
}

function CandidateCard({
  item,
  onMove,
  onSelect,
  pending,
  stages,
  viewed,
}: {
  item: OrgBoardItem;
  onMove: (item: OrgBoardItem, stage: OrgStageId) => void;
  onSelect: (item: OrgBoardItem) => void;
  pending?: boolean;
  stages: OrgStage[];
  viewed?: boolean;
}) {
  const displayName = getDisplayName(item);
  const availableStages = stages.filter((stage) => canDropToStage(item, stage));

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!pending}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.recommendationId);
      }}
      className={cx(
        "cursor-grab rounded-sm border border-neutral-1000-a05 bg-bg-floating p-3 transition hover:border-neutral-1000-a10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 active:cursor-grabbing",
        pending && "cursor-wait opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        {item.talent.profilePicture ? (
          <Image
            src={item.talent.profilePicture}
            alt=""
            width={34}
            height={34}
            unoptimized
            className="h-[34px] w-[34px] shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-bg-weak text-xs font-medium text-neutral-muted">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-sm font-medium text-neutral-primary">
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
        <div
          onClick={(event) => event.stopPropagation()}
          onDragStart={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-5 w-5 border-0 bg-transparent text-neutral-soft hover:bg-bg-weak hover:text-neutral-primary">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {availableStages.map((stage) => (
                <DropdownMenuItem
                  key={stage.id}
                  disabled={pending || stage.id === item.stage}
                  onSelect={() => onMove(item, stage.id)}
                >
                  {stage.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {item.talent.headline ? (
        <div className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-muted">
          {item.talent.headline}
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 border-t border-neutral-1000-a05 pt-3">
        <div className="min-w-0">
          <ProfileLabelCell
            emptyLabel="회사 없음"
            labels={item.talent.recentCompanies}
          />
        </div>
        <div className="min-w-0">
          <ProfileLabelCell
            emptyLabel="학교 없음"
            labels={item.talent.recentSchools}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-sm bg-bg-weak px-1.5 py-0.5 text-[10px] leading-4 text-neutral-muted">
          추천 {formatKstRelativeDate(item.recommendedAt)}
        </span>
        {item.roleName ? (
          <span className="rounded-sm bg-bg-weak px-1.5 py-0.5 text-[10px] leading-4 text-neutral-muted">
            {item.roleName}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function OrgPipeline({
  activeRoleId,
  activeRoleName,
  activeRole,
  board,
  currentUserEmail,
  error,
  isLoading,
  onDeleteRole,
  nameQuery,
  onEditRole,
  onNameQueryChange,
  onPauseRole,
  onRecommendedDateChange,
  onResumeRole,
  onSelect,
  onStageChange,
  pendingRecommendationId,
  recommendedFromDate,
  recommendedToDate,
  roleActionPending,
  workspaceId,
}: {
  activeRoleId: string;
  activeRoleName?: string | null;
  activeRole?: OrgRole | null;
  board?: OrgBoardResponse | null;
  currentUserEmail?: string | null;
  error?: Error | null;
  isLoading?: boolean;
  onDeleteRole: (role: OrgRole) => void;
  nameQuery: string;
  onEditRole: () => void;
  onNameQueryChange: (value: string) => void;
  onPauseRole: (role: OrgRole) => void;
  onRecommendedDateChange: (from: string, to: string) => void;
  onResumeRole: (role: OrgRole) => void;
  onSelect: (item: OrgBoardItem) => void;
  onStageChange: (
    item: OrgBoardItem,
    stage: OrgStageId,
    options?: OrgStageChangeOptions
  ) => void;
  pendingRecommendationId?: string | null;
  recommendedFromDate: string;
  recommendedToDate: string;
  roleActionPending?: boolean;
  workspaceId: string;
}) {
  const [dragOverStage, setDragOverStage] = useState<OrgStageId | null>(null);
  const [acceptRequest, setAcceptRequest] = useState<{
    item: OrgBoardItem;
    stage: OrgStageId;
  } | null>(null);
  const [stopItem, setStopItem] = useState<OrgBoardItem | null>(null);
  const [draggedRecommendationId, setDraggedRecommendationId] = useState<
    string | null
  >(null);
  const [customStageDialogOpen, setCustomStageDialogOpen] = useState(false);
  const [editingCustomStage, setEditingCustomStage] = useState<{
    label: string;
    stageId: string;
  } | null>(null);
  const [customStageLabel, setCustomStageLabel] = useState("");
  const [customStageError, setCustomStageError] = useState("");
  const [customStageActionError, setCustomStageActionError] = useState("");
  const createCustomStage = useCreateOrgReviewStage();
  const updateCustomStage = useUpdateOrgReviewStage();
  const deleteCustomStage = useDeleteOrgReviewStage();
  const isCustomStageSubmitting =
    createCustomStage.isPending ||
    updateCustomStage.isPending ||
    deleteCustomStage.isPending;
  const pendingCustomStageId = updateCustomStage.isPending
    ? updateCustomStage.variables?.stageId
    : deleteCustomStage.isPending
      ? deleteCustomStage.variables?.stageId
      : null;
  const viewedStorageKey = useMemo(
    () => buildProfileViewedStorageKey({ currentUserEmail, workspaceId }),
    [currentUserEmail, workspaceId]
  );
  const viewedStorageSnapshot = useSyncExternalStore(
    subscribeProfileViewedStorage,
    () => getProfileViewedStorageSnapshot(viewedStorageKey),
    () => null
  );
  const viewedRecommendationIds = useMemo(
    () => parseProfileViewedIds(viewedStorageSnapshot),
    [viewedStorageSnapshot]
  );

  const markProfileViewed = (item: OrgBoardItem) => {
    const current =
      viewedRecommendationIds ??
      parseProfileViewedIds(
        getProfileViewedStorageSnapshot(viewedStorageKey)
      ) ??
      new Set<string>();
    if (current.has(item.recommendationId)) return;
    const next = new Set(current);
    next.add(item.recommendationId);
    writeProfileViewedIds(viewedStorageKey, next);
  };
  const itemsByStage = useMemo(() => {
    const map = new Map<OrgStageId, OrgBoardItem[]>();
    for (const stage of board?.stages ?? []) map.set(stage.id, []);
    for (const item of board?.items ?? []) {
      const rows = map.get(item.stage) ?? [];
      rows.push(item);
      map.set(item.stage, rows);
    }
    return map;
  }, [board]);
  const itemByRecommendationId = useMemo(
    () =>
      new Map(
        (board?.items ?? []).map((item) => [item.recommendationId, item])
      ),
    [board]
  );
  const preOfferStages = useMemo(
    () =>
      (board?.stages ?? []).filter(
        (stage) =>
          stage.id === "pending_connection" ||
          stage.id === "connected" ||
          Boolean(stage.roleId && stage.roleId === activeRoleId)
      ),
    [activeRoleId, board?.stages]
  );
  const postOfferStages = useMemo(
    () =>
      (board?.stages ?? []).filter(
        (stage) => stage.id === "final_offer" || stage.id === "process_stopped"
      ),
    [board?.stages]
  );

  const requestMove = (item: OrgBoardItem, stage: OrgStageId) => {
    if (item.stage === stage) return;
    if (stage === "process_stopped") {
      setStopItem(item);
      return;
    }
    if (item.stage === "pending_connection") {
      setAcceptRequest({ item, stage });
      return;
    }
    onStageChange(item, stage);
  };

  const handleDrop = (event: DragEvent<HTMLElement>, stage: OrgStage) => {
    event.preventDefault();
    const recommendationId =
      event.dataTransfer.getData("text/plain") || draggedRecommendationId;
    const item = recommendationId
      ? itemByRecommendationId.get(recommendationId)
      : null;
    setDragOverStage(null);
    setDraggedRecommendationId(null);
    if (!item || !canDropToStage(item, stage)) return;
    requestMove(item, stage.id);
  };

  const closeCustomStageDialog = () => {
    setCustomStageDialogOpen(false);
    setEditingCustomStage(null);
    setCustomStageLabel("");
    setCustomStageError("");
  };

  const openCreateCustomStageDialog = () => {
    if (activeRoleId === "all") return;
    setCustomStageActionError("");
    setEditingCustomStage(null);
    setCustomStageLabel("");
    setCustomStageError("");
    setCustomStageDialogOpen(true);
  };

  const openEditCustomStageDialog = (stage: OrgStage) => {
    const stageId = getCustomStageDbId(stage.id);
    if (!stageId) return;
    setCustomStageActionError("");
    setEditingCustomStage({ label: stage.label, stageId });
    setCustomStageLabel(stage.label);
    setCustomStageError("");
    setCustomStageDialogOpen(true);
  };

  const handleCustomStageSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = customStageLabel.trim();
    if (!label) {
      setCustomStageError("칼럼 이름을 입력해 주세요.");
      return;
    }
    if (activeRoleId === "all") return;

    setCustomStageError("");
    setCustomStageActionError("");
    try {
      if (editingCustomStage) {
        await updateCustomStage.mutateAsync({
          label,
          roleId: activeRoleId,
          stageId: editingCustomStage.stageId,
          workspaceId,
        });
      } else {
        await createCustomStage.mutateAsync({
          label,
          roleId: activeRoleId,
          workspaceId,
        });
      }
      closeCustomStageDialog();
    } catch (submitError) {
      setCustomStageActionError(
        submitError instanceof Error
          ? submitError.message
          : "칼럼을 저장하지 못했습니다."
      );
    }
  };

  const handleDeleteCustomStage = (stage: OrgStage) => {
    const stageId = getCustomStageDbId(stage.id);
    if (!stageId || activeRoleId === "all") return;
    if (!window.confirm(`"${stage.label}" 칼럼을 삭제할까요?`)) return;
    setCustomStageActionError("");
    deleteCustomStage.mutate(
      {
        roleId: activeRoleId,
        stageId,
        workspaceId,
      },
      {
        onError: (deleteError) => {
          setCustomStageActionError(
            deleteError instanceof Error
              ? deleteError.message
              : "칼럼을 삭제하지 못했습니다."
          );
        },
      }
    );
  };

  const renderStageColumn = (stage: OrgStage, isLastColumn: boolean) => {
    const items = itemsByStage.get(stage.id) ?? [];
    const draggedItem = draggedRecommendationId
      ? itemByRecommendationId.get(draggedRecommendationId)
      : null;
    const canDrop = Boolean(draggedItem && canDropToStage(draggedItem, stage));
    const isDropTarget = canDrop && dragOverStage === stage.id;
    const customStageId = getCustomStageDbId(stage.id);
    const isEditableCustomStage =
      Boolean(customStageId) && stage.roleId === activeRoleId;

    return (
      <ReviewPipelineColumnShell
        key={stage.id}
        onDragOver={(event) => {
          if (!canDrop) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDragOverStage(stage.id);
        }}
        onDragLeave={(event) => {
          if (
            event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            return;
          }
          setDragOverStage(null);
        }}
        onDrop={(event) => handleDrop(event, stage)}
        canDrop={canDrop}
        isDropTarget={isDropTarget}
        tone={stage.id === "process_stopped" ? "rejected" : "default"}
        className={isLastColumn ? "border-r" : undefined}
      >
        <ReviewPipelineColumnHeader
          count={items.length}
          label={stage.label}
          onEdit={
            isEditableCustomStage
              ? () => openEditCustomStageDialog(stage)
              : undefined
          }
          onDelete={
            isEditableCustomStage
              ? () => handleDeleteCustomStage(stage)
              : undefined
          }
          pending={pendingCustomStageId === customStageId}
        />
        <div className="space-y-2 p-2">
          {isDropTarget ? (
            <ReviewPipelineDropTargetHint label={stage.label} />
          ) : null}
          {items.map((item) => (
            <div
              key={item.recommendationId}
              onDragStart={() =>
                setDraggedRecommendationId(item.recommendationId)
              }
              onDragEnd={() => {
                setDraggedRecommendationId(null);
                setDragOverStage(null);
              }}
            >
              <CandidateCard
                item={item}
                onMove={requestMove}
                onSelect={(selectedItem) => {
                  markProfileViewed(selectedItem);
                  onSelect(selectedItem);
                }}
                pending={pendingRecommendationId === item.recommendationId}
                stages={board?.stages ?? []}
                viewed={
                  viewedRecommendationIds === null ||
                  viewedRecommendationIds.has(item.recommendationId)
                }
              />
            </div>
          ))}
          {items.length === 0 ? <ReviewPipelineEmptyState /> : null}
        </div>
      </ReviewPipelineColumnShell>
    );
  };

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex flex-col gap-2 rounded-md py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-neutral-primary">
            {activeRoleName ?? "Role"} 설정
          </div>
          <div className="mt-1 text-xs leading-5 text-neutral-muted">
            후보자에게 전달되는 역할명, 역할 설명, 위치, 그리고 연결되는 인재에
            대한 요청사항을 수정합니다.
          </div>
        </div>
        <OrgRoleActionsMenu
          role={activeRoleId === "all" ? null : activeRole}
          pending={roleActionPending}
          onEdit={() => onEditRole()}
          onPause={onPauseRole}
          onResume={onResumeRole}
          onDelete={onDeleteRole}
        />
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
            <Input
              value={nameQuery}
              onChange={(event) => onNameQueryChange(event.target.value)}
              placeholder="이름 검색"
              className="h-10 pl-9"
            />
          </label>
          <RecommendedDateFilter
            from={recommendedFromDate}
            onChange={onRecommendedDateChange}
            to={recommendedToDate}
          />
        </div>
      </div>

      {error ? (
        <div className={opsTheme.errorNotice}>{error.message}</div>
      ) : null}
      {customStageActionError && !customStageDialogOpen ? (
        <div className={opsTheme.errorNotice}>{customStageActionError}</div>
      ) : null}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-sm text-neutral-muted">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          불러오는 중
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-0">
            {preOfferStages.map((stage) => renderStageColumn(stage, false))}
            <ReviewPipelineColumnAddRail
              onClick={openCreateCustomStageDialog}
            />
            {postOfferStages.map((stage, index) =>
              renderStageColumn(stage, index === postOfferStages.length - 1)
            )}
          </div>
        </div>
      )}

      <ReviewPipelineStageDialog
        open={customStageDialogOpen}
        mode={editingCustomStage ? "edit" : "create"}
        label={customStageLabel}
        error={customStageError}
        actionError={customStageActionError}
        pending={isCustomStageSubmitting}
        onLabelChange={(value) => {
          setCustomStageLabel(value);
          if (customStageError) setCustomStageError("");
        }}
        onSubmit={(event) => void handleCustomStageSubmit(event)}
        onClose={closeCustomStageDialog}
      />

      <AcceptIntroDialog
        candidateName={acceptRequest ? getDisplayName(acceptRequest.item) : ""}
        defaultEmail={currentUserEmail}
        open={Boolean(acceptRequest)}
        pending={Boolean(
          acceptRequest &&
          pendingRecommendationId === acceptRequest.item.recommendationId
        )}
        onClose={() => setAcceptRequest(null)}
        onSubmit={({ acceptReason, introEmails }) => {
          if (!acceptRequest) return;
          onStageChange(acceptRequest.item, acceptRequest.stage, {
            acceptReason,
            introEmails,
          });
          setAcceptRequest(null);
        }}
      />

      <StopCandidateDialog
        candidateName={stopItem ? getDisplayName(stopItem) : ""}
        defaultReason="company"
        open={Boolean(stopItem)}
        pending={Boolean(
          stopItem && pendingRecommendationId === stopItem.recommendationId
        )}
        showReasonChoice
        onClose={() => setStopItem(null)}
        onSubmit={({ note, reason }) => {
          if (!stopItem) return;
          onStageChange(stopItem, "process_stopped", {
            stopNote: note,
            stopReason: reason,
          });
          setStopItem(null);
        }}
      />
    </section>
  );
}
