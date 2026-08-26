import { EmptyState } from "@/components/ops/opportunities/shared";
import { showToast } from "@/components/toast/toast";
import { OrgRolesOverview } from "@/components/org/OrgAllRolesOverview";
import {
  useOpsCompanyBoard,
  useUpdateOpsCompanyRoleAutomation,
} from "@/hooks/ops/useOpsCompany";
import { Switch } from "@/components/ui/switch";
import { buildOrgHref } from "@/lib/org/routes";
import type { OrgRole } from "@/lib/org/server";
import { useRouter } from "next/router";

export function CompanyRolesOverview({
  enabled,
  workspaceId,
}: {
  enabled: boolean;
  workspaceId: string;
}) {
  const router = useRouter();
  const boardQuery = useOpsCompanyBoard({ enabled, workspaceId });
  const updateAutomation = useUpdateOpsCompanyRoleAutomation();

  const openRole = (role: OrgRole, view: "pipeline" | "role" = "role") => {
    void router.push(
      buildOrgHref({
        orgId: workspaceId,
        page: role.status === "draft" ? "new-role" : "role",
        roleId: role.roleId,
        tab:
          role.status === "draft" || view !== "pipeline"
            ? undefined
            : "pipeline",
        view:
          role.status === "draft" || view !== "pipeline" ? null : "pipeline",
      })
    );
  };

  const updateRoleAutomation = async (args: {
    isAuto: boolean;
    roleId: string;
    roleName: string;
  }) => {
    try {
      await updateAutomation.mutateAsync({
        isAuto: args.isAuto,
        roleId: args.roleId,
        workspaceId,
      });
      showToast({
        message: `${args.roleName} 자동 매칭을 ${args.isAuto ? "켰습니다." : "껐습니다."}`,
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "자동 매칭 설정을 변경하지 못했습니다.",
        variant: "white",
      });
    }
  };

  if (boardQuery.isLoading) {
    return <EmptyState copy="Roles를 불러오는 중입니다." />;
  }
  if (boardQuery.error) {
    return <EmptyState copy="Roles를 새로고침해 주세요." />;
  }

  return (
    <OrgRolesOverview
      board={boardQuery.data?.board}
      isLoading={false}
      onOpenRole={openRole}
      renderRoleControl={(role) => {
        const opsRole = boardQuery.data?.roles.find(
          (item) => item.roleId === role.roleId
        );
        const labelId = `role-auto-${role.roleId}`;
        const pending =
          updateAutomation.isPending &&
          updateAutomation.variables?.roleId === role.roleId;
        return (
          <div className="flex items-center gap-2 rounded-md border border-neutral-1000-a05 bg-bg-weak px-2.5 py-1.5">
            <span
              id={labelId}
              className="whitespace-nowrap text-[12px] font-medium text-neutral-muted"
            >
              자동 매칭
            </span>
            <Switch
              aria-labelledby={labelId}
              checked={opsRole?.isAuto === true}
              disabled={updateAutomation.isPending}
              onCheckedChange={(isAuto) =>
                void updateRoleAutomation({
                  isAuto,
                  roleId: role.roleId,
                  roleName: role.name,
                })
              }
            />
            <span className="sr-only" aria-live="polite">
              {pending ? "저장 중" : ""}
            </span>
          </div>
        );
      }}
      roles={boardQuery.data?.roles ?? []}
    />
  );
}
