import type { CareerMobileHistoryJobsTab } from "@/hooks/career/useCareerMobileHistoryOpportunities";

export const shouldSyncMobileHistoryRoleId = ({
  currentOpportunityRoleId,
  jobsTab,
  requestedRoleId,
  routerReady,
  workspaceNavigationPending,
}: {
  currentOpportunityRoleId?: string | null;
  jobsTab: CareerMobileHistoryJobsTab;
  requestedRoleId: string;
  routerReady: boolean;
  workspaceNavigationPending: boolean;
}) =>
  routerReady &&
  !workspaceNavigationPending &&
  jobsTab === "new" &&
  requestedRoleId.length === 0 &&
  Boolean(currentOpportunityRoleId?.trim());
