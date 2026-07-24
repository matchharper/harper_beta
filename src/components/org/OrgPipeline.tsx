import Image from "next/image";
import { LoaderCircle, MoreHorizontal, Search } from "lucide-react";
import { type DragEvent, type FormEvent, useMemo, useState } from "react";
import { OpsDateRangeFilter } from "@/components/ops/OpsDateRangeFilter";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { ProfileLabelCell } from "@/components/ops/matching/MatchingTalentCells";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  BareButton,
  Button,
  MuteButton,
} from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { InternalOnlyHatch } from "@/components/org/internal/InternalOnlySurface";
import { OrgRoleActionsMenu } from "@/components/org/OrgRoleActionsMenu";
import {
  useCreateOrgReviewStage,
  useDeleteOrgReviewStage,
  useUpdateOrgReviewStage,
} from "@/hooks/org/useOrg";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import type {
  OrgBoardItem,
  OrgBoardResponse,
  OrgMember,
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
  canManageCandidates,
  item,
  onMove,
  onSelect,
  pending,
  stages,
  viewed,
}: {
  canManageCandidates: boolean;
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
      draggable={canManageCandidates && !pending}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
      onDragStart={(event) => {
        if (!canManageCandidates) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.recommendationId);
      }}
      className={cx(
        "rounded-sm border border-neutral-1000-a05 bg-bg-floating p-3 transition hover:border-neutral-1000-a10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
        canManageCandidates
          ? "cursor-grab active:cursor-grabbing"
          : "cursor-pointer",
        pending && "cursor-wait opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        {item.talent.profilePicture ? (
          <Image
            src={item.talent.profilePicture}
            alt=""
            width={36}
            height={36}
            unoptimized
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[12px] font-medium text-neutral-muted">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-[14px] font-medium text-neutral-primary">
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
        {canManageCandidates ? (
          <div
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <MuteButton
                  aria-label="후보자 이동"
                  size="sm"
                  variant="transparent"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </MuteButton>
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
        ) : null}
      </div>

      {item.talent.headline ? (
        <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-neutral-muted">
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
      {item.stage === "pending_connection" ? (
        <div className="-mx-3 mt-3 bg-critical-faded px-3 py-1.5 text-[11px] font-medium text-critical">
          결정이 필요합니다
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-sm bg-bg-weak px-2 py-1 text-[11px] leading-4 text-neutral-muted">
          추천 {formatKstRelativeDate(item.recommendedAt)}
        </span>
        {item.roleName ? (
          <span className="rounded-sm bg-bg-weak px-2 py-1 text-[11px] leading-4 text-neutral-muted">
            {item.roleName}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function OrgPipeline({
  canManageCandidates = true,
  activeRoleId,
  activeRoleName,
  activeRole,
  board,
  currentUserEmail,
  error,
  isLoading,
  members = [],
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
  canManageCandidates?: boolean;
  activeRoleId: string;
  activeRoleName?: string | null;
  activeRole?: OrgRole | null;
  board?: OrgBoardResponse | null;
  currentUserEmail?: string | null;
  error?: Error | null;
  isLoading?: boolean;
  members?: Pick<OrgMember, "email" | "name" | "userId">[];
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
  ) => void | Promise<void>;
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
  const [stageToDelete, setStageToDelete] = useState<OrgStage | null>(null);
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
  const { isViewed, markViewed } = useOrgViewedRecommendations({
    currentUserEmail,
    workspaceId,
  });
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
          stage.id === "accepted" ||
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
    if (!canManageCandidates) return;
    if (item.stage === stage) return;
    if (stage === "process_stopped") {
      setStopItem(item);
      return;
    }
    if (item.stage === "pending_connection" && stage !== "accepted") {
      setAcceptRequest({ item, stage });
      return;
    }
    void Promise.resolve(onStageChange(item, stage)).catch(() => undefined);
  };

  const handleDrop = (event: DragEvent<HTMLElement>, stage: OrgStage) => {
    if (!canManageCandidates) return;
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
    if (!canManageCandidates) return;
    if (activeRoleId === "all") return;
    setCustomStageActionError("");
    setEditingCustomStage(null);
    setCustomStageLabel("");
    setCustomStageError("");
    setCustomStageDialogOpen(true);
  };

  const openEditCustomStageDialog = (stage: OrgStage) => {
    if (!canManageCandidates) return;
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
    if (!canManageCandidates) return;
    const stageId = getCustomStageDbId(stage.id);
    if (!stageId || activeRoleId === "all") return;
    setCustomStageActionError("");
    setStageToDelete(stage);
  };

  const confirmDeleteCustomStage = async () => {
    if (!stageToDelete || activeRoleId === "all") return;
    const stageId = getCustomStageDbId(stageToDelete.id);
    if (!stageId) return;
    setCustomStageActionError("");
    try {
      await deleteCustomStage.mutateAsync({
        roleId: activeRoleId,
        stageId,
        workspaceId,
      });
      setStageToDelete(null);
    } catch (deleteError) {
      setCustomStageActionError(
        deleteError instanceof Error
          ? deleteError.message
          : "칼럼을 삭제하지 못했습니다."
      );
    }
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
      canManageCandidates &&
      Boolean(customStageId) &&
      stage.roleId === activeRoleId;

    return (
      <ReviewPipelineColumnShell
        key={stage.id}
        onDragOver={(event) => {
          if (!canManageCandidates) return;
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
        tone={
          stage.id === "accepted"
            ? "accepted"
            : stage.id === "process_stopped"
              ? "rejected"
              : "default"
        }
        className={cx(
          stage.id === "accepted" && "relative isolate overflow-hidden",
          isLastColumn && "border-r"
        )}
      >
        {stage.id === "accepted" ? <InternalOnlyHatch /> : null}
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
        <div className="space-y-1.5 p-1.5">
          {isDropTarget ? (
            <ReviewPipelineDropTargetHint label={stage.label} />
          ) : null}
          {items.map((item) => (
            <div
              key={item.recommendationId}
              onDragStart={() => {
                if (canManageCandidates) {
                  setDraggedRecommendationId(item.recommendationId);
                }
              }}
              onDragEnd={() => {
                setDraggedRecommendationId(null);
                setDragOverStage(null);
              }}
            >
              <CandidateCard
                canManageCandidates={canManageCandidates}
                item={item}
                onMove={requestMove}
                onSelect={(selectedItem) => {
                  markViewed(selectedItem.recommendationId);
                  onSelect(selectedItem);
                }}
                pending={pendingRecommendationId === item.recommendationId}
                stages={board?.stages ?? []}
                viewed={isViewed(item.recommendationId)}
              />
            </div>
          ))}
          {items.length === 0 ? <ReviewPipelineEmptyState /> : null}
        </div>
      </ReviewPipelineColumnShell>
    );
  };

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-col gap-2 rounded-md py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium text-neutral-primary">
            {activeRoleName ?? "Role"} 설정
          </div>
          <div className="mt-1 text-[13px] leading-5 text-neutral-muted">
            후보자에게 전달되는 역할명, 역할 설명, 위치, 그리고 연결되는 인재에
            대한 요청사항을 수정합니다.
          </div>
        </div>
        {canManageCandidates ? (
          <OrgRoleActionsMenu
            role={activeRoleId === "all" ? null : activeRole}
            pending={roleActionPending}
            onEdit={() => onEditRole()}
            onPause={onPauseRole}
            onResume={onResumeRole}
            onDelete={onDeleteRole}
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
            <Input
              value={nameQuery}
              onChange={(event) => onNameQueryChange(event.target.value)}
              placeholder="이름 검색"
              className="h-10 pl-9 text-[13px]"
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
      {customStageActionError &&
      !customStageDialogOpen &&
      !stageToDelete ? (
        <div className={opsTheme.errorNotice}>{customStageActionError}</div>
      ) : null}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-[13px] text-neutral-muted">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          불러오는 중
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-0">
            {preOfferStages.map((stage) => renderStageColumn(stage, false))}
            {canManageCandidates ? (
              <ReviewPipelineColumnAddRail
                onClick={openCreateCustomStageDialog}
              />
            ) : null}
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

      <Dialog
        open={Boolean(stageToDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteCustomStage.isPending) setStageToDelete(null);
        }}
      >
        <DialogContent className="max-w-sm gap-4 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-[17px]">칼럼 삭제</DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              “{stageToDelete?.label}” 칼럼을 삭제합니다. 후보자가 남아 있다면
              먼저 다른 칼럼으로 이동해 주세요.
            </DialogDescription>
          </DialogHeader>
          {customStageActionError ? (
            <div className="text-[12px] text-critical" role="alert">
              {customStageActionError}
            </div>
          ) : null}
          <DialogFooter>
            <MuteButton
              disabled={deleteCustomStage.isPending}
              onClick={() => setStageToDelete(null)}
              size="md"
              type="button"
            >
              취소
            </MuteButton>
            <MuteButton
              disabled={deleteCustomStage.isPending}
              onClick={() => void confirmDeleteCustomStage()}
              size="md"
              type="button"
              variant="warn"
            >
              {deleteCustomStage.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              삭제
            </MuteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AcceptIntroDialog
        candidateName={acceptRequest ? getDisplayName(acceptRequest.item) : ""}
        defaultEmail={currentUserEmail}
        members={members}
        open={Boolean(acceptRequest)}
        pending={Boolean(
          acceptRequest &&
          pendingRecommendationId === acceptRequest.item.recommendationId
        )}
        onClose={() => setAcceptRequest(null)}
        onSubmit={async ({ acceptReason, contactDirectly, introEmails }) => {
          if (!acceptRequest) return;
          await onStageChange(acceptRequest.item, acceptRequest.stage, {
            acceptReason,
            contactDirectly,
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
        onSubmit={async ({ note, reason }) => {
          if (!stopItem) return;
          await onStageChange(stopItem, "process_stopped", {
            stopNote: note,
            stopReason: reason,
          });
          setStopItem(null);
        }}
      />
    </section>
  );
}
