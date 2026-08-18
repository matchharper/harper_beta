import { OrgAllRolesOverview } from "@/components/org/OrgAllRolesOverview";
import { OrgRolePicker } from "@/components/org/OrgRolePicker";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import {
  OrgJobsProvider,
  useOrgJobsBoard,
} from "@/hooks/org/useOrgJobs";

function OrgJobsMain() {
  const { boardQuery } = useOrgJobsBoard();

  return (
    <div className="space-y-2">
      <OrgPageHeader title={<OrgRolePicker />} />
      {boardQuery.error instanceof Error ? (
        <OrgErrorState
          message={boardQuery.error.message}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : null}
      <OrgAllRolesOverview />
    </div>
  );
}

export function OrgJobsPage() {
  return (
    <OrgJobsProvider>
      <OrgJobsMain />
    </OrgJobsProvider>
  );
}
