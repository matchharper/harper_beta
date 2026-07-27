import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgSettingsPage } from "@/components/org/workspace/pages/OrgSettingsPage";

export default function OrgSettingsRoute() {
  return (
    <OrgWorkspaceApp page="settings">
      <OrgSettingsPage />
    </OrgWorkspaceApp>
  );
}
