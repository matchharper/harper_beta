import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgTeamPage } from "@/components/org/workspace/pages/OrgTeamPage";

export default function OrgMemberRoute() {
  return (
    <OrgWorkspaceApp page="member">
      <OrgTeamPage section="members" />
    </OrgWorkspaceApp>
  );
}
