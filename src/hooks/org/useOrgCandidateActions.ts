import { useMemo, useRef } from "react";
import {
  usePendingOrgCandidateStageMutations,
  useSetOrgCandidateStage,
} from "@/hooks/org/useOrg";
import {
  buildPendingOrgCandidateStageMap,
  getOrgCandidateStageMutationIdentity,
  type OrgCandidateStageMutationInput,
} from "@/lib/org/candidateStageClient";
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
    const candidateKey = getOrgCandidateStageMutationIdentity(input);
    if (
      pendingStageByCandidateKey.has(candidateKey) ||
      locallyPendingCandidateKeysRef.current.has(candidateKey)
    ) {
      return false;
    }

    locallyPendingCandidateKeysRef.current.add(candidateKey);
    try {
      await setStage.mutateAsync(input);
      return true;
    } finally {
      locallyPendingCandidateKeysRef.current.delete(candidateKey);
    }
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
        contactDirectly: options?.contactDirectly ?? false,
        emailMode: options?.emailMode,
        introEmails: options?.introEmails ?? null,
        recommendationId: item.recommendationId,
        roleId: item.roleId,
        stage,
        stopNote: options?.stopNote ?? null,
        talentId: item.talentId,
        workspaceId: args.workspaceId,
      });
      if (!changed) return;
      addToast({
        message: "후보자 상태를 변경했습니다.",
        variant: "success",
      });
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
    contactDirectly,
    introEmails,
    stage,
  }: {
    acceptReason: string | null;
    contactDirectly: boolean;
    introEmails: string[];
    stage: OrgStageId;
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
      contactDirectly,
      introEmails,
      recommendationId,
      roleId,
      stage,
      stopNote: null,
      talentId,
      workspaceId: args.workspaceId,
    });
    if (!changed) return;
    addToast({
      message: "후보자 연결을 시작했어요.",
      variant: "success",
    });
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
    changeStage,
    getPendingStage,
    isCandidateStagePending,
    moveTalentToPendingConnection,
    rejectTalent,
  };
}
