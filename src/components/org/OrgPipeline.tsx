import { Archive, LoaderCircle, Search } from "lucide-react";
import {
  type DragEvent,
  type FormEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { OpsDateRangeFilter } from "@/components/ops/OpsDateRangeFilter";
import { opsTheme } from "@/components/ops/theme";
import { BareButton, Button, MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ReviewPipelineColumnAddRail,
  ReviewPipelineColumnHeader,
  ReviewPipelineColumnShell,
  ReviewPipelineDropTargetHint,
  ReviewPipelineEmptyState,
  ReviewPipelineStageDialog,
} from "@/components/review-pipeline/ReviewPipelinePrimitives";
import { PendingConnectionDialog } from "@/components/review-pipeline/PendingConnectionDialog";
import {
  AcceptIntroDialog,
  StopCandidateDialog,
} from "@/components/org/OrgCandidateDecisionDialogs";
import {
  canDropOrgCandidateToStage,
  getOrgCandidateDisplayName,
  OrgCandidateCard,
} from "@/components/org/OrgCandidateCard";
import {
  shouldOpenOrgAcceptIntroDialog,
  shouldOpenOrgStopCandidateDialog,
} from "@/lib/org/candidateDecision";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import { InternalOnlyHatch } from "@/components/org/internal/InternalOnlySurface";
import {
  useCreateOrgReviewStage,
  useDeleteOrgReviewStage,
  useUpdateOrgReviewStage,
} from "@/hooks/org/useOrg";
import {
  useOrgJobsBoard,
  useOrgJobsCandidateActions,
  useOrgJobsFilters,
  useOrgJobsNavigation,
} from "@/hooks/org/useOrgJobs";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import type { OrgBoardItem, OrgStage, OrgStageId } from "@/lib/org/server";
import { cn } from "@/lib/utils";

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

function ArchiveStageToggle({
  active,
  canDrop,
  count,
  isDropTarget,
  onClick,
  onDrop,
  onTargetLeave,
  onTargetOver,
}: {
  active: boolean;
  canDrop: boolean;
  count: number;
  isDropTarget: boolean;
  onClick: () => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onTargetLeave: () => void;
  onTargetOver: () => void;
}) {
  return (
    <BareButton
      type="button"
      aria-pressed={active}
      title={active ? "아카이브 닫기" : "아카이브 열기"}
      onClick={onClick}
      onDragOver={(event) => {
        if (!canDrop) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onTargetOver();
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        onTargetLeave();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (canDrop) onDrop(event);
      }}
      className={cn(
        "relative isolate inline-flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-md border px-3 text-[12px] font-medium transition",
        isDropTarget
          ? "border-primary bg-primary-faded text-primary ring-2 ring-primary/20"
          : active
            ? "border-primary/30 bg-primary-faded text-primary"
            : "border-neutral-1000-a10 bg-bg-floating text-neutral-muted hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary",
        canDrop &&
          !isDropTarget &&
          "border-primary/50 bg-primary-faded/30 text-primary"
      )}
    >
      <InternalOnlyHatch className="opacity-70" />
      <span className="relative z-20 inline-flex items-center gap-2">
        <Archive className="h-3.5 w-3.5" />
        <span>{isDropTarget ? "아카이브로 이동" : "아카이브"}</span>
        <span className="rounded-sm bg-bg-floating px-1.5 py-0.5 text-[10px] text-neutral-muted">
          {count}
        </span>
      </span>
    </BareButton>
  );
}

export function OrgPipeline() {
  const { board, boardQuery, profileLabelsError, profileLabelsLoading } =
    useOrgJobsBoard();
  const {
    changeStage: onStageChange,
    getPendingStage,
    isCandidateStagePending,
  } = useOrgJobsCandidateActions();
  const {
    nameQuery,
    recommendedFromDate,
    recommendedToDate,
    setNameQuery: onNameQueryChange,
    setRecommendedDateRange: onRecommendedDateChange,
  } = useOrgJobsFilters();
  const {
    activeRoleId,
    selectTalent: onSelect,
    workspaceId,
  } = useOrgJobsNavigation();
  const {
    bootstrap,
    currentUser,
    currentUserEmail,
    internalOpsAccess,
    permissions,
  } = useOrgWorkspace();
  const members = bootstrap.members;
  const canManageCandidates = permissions.canManageCandidates;
  const isLoading = boardQuery.isLoading;
  const [dragOverStage, setDragOverStage] = useState<OrgStageId | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [acceptRequest, setAcceptRequest] = useState<{
    item: OrgBoardItem;
    stage: OrgStageId;
  } | null>(null);
  const [pendingConnectionRequest, setPendingConnectionRequest] =
    useState<OrgBoardItem | null>(null);
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
  const pipelineHeaderScrollRef = useRef<HTMLDivElement>(null);
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
      const itemStage = getPendingStage(item) ?? item.stage;
      const rows = map.get(itemStage) ?? [];
      rows.push(item);
      map.set(itemStage, rows);
    }
    return map;
  }, [board, getPendingStage]);
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
  const archiveStage = useMemo(
    () =>
      (board?.stages ?? []).find((stage) => stage.id === "archived") ?? null,
    [board?.stages]
  );
  const draggedItem = draggedRecommendationId
    ? (itemByRecommendationId.get(draggedRecommendationId) ?? null)
    : null;
  const canDropToArchive = Boolean(
    canManageCandidates &&
    archiveStage &&
    draggedItem &&
    draggedItem.stage !== "archived" &&
    canDropOrgCandidateToStage(draggedItem, archiveStage)
  );

  const requestMove = (item: OrgBoardItem, stage: OrgStageId) => {
    if (!canManageCandidates) return;
    if (item.stage === stage) return;
    if (item.stage === "accepted" && stage === "pending_connection") {
      setPendingConnectionRequest(item);
      return;
    }
    if (shouldOpenOrgStopCandidateDialog(item.stage, stage)) {
      setStopItem(item);
      return;
    }
    if (shouldOpenOrgAcceptIntroDialog(item.stage, stage)) {
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
    if (!item || !canDropOrgCandidateToStage(item, stage)) return;
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
    const columnDraggedItem = draggedRecommendationId
      ? itemByRecommendationId.get(draggedRecommendationId)
      : null;
    const canDrop = Boolean(
      columnDraggedItem && canDropOrgCandidateToStage(columnDraggedItem, stage)
    );
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
        className={cn(
          (stage.id === "accepted" || stage.id === "archived") &&
            "relative isolate overflow-hidden",
          isLastColumn && "border-r"
        )}
      >
        {stage.id === "accepted" || stage.id === "archived" ? (
          <InternalOnlyHatch />
        ) : null}
        <ReviewPipelineColumnHeader
          className="lg:hidden"
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
              <OrgCandidateCard
                canManageCandidates={canManageCandidates}
                internalOpsAccess={internalOpsAccess}
                item={item}
                onMove={requestMove}
                onSelect={(selectedItem) => {
                  markViewed(selectedItem.recommendationId);
                  onSelect(selectedItem, items, stage.label);
                }}
                pending={isCandidateStagePending(item)}
                profileLabelsError={profileLabelsError}
                profileLabelsLoading={profileLabelsLoading}
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

  const renderStickyStageHeader = (stage: OrgStage, isLastColumn: boolean) => {
    const items = itemsByStage.get(stage.id) ?? [];
    const columnDraggedItem = draggedRecommendationId
      ? itemByRecommendationId.get(draggedRecommendationId)
      : null;
    const canDrop = Boolean(
      columnDraggedItem && canDropOrgCandidateToStage(columnDraggedItem, stage)
    );
    const isDropTarget = canDrop && dragOverStage === stage.id;
    const customStageId = getCustomStageDbId(stage.id);
    const isEditableCustomStage =
      canManageCandidates &&
      Boolean(customStageId) &&
      stage.roleId === activeRoleId;
    const isInternalStage = stage.id === "accepted" || stage.id === "archived";

    return (
      <div
        className={cn(
          "relative isolate w-[300px] shrink-0 overflow-hidden border-l border-t border-neutral-1000-a10",
          isDropTarget && "ring-2 ring-inset ring-primary/55",
          isLastColumn && "border-r"
        )}
        key={`sticky:${stage.id}`}
        onDragOver={(event) => {
          if (!canManageCandidates || !canDrop) return;
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
      >
        {isInternalStage ? <InternalOnlyHatch /> : null}
        <ReviewPipelineColumnHeader
          className={cn(
            isDropTarget
              ? "bg-primary-faded"
              : canDrop
                ? "bg-primary-faded/30"
                : stage.id === "accepted"
                  ? "bg-positive-faded"
                  : stage.id === "process_stopped"
                    ? "bg-critical-faded/40"
                    : "bg-bg-floating"
          )}
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
      </div>
    );
  };

  return (
    <section className="min-w-0 space-y-4">
      <div
        data-org-pipeline-sticky-actions
        className="flex flex-col gap-2 lg:sticky lg:top-0 lg:z-30 lg:h-14 lg:flex-row lg:items-center lg:justify-between lg:bg-neutral-00/95 lg:py-2 lg:backdrop-blur"
      >
        {internalOpsAccess && archiveStage && (
          <ArchiveStageToggle
            active={archiveOpen}
            canDrop={canDropToArchive}
            count={itemsByStage.get("archived")?.length ?? 0}
            isDropTarget={canDropToArchive && dragOverStage === "archived"}
            onClick={() => setArchiveOpen((current) => !current)}
            onDrop={(event) => handleDrop(event, archiveStage)}
            onTargetLeave={() =>
              setDragOverStage((current) =>
                current === "archived" ? null : current
              )
            }
            onTargetOver={() => setDragOverStage("archived")}
          />
        )}
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

      {customStageActionError && !customStageDialogOpen && !stageToDelete ? (
        <div className={opsTheme.errorNotice}>{customStageActionError}</div>
      ) : null}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-[13px] text-neutral-muted">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          불러오는 중
        </div>
      ) : (
        <>
          <div
            data-org-pipeline-sticky-columns
            className="sticky top-14 z-20 hidden bg-neutral-00/95 backdrop-blur lg:block"
          >
            <div className="overflow-hidden" ref={pipelineHeaderScrollRef}>
              <div className="flex min-w-max gap-0">
                {archiveOpen && archiveStage
                  ? renderStickyStageHeader(archiveStage, false)
                  : null}
                {preOfferStages.map((stage) =>
                  renderStickyStageHeader(stage, false)
                )}
                {canManageCandidates ? (
                  <div className="w-8 shrink-0 border-y border-neutral-1000-a10 bg-bg-default" />
                ) : null}
                {postOfferStages.map((stage, index) =>
                  renderStickyStageHeader(
                    stage,
                    index === postOfferStages.length - 1
                  )
                )}
              </div>
            </div>
          </div>
          <div
            data-org-pipeline-scroll
            className="overflow-x-auto pb-2"
            onScroll={(event) => {
              if (pipelineHeaderScrollRef.current) {
                pipelineHeaderScrollRef.current.scrollLeft =
                  event.currentTarget.scrollLeft;
              }
            }}
          >
            <div className="flex min-w-max gap-0">
              {archiveOpen && archiveStage
                ? renderStageColumn(archiveStage, false)
                : null}
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
        </>
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

      <PendingConnectionDialog
        candidateName={
          pendingConnectionRequest
            ? getOrgCandidateDisplayName(pendingConnectionRequest)
            : "이 후보자"
        }
        onClose={() => setPendingConnectionRequest(null)}
        onConfirm={async (emailMode) => {
          if (!pendingConnectionRequest) return;
          const move = pendingConnectionRequest;
          const request = onStageChange(move, "pending_connection", {
            emailMode,
          });
          setPendingConnectionRequest(null);
          await request;
        }}
        open={Boolean(pendingConnectionRequest)}
        pending={
          Boolean(pendingConnectionRequest) &&
          Boolean(
            pendingConnectionRequest &&
            isCandidateStagePending(pendingConnectionRequest)
          )
        }
        recipientEmail={pendingConnectionRequest?.talent.email}
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
        candidateEmail={acceptRequest?.item.talent.email}
        candidateName={
          acceptRequest ? getOrgCandidateDisplayName(acceptRequest.item) : ""
        }
        companyContactName={currentUser?.name}
        defaultContactDirectly={isInternalDomainEmail(currentUserEmail)}
        defaultEmail={currentUserEmail}
        members={members}
        open={Boolean(acceptRequest)}
        pending={Boolean(
          acceptRequest && isCandidateStagePending(acceptRequest.item)
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
        roleTitle={acceptRequest?.item.roleName ?? ""}
      />

      <StopCandidateDialog
        candidateName={stopItem ? getOrgCandidateDisplayName(stopItem) : ""}
        connectionStarted={Boolean(
          stopItem && stopItem.stage !== "pending_connection"
        )}
        open={Boolean(stopItem)}
        pending={Boolean(stopItem && isCandidateStagePending(stopItem))}
        onClose={() => setStopItem(null)}
        onSubmit={async ({ note }) => {
          if (!stopItem) return;
          await onStageChange(stopItem, "process_stopped", {
            stopNote: note,
          });
          setStopItem(null);
        }}
      />
    </section>
  );
}

// select COUNT(*) from company_roles where length(description)<20 AND status='active' and is_expired=false;
