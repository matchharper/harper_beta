import { OrgRoleDetailsContent } from "@/components/org/role-overview/OrgRoleDetailsContent";
import { OrgRoleMatchingContent } from "@/components/org/role-overview/OrgRoleMatchingContent";
import { OrgRoleSettingsContent } from "@/components/org/role-overview/OrgRoleSettingsContent";
import { useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";

export function OrgRoleOverview() {
  const { activeRole, workspaceId } = useOrgJobsNavigation();

  if (!activeRole) return null;

  return (
    <div className="space-y-8">
      <OrgRoleSettingsContent role={activeRole} workspaceId={workspaceId} />
      <OrgRoleMatchingContent
        role={activeRole}
        showBottomBorder
        workspaceId={workspaceId}
      />
      <OrgRoleDetailsContent role={activeRole} workspaceId={workspaceId} />
    </div>
  );
}
