import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgJobsPage } from "@/components/org/workspace/pages/OrgJobsPage";

export default function OrgJobsRoute() {
  return (
    <OrgWorkspaceApp page="jobs">
      <OrgJobsPage />
    </OrgWorkspaceApp>
  );
}
