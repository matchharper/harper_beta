import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgAllAcceptedPage } from "@/components/org/workspace/pages/OrgAllAcceptedPage";

export default function OrgAllRoute() {
  return (
    <OrgWorkspaceApp page="all">
      <OrgAllAcceptedPage />
    </OrgWorkspaceApp>
  );
}
