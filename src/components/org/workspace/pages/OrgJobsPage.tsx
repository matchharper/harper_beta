import { OrgAllRolesOverview } from "@/components/org/OrgAllRolesOverview";
import { OrgPipeline } from "@/components/org/OrgPipeline";
import { OrgRoleTabs } from "@/components/org/OrgRoleTabs";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import type {
  OrgBoardItem,
  OrgBoardResponse,
  OrgMember,
  OrgRole,
  OrgStageChangeOptions,
} from "@/lib/org/server";

export function OrgJobsPage({
  activeRole,
  activeRoleId,
  board,
  canManageCandidates,
  currentUserEmail,
  error,
  isLoading,
  members,
  nameQuery,
  onDeleteRole,
  onEditRole,
  onNameQueryChange,
  onPauseRole,
  onRecommendedDateChange,
  onRetry,
  onResumeRole,
  onRoleChange,
  onSelect,
  onStageChange,
  pendingRecommendationId,
  recommendedFromDate,
  recommendedToDate,
  roleActionPending,
  roles,
  workspaceId,
}: {
  activeRole: OrgRole | null;
  activeRoleId: string;
  board?: OrgBoardResponse | null;
  canManageCandidates: boolean;
  currentUserEmail?: string | null;
  error?: Error | null;
  isLoading?: boolean;
  members: OrgMember[];
  nameQuery: string;
  onDeleteRole: (role: OrgRole) => void;
  onEditRole: (roleId: string) => void;
  onNameQueryChange: (value: string) => void;
  onPauseRole: (role: OrgRole) => void;
  onRecommendedDateChange: (from: string, to: string) => void;
  onRetry: () => void;
  onResumeRole: (role: OrgRole) => void;
  onRoleChange: (roleId: string) => void;
  onSelect: (item: OrgBoardItem) => void;
  onStageChange: (
    item: OrgBoardItem,
    stage: OrgBoardItem["stage"],
    options?: OrgStageChangeOptions
  ) => void | Promise<void>;
  pendingRecommendationId?: string | null;
  recommendedFromDate: string;
  recommendedToDate: string;
  roleActionPending?: boolean;
  roles: OrgRole[];
  workspaceId: string;
}) {
  const isAll = activeRoleId === "all";
  return (
    <div className="space-y-7">
      <OrgPageHeader
        description="Role별 후보자 진행 상태를 확인하고 다음 채용 액션을 관리하세요."
        title="Jobs"
      />
      <OrgRoleTabs
        activeRoleId={activeRoleId}
        onChange={onRoleChange}
        onDeleteRole={onDeleteRole}
        onEditRole={onEditRole}
        onPauseRole={onPauseRole}
        onResumeRole={onResumeRole}
        roleActionPending={roleActionPending}
        roles={roles}
        showActions={canManageCandidates}
      />
      {error ? (
        <OrgErrorState message={error.message} onRetry={onRetry} />
      ) : null}
      {isAll ? (
        <OrgAllRolesOverview
          board={board}
          canManageCandidates={canManageCandidates}
          error={null}
          isLoading={isLoading}
          onDeleteRole={onDeleteRole}
          onEditRole={onEditRole}
          onPauseRole={onPauseRole}
          onResumeRole={onResumeRole}
          onRoleSelect={onRoleChange}
          roleActionPending={roleActionPending}
          roles={roles}
        />
      ) : (
        <OrgPipeline
          activeRole={activeRole}
          activeRoleId={activeRoleId}
          activeRoleName={activeRole?.name ?? null}
          board={board}
          canManageCandidates={canManageCandidates}
          currentUserEmail={currentUserEmail}
          error={null}
          isLoading={isLoading}
          members={members}
          nameQuery={nameQuery}
          onDeleteRole={onDeleteRole}
          onEditRole={() => onEditRole(activeRoleId)}
          onNameQueryChange={onNameQueryChange}
          onPauseRole={onPauseRole}
          onRecommendedDateChange={onRecommendedDateChange}
          onResumeRole={onResumeRole}
          onSelect={onSelect}
          onStageChange={onStageChange}
          pendingRecommendationId={pendingRecommendationId}
          recommendedFromDate={recommendedFromDate}
          recommendedToDate={recommendedToDate}
          roleActionPending={roleActionPending}
          workspaceId={workspaceId}
        />
      )}
    </div>
  );
}
