import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgHomePage } from "@/components/org/workspace/pages/OrgHomePage";

export default function OrgHomeRoute() {
  return (
    <OrgWorkspaceApp page="home">
      <OrgHomePage />
    </OrgWorkspaceApp>
  );
}
