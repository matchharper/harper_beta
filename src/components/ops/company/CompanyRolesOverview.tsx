import { EmptyState } from "@/components/ops/opportunities/shared";
import { showToast } from "@/components/toast/toast";
import { OrgRolesOverview } from "@/components/org/OrgAllRolesOverview";
import {
  useOpsCompanyBoard,
  useUpdateOpsCompanyRoleCompanyFirstSearch,
} from "@/hooks/ops/useOpsCompany";
import { AppleSwitch } from "@/components/ui/switch";
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
  const updateCompanyFirstSearch =
    useUpdateOpsCompanyRoleCompanyFirstSearch();

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

  const updateRoleCompanyFirstSearch = async (args: {
    isCompanyFirstSearch: boolean;
    roleId: string;
    roleName: string;
  }) => {
    try {
      await updateCompanyFirstSearch.mutateAsync({
        isCompanyFirstSearch: args.isCompanyFirstSearch,
        roleId: args.roleId,
        workspaceId,
      });
      showToast({
        message: `${args.roleName}의 먼저 제안 후보 탐색을 ${
          args.isCompanyFirstSearch ? "켰습니다." : "껐습니다."
        }`,
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "먼저 제안 후보 탐색 설정을 변경하지 못했습니다.",
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
        const labelId = `role-company-first-search-${role.roleId}`;
        const pending =
          updateCompanyFirstSearch.isPending &&
          updateCompanyFirstSearch.variables?.roleId === role.roleId;
        return (
          <div className="flex items-center gap-2">
            <span
              id={labelId}
              className="whitespace-nowrap text-[12px] font-medium text-neutral-muted"
            >
              먼저 제안 후보 탐색
            </span>
            <AppleSwitch
              aria-labelledby={labelId}
              checked={opsRole?.isCompanyFirstSearch === true}
              disabled={updateCompanyFirstSearch.isPending}
              onCheckedChange={(isCompanyFirstSearch) =>
                void updateRoleCompanyFirstSearch({
                  isCompanyFirstSearch,
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
