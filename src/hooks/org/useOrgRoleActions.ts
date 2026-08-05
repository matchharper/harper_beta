import { useUpdateOrgRole } from "@/hooks/org/useOrg";
import type { OrgRole } from "@/lib/org/server";
import {
  getOrgRoleLifecycleUpdate,
  type OrgRoleLifecycleAction,
} from "@/lib/org/roleStatus";
import { useToastStore } from "@/store/useToastStore";

export function useOrgRoleActions(args: {
  canManageCandidates: boolean;
  workspaceId: string;
}) {
  const addToast = useToastStore((state) => state.add);
  const updateRole = useUpdateOrgRole();
  const updateRoleLifecycle = async (
    role: OrgRole,
    action: OrgRoleLifecycleAction
  ) => {
    if (!args.canManageCandidates) return;
    const options = getOrgRoleLifecycleUpdate(action);
    try {
      await updateRole.mutateAsync({
        isExpired: options.isExpired,
        roleId: role.roleId,
        status: options.status,
        workspaceId: args.workspaceId,
      });
      addToast({
        message:
          action === "delete"
            ? "역할을 삭제했습니다."
            : action === "pause"
              ? "역할을 일시 중지했습니다."
              : "역할을 다시 시작했습니다.",
        variant: "success",
      });
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "역할 상태를 변경하지 못했습니다.",
        variant: "error",
      });
    }
  };

  return {
    deleteRole: (role: OrgRole) => void updateRoleLifecycle(role, "delete"),
    pauseRole: (role: OrgRole) => void updateRoleLifecycle(role, "pause"),
    resumeRole: (role: OrgRole) => void updateRoleLifecycle(role, "resume"),
    roleActionPending: updateRole.isPending,
  };
}
