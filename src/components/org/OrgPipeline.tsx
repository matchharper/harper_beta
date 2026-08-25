import { LoaderCircle } from "lucide-react";
import { type DragEvent, type FormEvent, useMemo, useState } from "react";
import { opsTheme } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
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
import {
  canDropOrgCandidateToStage,
  getOrgCandidateDisplayName,
  OrgCandidateCard,
} from "@/components/org/OrgCandidateCard";
import { InternalOnlyHatch } from "@/components/org/internal/InternalOnlySurface";
import {
  shouldOpenOrgAcceptIntroDialog,
  shouldOpenOrgStopCandidateDialog,
} from "@/lib/org/candidateDecision";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import {
  useCreateOrgReviewStage,
  useDeleteOrgReviewStage,
  useUpdateOrgReviewStage,
} from "@/hooks/org/useOrg";
import {
  useOrgJobsBoard,
  useOrgJobsCandidateActions,
  useOrgJobsNavigation,
} from "@/hooks/org/useOrgJobs";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import type { OrgBoardItem, OrgStage, OrgStageId } from "@/lib/org/server";
import { cn } from "@/lib/utils";

function getCustomStageDbId(stageId: OrgStageId) {
  return stageId.startsWith("custom:") ? stageId.slice("custom:".length) : "";
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
  const acceptedStages = useMemo(
    () =>
      internalOpsAccess
        ? (board?.stages ?? []).filter((stage) => stage.id === "accepted")
        : [],
    [board?.stages, internalOpsAccess]
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
  const lastPreOfferStageId = preOfferStages.at(-1)?.id ?? null;

  const requestMove = (item: OrgBoardItem, stage: OrgStageId) => {
    if (!canManageCandidates) return;
    if (item.stage === stage) return;
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
    const canAddCustomStage =
      canManageCandidates &&
      activeRoleId !== "all" &&
      stage.id === lastPreOfferStageId;
    const isInternalAcceptedStage = stage.id === "accepted";

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
        tone={stage.id === "process_stopped" ? "rejected" : "default"}
        className={cn(
          "!flex !h-full !min-h-0 !w-[280px] !flex-col !border-0 !bg-transparent !ring-0",
          isInternalAcceptedStage && "relative isolate overflow-hidden"
        )}
      >
        <ReviewPipelineColumnHeader
          compact
          className="shrink-0 !border-x-0"
          count={items.length}
          label={stage.label}
          onAdd={canAddCustomStage ? openCreateCustomStageDialog : undefined}
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
        {isInternalAcceptedStage ? <InternalOnlyHatch /> : null}
        <div
          className={cn(
            "min-h-0 flex-1 space-y-1.5 border-l border-neutral-1000-a10 px-1.5 py-1.5 transition-colors",
            isLastColumn && "border-r",
            isDropTarget
              ? "bg-primary-faded/55 ring-2 ring-inset ring-primary/55"
              : canDrop
                ? "bg-primary-faded/20"
                : stage.id === "process_stopped"
                  ? "bg-critical-faded/40"
                  : "bg-bg-default"
          )}
        >
          {isDropTarget && <ReviewPipelineDropTargetHint label={stage.label} />}
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
          {items.length === 0 ? (
            <ReviewPipelineEmptyState className="border-0 bg-transparent" />
          ) : null}
        </div>
      </ReviewPipelineColumnShell>
    );
  };

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      {customStageActionError && !customStageDialogOpen && !stageToDelete ? (
        <div className={opsTheme.errorNotice}>{customStageActionError}</div>
      ) : null}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-[13px] text-neutral-muted">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          불러오는 중
        </div>
      ) : (
        <div
          data-org-pipeline-scroll
          className="min-h-0 flex-1 overflow-x-auto pb-0"
        >
          <div className="flex h-full min-h-[560px] min-w-max items-stretch gap-0">
            {acceptedStages.map((stage) => renderStageColumn(stage, false))}
            {preOfferStages.map((stage) => renderStageColumn(stage, false))}
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
        allowContactDirectly={isInternalDomainEmail(currentUserEmail)}
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
