import { useMemo, useState } from "react";
import type { OrgEditDialogValue } from "@/components/org/OrgEditDialog";
import { useUpdateOrgRole } from "@/hooks/org/useOrg";
import type { OrgRole } from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";

export function useOrgRoleActions(args: {
  canManageCandidates: boolean;
  roles: OrgRole[];
  workspaceId: string;
}) {
  const addToast = useToastStore((state) => state.add);
  const updateRole = useUpdateOrgRole();
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const editingRole = useMemo(
    () =>
      editingRoleId
        ? (args.roles.find((role) => role.roleId === editingRoleId) ?? null)
        : null,
    [args.roles, editingRoleId]
  );

  const updateRoleLifecycle = async (
    role: OrgRole,
    options: { isExpired?: boolean; status: string }
  ) => {
    if (!args.canManageCandidates) return;
    try {
      await updateRole.mutateAsync({
        isExpired: options.isExpired,
        roleId: role.roleId,
        status: options.status,
        workspaceId: args.workspaceId,
      });
      addToast({
        message:
          options.status === "deleted"
            ? "역할을 삭제했습니다."
            : options.status === "paused"
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

  const submitRoleEdit = (value: OrgEditDialogValue) => {
    if (!editingRole || !args.canManageCandidates) return;
    updateRole.mutate(
      {
        description: value.description ?? null,
        employmentTypes: value.employmentTypes ?? [],
        externalJdUrl: value.externalJdUrl ?? null,
        isExpired: undefined,
        locationText: value.locationText ?? null,
        name: value.name ?? null,
        request: value.request ?? null,
        roleId: editingRole.roleId,
        status: value.status ?? null,
        workMode: value.workMode ?? null,
        workspaceId: args.workspaceId,
      },
      {
        onError: (error) =>
          addToast({
            message:
              error instanceof Error
                ? error.message
                : "역할을 수정하지 못했습니다.",
            variant: "error",
          }),
        onSuccess: () => {
          setEditingRoleId(null);
          addToast({
            message: "역할 정보를 저장했습니다.",
            variant: "success",
          });
        },
      }
    );
  };

  return {
    closeRoleEditor: () => setEditingRoleId(null),
    deleteRole: (role: OrgRole) =>
      void updateRoleLifecycle(role, {
        isExpired: true,
        status: "deleted",
      }),
    editingRole,
    openRoleEditor: setEditingRoleId,
    pauseRole: (role: OrgRole) =>
      void updateRoleLifecycle(role, { status: "paused" }),
    resumeRole: (role: OrgRole) =>
      void updateRoleLifecycle(role, { status: "active" }),
    roleActionPending: updateRole.isPending,
    submitRoleEdit,
  };
}
