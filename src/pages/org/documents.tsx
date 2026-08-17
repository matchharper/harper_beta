import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgDocumentsPage } from "@/components/org/workspace/pages/OrgDocumentsPage";

export default function OrgDocumentsRoute() {
  return (
    <OrgWorkspaceApp page="documents">
      <OrgDocumentsPage />
    </OrgWorkspaceApp>
  );
}
