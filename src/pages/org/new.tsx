import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgRoleCreationPage } from "@/components/org/workspace/pages/OrgRoleCreationPage";

export default function OrgRoleCreationRoute() {
  return (
    <OrgWorkspaceApp page="new-role">
      <OrgRoleCreationPage />
    </OrgWorkspaceApp>
  );
}
