import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgHelpPage } from "@/components/org/workspace/pages/OrgHelpPage";

export default function OrgHelpRoute() {
  return (
    <OrgWorkspaceApp page="help">
      <OrgHelpPage />
    </OrgWorkspaceApp>
  );
}
