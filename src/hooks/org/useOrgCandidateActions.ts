import { useMemo, useRef, useState } from "react";
import {
  usePendingOrgCandidateStageMutations,
  useSetOrgCandidateStage,
} from "@/hooks/org/useOrg";
import {
  buildPendingOrgCandidateStageMap,
  getOrgCandidateStageMutationIdentity,
  orgCandidateStageWasUpdated,
  type OrgCandidateStageMutationInput,
  type OrgCandidateStageMutationResponse,
} from "@/lib/org/candidateStageClient";
import { shouldOpenOrgCandidateReengagementDialog } from "@/lib/org/candidateDecision";
import type {
  OrgBoardItem,
  OrgStageChangeOptions,
  OrgStageId,
  OrgTalentDetailResponse,
} from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";

export function useOrgCandidateActions(args: {
  activeDetailRecommendationId: string;
  activeDetailRoleId: string;
  activeDetailTalentId: string;
  canManageCandidates: boolean;
  detail?: OrgTalentDetailResponse | null;
  workspaceId: string;
}) {
  const addToast = useToastStore((state) => state.add);
  const setStage = useSetOrgCandidateStage();
  const pendingStageMutations = usePendingOrgCandidateStageMutations();
  const locallyPendingCandidateKeysRef = useRef(new Set<string>());
  const [candidateReengagement, setCandidateReengagement] = useState<{
    input: OrgCandidateStageMutationInput;
    onCompanyConfirmed?: () => void;
    response: Extract<
      OrgCandidateStageMutationResponse,
      { status: "candidate_reengagement_required" }
    >;
  } | null>(null);
  const pendingStageByCandidateKey = useMemo(
    () =>
      buildPendingOrgCandidateStageMap(pendingStageMutations, args.workspaceId),
    [args.workspaceId, pendingStageMutations]
  );
  const getCandidateKey = (candidate: { roleId: string; talentId: string }) =>
    getOrgCandidateStageMutationIdentity({
      ...candidate,
      workspaceId: args.workspaceId,
    });
  const getPendingStage = (candidate: { roleId: string; talentId: string }) =>
    pendingStageByCandidateKey.get(getCandidateKey(candidate))?.stage ?? null;
  const isCandidateStagePending = (candidate: {
    roleId: string;
    talentId: string;
  }) => {
    const candidateKey = getCandidateKey(candidate);
    return (
      pendingStageByCandidateKey.has(candidateKey) ||
      locallyPendingCandidateKeysRef.current.has(candidateKey)
    );
  };
  const runStageMutation = async (input: OrgCandidateStageMutationInput) => {
    const mutationInput = {
      ...input,
      reengagementActionId: input.reengagementActionId ?? crypto.randomUUID(),
    };
    const candidateKey = getOrgCandidateStageMutationIdentity(mutationInput);
    if (
      pendingStageByCandidateKey.has(candidateKey) ||
      locallyPendingCandidateKeysRef.current.has(candidateKey)
    ) {
      return null;
    }

    locallyPendingCandidateKeysRef.current.add(candidateKey);
    try {
      const result = await setStage.mutateAsync(mutationInput);
      if (
        "status" in result &&
        result.status === "candidate_reengagement_required"
      ) {
        setCandidateReengagement({ input: mutationInput, response: result });
        return null;
      }
      if (
        "status" in result &&
        result.status === "candidate_reengagement_requested"
      ) {
        setCandidateReengagement(null);
        addToast({
          message:
            "Harper가 후보자에게 다시 진행할 의향을 물어볼게요. 답변이 오면 회사에 알려드립니다.",
          variant: "success",
        });
        return null;
      }
      setCandidateReengagement(null);
      return orgCandidateStageWasUpdated(result) ? result : null;
    } finally {
      locallyPendingCandidateKeysRef.current.delete(candidateKey);
    }
  };

  const resolveCandidateReengagement = async (
    resolution: "ask_candidate" | "company_confirmed"
  ) => {
    if (!candidateReengagement) return null;
    if (
      resolution === "company_confirmed" &&
      candidateReengagement.onCompanyConfirmed
    ) {
      const continueOriginalAction = candidateReengagement.onCompanyConfirmed;
      setCandidateReengagement(null);
      continueOriginalAction();
      return null;
    }
    try {
      const result = await runStageMutation({
        ...candidateReengagement.input,
        reengagementResolution: resolution,
      });
      if (resolution === "company_confirmed" && result) {
        addToast({
          message: "후보자의 진행 상태를 복구하고 요청한 변경을 반영했습니다.",
          variant: "success",
        });
      }
      return result;
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "후보자 재진행 요청을 처리하지 못했습니다.",
        variant: "error",
      });
      return null;
    }
  };

  const requestCandidateReengagementBeforeStageChange = (
    item: OrgBoardItem,
    stage: OrgStageId,
    onCompanyConfirmed: () => void
  ) => {
    if (
      !args.canManageCandidates ||
      !shouldOpenOrgCandidateReengagementDialog(item, stage)
    ) {
      return false;
    }

    const requestStage =
      item.stage === "pending_connection" && stage === "connected"
        ? "pending_connection"
        : stage;
    const input: OrgCandidateStageMutationInput = {
      recommendationId: item.recommendationId,
      reengagementActionId: crypto.randomUUID(),
      roleId: item.roleId,
      sourceStage: item.stage,
      stage: requestStage,
      talentId: item.talentId,
      workspaceId: args.workspaceId,
    };
    setCandidateReengagement({
      input,
      onCompanyConfirmed,
      response: {
        candidateName: item.talent.name || item.talent.email || "후보자",
        currentStage: item.stage,
        ok: true,
        requestedStage: requestStage,
        roleId: item.roleId,
        roleName: item.roleName ?? "해당 역할",
        status: "candidate_reengagement_required",
        talentId: item.talentId,
      },
    });
    return true;
  };

  const changeStage = async (
    item: OrgBoardItem,
    stage: OrgStageId,
    options?: OrgStageChangeOptions
  ) => {
    if (!args.canManageCandidates) return;
    try {
      const changed = await runStageMutation({
        acceptReason: options?.acceptReason ?? null,
        additionalMessage: options?.additionalMessage ?? null,
        additionalMessageVisibility:
          options?.additionalMessageVisibility ?? "both",
        attendeeEmails: options?.attendeeEmails ?? [],
        contactDirectly: options?.contactDirectly ?? false,
        durationMinutes: options?.durationMinutes,
        emailMode: options?.emailMode,
        introEmails: options?.introEmails ?? null,
        meetingCandidateMessage: options?.meetingCandidateMessage ?? null,
        meetingPurpose: options?.meetingPurpose ?? null,
        recommendationId: item.recommendationId,
        reengagementResolution: options?.reengagementResolution ?? null,
        roleId: item.roleId,
        scheduleInterview: options?.scheduleInterview ?? false,
        sourceStage: item.stage,
        stage,
        stopNote: options?.stopNote ?? null,
        talentId: item.talentId,
        title: options?.title ?? null,
        workspaceId: args.workspaceId,
      });
      if (!changed) return;
      addToast({
        message: options?.scheduleInterview
          ? "연결을 시작했고, 미팅 정보를 준비해두었어요."
          : "후보자 상태를 변경했습니다.",
        variant: "success",
      });
      return changed;
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "후보자 상태를 변경하지 못했습니다.",
        variant: "error",
      });
      throw error;
    }
  };

  const acceptTalent = async ({
    acceptReason,
    additionalMessage,
    additionalMessageVisibility,
    attendeeEmails,
    contactDirectly,
    durationMinutes,
    introEmails,
    meetingCandidateMessage,
    meetingPurpose,
    scheduleInterview,
    stage,
    title,
  }: {
    acceptReason: string | null;
    additionalMessage?: string | null;
    additionalMessageVisibility?: "both" | "candidate" | "internal";
    attendeeEmails?: string[];
    contactDirectly: boolean;
    durationMinutes?: number;
    introEmails: string[];
    meetingCandidateMessage?: string | null;
    meetingPurpose?: string | null;
    scheduleInterview?: boolean;
    stage: OrgStageId;
    title?: string | null;
  }) => {
    if (!args.canManageCandidates) return;
    const roleId = args.detail?.role.roleId ?? args.activeDetailRoleId;
    const recommendationId =
      args.detail?.recommendation.recommendationId ??
      args.activeDetailRecommendationId;
    const talentId = args.detail?.talent.userId ?? args.activeDetailTalentId;
    if (!roleId || !recommendationId || !talentId) return;
    const changed = await runStageMutation({
      acceptReason,
      additionalMessage,
      additionalMessageVisibility,
      attendeeEmails,
      contactDirectly,
      durationMinutes,
      introEmails,
      meetingCandidateMessage,
      meetingPurpose,
      recommendationId,
      roleId,
      scheduleInterview,
      sourceStage: args.detail?.recommendation.stage,
      stage,
      stopNote: null,
      talentId,
      title,
      workspaceId: args.workspaceId,
    });
    if (!changed) return;
    addToast({
      message: scheduleInterview
        ? "연결을 시작했고, 미팅 정보를 준비해두었어요."
        : "후보자 연결을 시작했어요.",
      variant: "success",
    });
    return changed;
  };

  const rejectTalent = async (options: OrgStageChangeOptions) => {
    if (!args.canManageCandidates) return;
    const roleId = args.detail?.role.roleId ?? args.activeDetailRoleId;
    const recommendationId =
      args.detail?.recommendation.recommendationId ??
      args.activeDetailRecommendationId;
    const talentId = args.detail?.talent.userId ?? args.activeDetailTalentId;
    if (!roleId || !recommendationId || !talentId) return;
    const changed = await runStageMutation({
      acceptReason: null,
      introEmails: null,
      recommendationId,
      roleId,
      stage: "process_stopped",
      stopNote: options.stopNote ?? null,
      talentId,
      workspaceId: args.workspaceId,
    });
    if (!changed) return;
    const endedExistingConnection =
      args.detail?.recommendation.stage !== undefined &&
      args.detail.recommendation.stage !== "pending_connection";
    addToast({
      message: endedExistingConnection
        ? "후보자 연결을 종료했어요. Harper가 후보자에게 종료를 안내해요."
        : "후보자 연결을 거절했어요. 회사의 종료 결정이 후보자에게 안내돼요.",
      variant: "success",
    });
  };

  const moveTalentToPendingConnection = async (
    emailMode: NonNullable<OrgStageChangeOptions["emailMode"]> = "schedule"
  ) => {
    if (!args.canManageCandidates) return;
    const roleId = args.detail?.role.roleId ?? args.activeDetailRoleId;
    const recommendationId =
      args.detail?.recommendation.recommendationId ??
      args.activeDetailRecommendationId;
    const talentId = args.detail?.talent.userId ?? args.activeDetailTalentId;
    if (!roleId || !recommendationId || !talentId) return;
    try {
      const changed = await runStageMutation({
        acceptReason: null,
        contactDirectly: false,
        emailMode,
        introEmails: null,
        recommendationId,
        roleId,
        stage: "pending_connection",
        stopNote: null,
        talentId,
        workspaceId: args.workspaceId,
      });
      if (!changed) return;
      addToast({
        message: "연결 대기 상태로 옮겼습니다.",
        variant: "success",
      });
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "연결 대기 상태로 옮기지 못했습니다.",
        variant: "error",
      });
      throw error;
    }
  };

  return {
    acceptTalent,
    candidateReengagement,
    cancelCandidateReengagement: () => setCandidateReengagement(null),
    changeStage,
    getPendingStage,
    isCandidateStagePending,
    moveTalentToPendingConnection,
    rejectTalent,
    requestCandidateReengagementBeforeStageChange,
    resolveCandidateReengagement,
    resolvingCandidateReengagement: setStage.isPending,
  };
}
