import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgInboxPage } from "@/components/org/workspace/pages/OrgInboxPage";

export default function OrgInboxRoute() {
  return (
    <OrgWorkspaceApp page="inbox">
      <OrgInboxPage />
    </OrgWorkspaceApp>
  );
}
