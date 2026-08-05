import { useState } from "react";
import { OrgAllRolesOverview } from "@/components/org/OrgAllRolesOverview";
import { OrgPipeline } from "@/components/org/OrgPipeline";
import { OrgRoleOverview } from "@/components/org/OrgRoleOverview";
import { OrgRolePicker } from "@/components/org/OrgRolePicker";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import { Tabs } from "@/components/ui/tabs";
import {
  OrgJobsProvider,
  useOrgJobsBoard,
  useOrgJobsDetail,
  useOrgJobsNavigation,
} from "@/hooks/org/useOrgJobs";

type OrgRoleView = "pipeline" | "role";

function OrgSelectedRoleContent() {
  const { boardQuery } = useOrgJobsBoard();
  const [activeView, setActiveView] = useState<OrgRoleView>("role");

  return (
    <div className="space-y-7">
      <Tabs
        activeValue={activeView}
        aria-label="Role 화면"
        items={[
          { label: "Role", value: "role" },
          { label: "Pipeline", value: "pipeline" },
        ]}
        onValueChange={(value) => setActiveView(value as OrgRoleView)}
        size="large"
        variant="cards"
      />
      {activeView === "pipeline" && boardQuery.error instanceof Error ? (
        <OrgErrorState
          message={boardQuery.error.message}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : null}
      {activeView === "role" ? <OrgRoleOverview /> : <OrgPipeline />}
    </div>
  );
}

function OrgJobsMain() {
  const { boardQuery } = useOrgJobsBoard();
  const { activeRoleId } = useOrgJobsNavigation();
  const isAll = activeRoleId === "all";

  return (
    <div className="space-y-7">
      <OrgPageHeader title={<OrgRolePicker />} />
      {isAll && boardQuery.error instanceof Error ? (
        <OrgErrorState
          message={boardQuery.error.message}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : null}
      {isAll ? (
        <OrgAllRolesOverview />
      ) : (
        <OrgSelectedRoleContent key={activeRoleId} />
      )}
    </div>
  );
}

function OrgJobsTalentDetail() {
  const { workspaceId } = useOrgJobsNavigation();
  const { activeDetailRecommendationId, activeDetailTalentId } =
    useOrgJobsDetail();

  return (
    <TalentDetailSimpleView
      key={[
        workspaceId,
        activeDetailRecommendationId,
        activeDetailTalentId,
      ].join(":")}
    />
  );
}

export function OrgJobsPage() {
  return (
    <OrgJobsProvider>
      <OrgJobsMain />
      <OrgJobsTalentDetail />
    </OrgJobsProvider>
  );
}
