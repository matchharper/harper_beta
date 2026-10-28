import TalentCareerModal from "@/components/common/TalentCareerModal";
import { OrgSavedCandidates } from "./OrgSavedCandidates";
import { useRouter } from "next/router";
import { useOrgSourceT, useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { LoaderCircle } from "lucide-react";
import {
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { opsTheme } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import {
  isOrgInboxStage,
  ORG_STAGE_DESCRIPTIONS,
} from "@/lib/org/pipelineStage";

import {
  ReviewPipelineColumnHeader,
  ReviewPipelineColumnShell,
  ReviewPipelineDropTargetHint,
  ReviewPipelineEmptyState,
  ReviewPipelineStageDialog,
} from "@/components/review-pipeline/ReviewPipelinePrimitives";
import { StopCandidateDialog } from "@/components/org/OrgCandidateDecisionDialogs";
import {
  OrgStageMoveDialog,
  toOrgStageMoveCandidate,
} from "@/components/org/OrgStageMoveDialog";
import { CompanyIntroRequestDialog } from "@/components/org/CompanyIntroDecisionDialogs";
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
  usePassOrgCompanyIntro,
  useRequestOrgCompanyIntro,
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
import { suggestOrgStopReasons } from "@/lib/org/evaluationSuggestions";
import { useToastStore } from "@/store/useToastStore";
import { useOrgDeferredActionStore } from "@/store/useOrgDeferredActionStore";
import { useOrgCandidateDecisionRunner } from "@/hooks/org/useOrgCandidateDecisionRunner";

function getCustomStageDbId(stageId: OrgStageId) {
  return stageId.startsWith("custom:") ? stageId.slice("custom:".length) : "";
}

export function OrgPipeline({
  displayControl,
}: {
  displayControl?: ReactNode;
}) {
  const { c, locale } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const { board, boardQuery, profileLabelsError, profileLabelsLoading } =
    useOrgJobsBoard();
  const {
    changeStage: onStageChange,
    getPendingStage,
    isCandidateStagePending,
    requestCandidateReengagementBeforeStageChange,
  } = useOrgJobsCandidateActions();
  const {
    activeRoleId,
    selectTalent: onSelect,
    workspaceId,
  } = useOrgJobsNavigation();
  const { bootstrap, currentUserEmail, internalOpsAccess, permissions } =
    useOrgWorkspace();
  const members = bootstrap.members;
  const canManageCandidates = permissions.canManageCandidates;
  const isLoading = boardQuery.isLoading;
  const decisions = useOrgCandidateDecisionRunner(workspaceId);
  const deferredStages = useOrgDeferredActionStore(
    (state) => state.deferredStages
  );
  const [expandedStoppedRoleId, setExpandedStoppedRoleId] = useState<
    string | null
  >(null);
  // Candidates a decision toast sent here ("보기") are marked for a moment.
  const router = useRouter();
  const highlightParam = String(router.query.highlight ?? "");
  const highlighted = useMemo(
    () => new Set(highlightParam.split(",").filter(Boolean)),
    [highlightParam]
  );
  const [dragOverStage, setDragOverStage] = useState<OrgStageId | null>(null);
  const [acceptRequest, setAcceptRequest] = useState<{
    item: OrgBoardItem;
    reengagementResolution?: "company_confirmed";
    stage: OrgStageId;
  } | null>(null);
  const [stopItem, setStopItem] = useState<OrgBoardItem | null>(null);
  const [companyIntroRequest, setCompanyIntroRequest] = useState<{
    item: OrgBoardItem;
  } | null>(null);

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
  const requestCompanyIntro = useRequestOrgCompanyIntro();
  const passCompanyIntro = usePassOrgCompanyIntro();
  const addToast = useToastStore((state) => state.add);
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
      if (item.savedAt) continue;
      const deferredStage = deferredStages.get(item.recommendationId);
      if (deferredStage === null) continue;
      const itemStage =
        (deferredStage as OrgStageId | undefined) ??
        getPendingStage(item) ??
        item.stage;
      const rows = map.get(itemStage) ?? [];
      rows.push(item);
      map.set(itemStage, rows);
    }
    return map;
  }, [board, deferredStages, getPendingStage]);
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
          !isOrgInboxStage(stage.id) &&
          (stage.id === "intro_requested" ||
            stage.id === "connected" ||
            Boolean(stage.roleId && stage.roleId === activeRoleId))
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

  const scrolledTo = useRef("");
  useEffect(() => {
    if (!highlightParam) return;
    if (scrolledTo.current !== highlightParam) {
      const card = document.querySelector("[data-pipeline-highlight]");
      if (card) {
        scrolledTo.current = highlightParam;
        card.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
    const timer = window.setTimeout(() => {
      const query = { ...router.query };
      delete query.highlight;
      void router.replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
        scroll: false,
      });
    }, 8_000);
    return () => window.clearTimeout(timer);
  }, [highlightParam, itemsByStage, router]);

  const continueMove = (
    item: OrgBoardItem,
    stage: OrgStageId,
    reengagementResolution?: "company_confirmed"
  ) => {
    if (shouldOpenOrgStopCandidateDialog(item.stage, stage)) {
      setStopItem(item);
      return;
    }
    if (shouldOpenOrgAcceptIntroDialog(item.stage, stage)) {
      setAcceptRequest({ item, reengagementResolution, stage });
      return;
    }
    void Promise.resolve(
      onStageChange(
        item,
        stage,
        reengagementResolution ? { reengagementResolution } : undefined
      )
    ).catch(() => undefined);
  };

  const requestMove = (item: OrgBoardItem, stage: OrgStageId) => {
    if (!canManageCandidates || item.stage === stage) return;
    if (item.source === "company_intro") {
      if (item.companyIntro?.status !== "ready") return;
      setCompanyIntroRequest({
        item,
      });
      return;
    }
    if (
      requestCandidateReengagementBeforeStageChange(item, stage, () =>
        continueMove(item, stage, "company_confirmed")
      )
    ) {
      return;
    }
    continueMove(item, stage);
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
      setCustomStageError(
        c("칼럼 이름을 입력해 주세요.", "Enter column name.")
      );
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
          : c("칼럼을 저장하지 못했습니다.", "Failed to save column.")
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
          : c("칼럼을 삭제하지 못했습니다.", "Failed to delete column.")
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
    const isStoppedStage = stage.id === "process_stopped";
    const collapsed =
      isStoppedStage &&
      expandedStoppedRoleId !== activeRoleId &&
      !items.some((item) => highlighted.has(item.recommendationId));

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
          "!flex !h-full !min-h-0 !w-[320px] !flex-col !border-0 !bg-transparent !ring-0",
          isInternalAcceptedStage && "relative isolate overflow-hidden"
        )}
      >
        {isStoppedStage ? (
          <MuteButton
            type="button"
            variant="transparent"
            aria-expanded={!collapsed}
            onClick={() =>
              setExpandedStoppedRoleId(collapsed ? activeRoleId : null)
            }
            className="w-full shrink-0"
          >
            <span className="flex h-8 w-full items-center justify-between gap-2 text-sm font-normal">
              <span>{sourceT(stage.label)}</span>
              <span className="text-neutral-muted">{items.length}</span>
            </span>
          </MuteButton>
        ) : (
          <ReviewPipelineColumnHeader
            compact
            className="shrink-0 !border-x-0"
            count={items.length}
            countPlacement="end"
            description={sourceT(ORG_STAGE_DESCRIPTIONS[stage.id] ?? "")}
            label={sourceT(stage.label)}
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
        )}
        {isInternalAcceptedStage ? <InternalOnlyHatch /> : null}
        {/* A collapsed column keeps its bordered body so column dividers stay
            continuous; only its cards are hidden. */}
        <div
          className={cn(
            "min-h-0 flex-1 space-y-1.5 border-l border-neutral-1000-a10 px-1.5 py-1.5 transition-colors",
            isLastColumn && "border-r",
            isDropTarget
              ? "bg-primary-faded/55 ring-2 ring-inset ring-primary/55"
              : canDrop
                ? "bg-primary-faded/20"
                : stage.id === "process_stopped" && !collapsed
                  ? "bg-critical-faded/40"
                  : ""
          )}
        >
          {isDropTarget && <ReviewPipelineDropTargetHint label={stage.label} />}
          {!collapsed &&
            items.map((item) => (
              <div
                className={cn(
                  "rounded-lg transition-shadow duration-300",
                  highlighted.has(item.recommendationId) &&
                    "ring-2 ring-neutral-900 ring-offset-2 ring-offset-neutral-50"
                )}
                data-pipeline-highlight={
                  highlighted.has(item.recommendationId) ? "" : undefined
                }
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
                  onPass={async (item, reason) => {
                    if (item.companyIntro)
                      await passCompanyIntro.mutateAsync({
                        introCandidateId: item.companyIntro.id,
                        workspaceId,
                        reason,
                      });
                  }}
                  onRequestIntro={(item) => setCompanyIntroRequest({ item })}
                  onSelect={(selectedItem) => {
                    markViewed(selectedItem.recommendationId);
                    onSelect(selectedItem, items, stage.label);
                  }}
                  pending={
                    isCandidateStagePending(item) || passCompanyIntro.isPending
                  }
                  profileLabelsError={profileLabelsError}
                  profileLabelsLoading={profileLabelsLoading}
                  stages={board?.stages ?? []}
                  viewed={isViewed(item.recommendationId)}
                />
              </div>
            ))}
          {!collapsed && items.length === 0 ? (
            <ReviewPipelineEmptyState className="border-0 bg-transparent" />
          ) : null}
        </div>
      </ReviewPipelineColumnShell>
    );
  };

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2 bg-neutral-50">
      {displayControl ? (
        <div className="flex shrink-0 justify-end px-6">{displayControl}</div>
      ) : null}
      {customStageActionError && !customStageDialogOpen && !stageToDelete ? (
        <div className={opsTheme.errorNotice}>{customStageActionError}</div>
      ) : null}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-[13px] text-neutral-muted">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          {c("불러오는 중", "Loading")}
        </div>
      ) : (
        <div
          data-org-pipeline-scroll
          className="min-h-0 flex-1 px-6 overflow-auto overscroll-contain pb-0"
        >
          <div className="flex h-full min-h-[560px] min-w-max items-stretch gap-0">
            <OrgSavedCandidates />
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

      <TalentCareerModal
        open={Boolean(stageToDelete)}
        onClose={() => {
          if (!deleteCustomStage.isPending) setStageToDelete(null);
        }}
        mobileBottomSheet
        title={<>{c("칼럼 삭제", "Delete column")}</>}
        description={
          <>
            {c(
              "“{stageLabel}” 칼럼을 삭제합니다. 후보자가 남아 있다면 먼저 다른 칼럼으로 이동해 주세요.",
              "Delete the “{stageLabel}” column? Move any candidates to another column first.",
              {
                stageLabel: stageToDelete?.label ?? "",
              }
            )}
          </>
        }
        panelClassName="max-w-sm"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MuteButton
              disabled={deleteCustomStage.isPending}
              onClick={() => setStageToDelete(null)}
              size="md"
              type="button"
            >
              {c("취소", "Cancel")}
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
              {c("삭제", "Delete")}
            </MuteButton>
          </div>
        }
      >
        {customStageActionError ? (
          <div className="text-[12px] text-critical" role="alert">
            {customStageActionError}
          </div>
        ) : null}
      </TalentCareerModal>

      <OrgStageMoveDialog
        key={acceptRequest?.item.recommendationId ?? "stage-move-dialog"}
        allowContactDirectly={isInternalDomainEmail(currentUserEmail)}
        candidates={
          acceptRequest
            ? [
                {
                  ...toOrgStageMoveCandidate(
                    acceptRequest.item,
                    sourceT(getOrgCandidateDisplayName(acceptRequest.item))
                  ),
                  // Already confirmed in the reengagement dialog.
                  processClosureNoticeUnresolved: false,
                },
              ]
            : []
        }
        initialStage={acceptRequest?.stage}
        members={members}
        onClose={() => setAcceptRequest(null)}
        onSubmit={(submit) => {
          if (!acceptRequest) return;
          const { item, reengagementResolution } = acceptRequest;
          decisions.move([item], {
            ...submit,
            options: (candidate) => ({
              ...submit.options(candidate),
              reengagementResolution,
            }),
          });
          setAcceptRequest(null);
        }}
        open={Boolean(acceptRequest)}
        roleId={acceptRequest?.item.roleId ?? null}
        roleTitle={acceptRequest?.item.roleName ?? ""}
        stages={board?.stages ?? []}
      />

      <StopCandidateDialog
        candidateName={
          stopItem ? sourceT(getOrgCandidateDisplayName(stopItem)) : ""
        }
        connectionStarted={Boolean(
          stopItem && stopItem.stage !== "pending_connection"
        )}
        open={Boolean(stopItem)}
        pending={Boolean(stopItem && isCandidateStagePending(stopItem))}
        onClose={() => setStopItem(null)}
        onSubmit={({ note, notifyCandidateOnClosure }) => {
          if (!stopItem) return;
          decisions.reject([stopItem], { note, notifyCandidateOnClosure });
          setStopItem(null);
        }}
        suggestedReasons={
          stopItem
            ? [suggestOrgStopReasons(stopItem.criteriaEvaluations, locale)]
            : undefined
        }
      />

      <CompanyIntroRequestDialog
        key={companyIntroRequest?.item.companyIntro?.id ?? "closed"}
        candidateName={
          companyIntroRequest
            ? sourceT(getOrgCandidateDisplayName(companyIntroRequest.item))
            : ""
        }
        roleId={companyIntroRequest?.item.roleId}
        workspaceId={workspaceId}
        members={members}
        defaultEmail={currentUserEmail}
        onClose={() => setCompanyIntroRequest(null)}
        onSubmit={async ({ companyAppeal, introRecipientEmails }) => {
          if (!companyIntroRequest?.item.companyIntro) return;
          await requestCompanyIntro.mutateAsync({
            companyAppeal,
            introCandidateId: companyIntroRequest.item.companyIntro.id,
            introRecipientEmails,
            workspaceId,
          });
          setCompanyIntroRequest(null);
          addToast({
            message: c("Intro를 요청했어요.", "Intro requested."),
            variant: "success",
          });
        }}
        open={Boolean(companyIntroRequest)}
        pending={requestCompanyIntro.isPending}
      />
    </section>
  );
}

// select COUNT(*) from company_roles where length(description)<20 AND status='active' and is_expired=false;
