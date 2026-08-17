import { EmptyState } from "@/components/ops/opportunities/shared";
import { OrgRolesOverview } from "@/components/org/OrgAllRolesOverview";
import { useOpsCompanyBoard } from "@/hooks/ops/useOpsCompany";
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

  const openRole = (role: OrgRole, view: "pipeline" | "role" = "role") => {
    void router.push(
      buildOrgHref({
        orgId: workspaceId,
        page: role.status === "draft" ? "new-role" : "jobs",
        roleId: role.roleId,
        view: role.status === "draft" ? null : view,
      })
    );
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
      roles={boardQuery.data?.roles ?? []}
    />
  );
}
