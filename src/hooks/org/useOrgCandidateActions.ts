import { useSetOrgCandidateStage } from "@/hooks/org/useOrg";
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
  const pendingRecommendationId = setStage.isPending
    ? (setStage.variables?.recommendationId ?? null)
    : null;
  const pendingStage = setStage.isPending
    ? (setStage.variables?.stage ?? null)
    : null;

  const changeStage = async (
    item: OrgBoardItem,
    stage: OrgStageId,
    options?: OrgStageChangeOptions
  ) => {
    if (!args.canManageCandidates) return;
    try {
      await setStage.mutateAsync({
        acceptReason: options?.acceptReason ?? null,
        contactDirectly: options?.contactDirectly ?? false,
        emailMode: options?.emailMode,
        introEmails: options?.introEmails ?? null,
        recommendationId: item.recommendationId,
        roleId: item.roleId,
        stage,
        stopNote: options?.stopNote ?? null,
        stopReason: options?.stopReason ?? null,
        talentId: item.talentId,
        workspaceId: args.workspaceId,
      });
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
    await setStage.mutateAsync({
      acceptReason,
      contactDirectly,
      introEmails,
      recommendationId,
      roleId,
      stage,
      stopNote: null,
      stopReason: null,
      talentId,
      workspaceId: args.workspaceId,
    });
    addToast({
      message: "후보자 연결을 수락했습니다.",
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
    await setStage.mutateAsync({
      acceptReason: null,
      introEmails: null,
      recommendationId,
      roleId,
      stage: "process_stopped",
      stopNote: options.stopNote ?? null,
      stopReason: options.stopReason ?? null,
      talentId,
      workspaceId: args.workspaceId,
    });
    addToast({
      message: "후보자 프로세스를 종료했습니다.",
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
      await setStage.mutateAsync({
        acceptReason: null,
        contactDirectly: false,
        emailMode,
        introEmails: null,
        recommendationId,
        roleId,
        stage: "pending_connection",
        stopNote: null,
        stopReason: null,
        talentId,
        workspaceId: args.workspaceId,
      });
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
    moveTalentToPendingConnection,
    pendingRecommendationId,
    pendingStage,
    rejectTalent,
  };
}
