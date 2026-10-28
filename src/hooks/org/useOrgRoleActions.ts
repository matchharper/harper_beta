import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
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
  onDeleted?: (role: OrgRole) => void;
}) {
  const { locale, c } = useOrgLocale();
  const addToast = useToastStore((state) => state.add);
  const updateRole = useUpdateOrgRole();
  const updateRoleLifecycle = async (
    role: OrgRole,
    action: OrgRoleLifecycleAction | "end"
  ) => {
    if (!args.canManageCandidates || updateRole.isPending) return;
    const options =
      action === "end"
        ? { status: "ended", isExpired: undefined }
        : getOrgRoleLifecycleUpdate(action);
    try {
      await updateRole.mutateAsync({
        isExpired: options.isExpired,
        roleId: role.roleId,
        status: options.status,
        workspaceId: args.workspaceId,
      });
      if (action !== "resume")
        addToast({
          message:
            action === "delete"
              ? c("역할을 삭제했습니다.", "Role deleted.")
              : action === "end"
                ? c("채용을 종료했습니다.", "Hiring ended.")
                : c("역할을 일시 중지했습니다.", "Role paused."),
          variant: "success",
        });
      if (action === "delete") args.onDeleted?.(role);
    } catch (error) {
      addToast({
        message: localizedOrgErrorMessage(
          error,
          locale,
          c(
            "역할 상태를 변경하지 못했습니다.",
            "Couldn't change role status. Try again."
          )
        ),
        variant: "error",
      });
    }
  };

  return {
    deleteRole: (role: OrgRole) => void updateRoleLifecycle(role, "delete"),
    pauseRole: (role: OrgRole) => void updateRoleLifecycle(role, "pause"),
    resumeRole: (role: OrgRole) => void updateRoleLifecycle(role, "resume"),
    endRole: (role: OrgRole) => void updateRoleLifecycle(role, "end"),
    roleActionPending: updateRole.isPending,
  };
}
