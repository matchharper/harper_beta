import { OrgAgentPanel } from "@/components/org/agent/OrgAgentPanel";
import { OrgAllRolesOverview } from "@/components/org/OrgAllRolesOverview";
import { OrgEditDialog } from "@/components/org/OrgEditDialog";
import { OrgPipeline } from "@/components/org/OrgPipeline";
import { OrgRoleTabs } from "@/components/org/OrgRoleTabs";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import {
  OrgJobsProvider,
  useOrgJobsBoard,
  useOrgJobsDetail,
  useOrgJobsNavigation,
  useOrgJobsRoleActions,
} from "@/hooks/org/useOrgJobs";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";

function OrgJobsMain() {
  const { boardQuery } = useOrgJobsBoard();
  const { activeRoleId } = useOrgJobsNavigation();
  const isAll = activeRoleId === "all";

  return (
    <div className="space-y-7">
      <OrgPageHeader title="Jobs" />
      <OrgRoleTabs />
      {boardQuery.error instanceof Error ? (
        <OrgErrorState
          message={boardQuery.error.message}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : null}
      {isAll ? <OrgAllRolesOverview /> : <OrgPipeline />}
    </div>
  );
}

function OrgJobsAgent() {
  const { permissions } = useOrgWorkspace();
  return permissions.canManageCandidates ? <OrgAgentPanel /> : null;
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

function OrgJobsRoleEditor() {
  const { editingRole, submitRoleEdit, closeRoleEditor, roleActionPending } =
    useOrgJobsRoleActions();

  return (
    <OrgEditDialog
      key={[editingRole?.roleId ?? "closed", editingRole?.updatedAt ?? ""].join(
        ":"
      )}
      mode="role"
      onClose={closeRoleEditor}
      onSubmit={submitRoleEdit}
      open={Boolean(editingRole)}
      pending={roleActionPending}
      value={
        editingRole
          ? {
              description: editingRole.description,
              employmentTypes: editingRole.employmentTypes,
              externalJdUrl: editingRole.externalJdUrl,
              locationText: editingRole.locationText,
              name: editingRole.name,
              request: editingRole.request,
              status: editingRole.status,
              workMode: editingRole.workMode,
            }
          : {}
      }
    />
  );
}

export function OrgJobsPage() {
  return (
    <OrgJobsProvider>
      <OrgJobsMain />
      <OrgJobsAgent />
      <OrgJobsTalentDetail />
      <OrgJobsRoleEditor />
    </OrgJobsProvider>
  );
}
