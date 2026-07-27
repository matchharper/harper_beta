import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgHomePage } from "@/components/org/workspace/pages/OrgHomePage";

export default function LegacyOrgEntryPage() {
  return (
    <OrgWorkspaceApp legacyEntry page="home">
      <OrgHomePage />
    </OrgWorkspaceApp>
  );
}
