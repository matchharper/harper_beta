import { useOrgLocale, useOrgT } from "@/i18n/org/OrgLocaleProvider";
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
}) {
  const t = useOrgT();
  const { locale } = useOrgLocale();
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
            ? t("hooks.role.deleted", "역할을 삭제했습니다.")
            : action === "pause"
              ? t("hooks.role.paused", "역할을 일시 중지했습니다.")
              : t("hooks.role.resumed", "역할을 다시 시작했습니다."),
        variant: "success",
      });
    } catch (error) {
      addToast({
        message: localizedOrgErrorMessage(error, locale, t("hooks.role.failed", "역할 상태를 변경하지 못했습니다.")),
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
