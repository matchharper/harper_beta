import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgTeamPage } from "@/components/org/workspace/pages/OrgTeamPage";

export default function OrgTeamRoute() {
  return (
    <OrgWorkspaceApp page="team">
      <OrgTeamPage />
    </OrgWorkspaceApp>
  );
}
