import {
  createContext,
  type Context,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import { useOrgCandidateActions } from "@/hooks/org/useOrgCandidateActions";
import {
  useOrgJobsBoardData,
  useOrgJobsDetailData,
} from "@/hooks/org/useOrgJobsData";
import { useOrgJobsRoute } from "@/hooks/org/useOrgJobsRoute";
import type { OrgTalentSelection } from "@/hooks/org/useOrgJobsRoute";
import { useOrgRoleActions } from "@/hooks/org/useOrgRoleActions";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import type { OrgBoardItem, OrgRole } from "@/lib/org/server";
import type { OrgWorkspacePageId } from "@/lib/org/routes";

type OrgJobsNavigationValue = {
  activeRole: OrgRole | null;
  activeRoleId: string;
  changeRole: (roleId: string) => void;
  closeTalentDetail: () => void;
  detailRecommendationId: string;
  detailRoleId: string;
  detailTalentId: string;
  selectTalent: (item: OrgTalentSelection) => void;
  selectedRoleId: string | null;
  workspaceId: string;
};

type OrgJobsFiltersValue = {
  nameQuery: string;
  recommendedFromDate: string;
  recommendedToDate: string;
  setNameQuery: (value: string) => void;
  setRecommendedDateRange: (from: string, to: string) => void;
};

type OrgJobsBoardValue = ReturnType<typeof useOrgJobsBoardData>;
type OrgJobsDetailValue = ReturnType<typeof useOrgJobsDetailData>;
type OrgJobsCandidateActionsValue = ReturnType<typeof useOrgCandidateActions>;
type OrgJobsRoleActionsValue = ReturnType<typeof useOrgRoleActions>;

const OrgJobsNavigationContext = createContext<OrgJobsNavigationValue | null>(
  null
);
const OrgJobsFiltersContext = createContext<OrgJobsFiltersValue | null>(null);
const OrgJobsBoardContext = createContext<OrgJobsBoardValue | null>(null);
const OrgJobsDetailContext = createContext<OrgJobsDetailValue | null>(null);
const OrgJobsCandidateActionsContext =
  createContext<OrgJobsCandidateActionsValue | null>(null);
const OrgJobsRoleActionsContext = createContext<OrgJobsRoleActionsValue | null>(
  null
);

function useRequiredContext<T>(context: Context<T | null>, hookName: string) {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${hookName} must be used within an OrgJobsProvider`);
  }
  return value;
}

export function useOrgJobsNavigation() {
  return useRequiredContext(OrgJobsNavigationContext, "useOrgJobsNavigation");
}

export function useOrgJobsFilters() {
  return useRequiredContext(OrgJobsFiltersContext, "useOrgJobsFilters");
}

export function useOrgJobsBoard() {
  return useRequiredContext(OrgJobsBoardContext, "useOrgJobsBoard");
}

export function useOrgJobsDetail() {
  return useRequiredContext(OrgJobsDetailContext, "useOrgJobsDetail");
}

export function useOrgJobsCandidateActions() {
  return useRequiredContext(
    OrgJobsCandidateActionsContext,
    "useOrgJobsCandidateActions"
  );
}

export function useOrgJobsRoleActions() {
  return useRequiredContext(OrgJobsRoleActionsContext, "useOrgJobsRoleActions");
}

function OrgJobsRoleActionsProvider({ children }: { children: ReactNode }) {
  const { permissions, roles, workspace } = useOrgWorkspace();
  const value = useOrgRoleActions({
    canManageCandidates: permissions.canManageCandidates,
    roles,
    workspaceId: workspace.workspaceId,
  });
  return (
    <OrgJobsRoleActionsContext.Provider value={value}>
      {children}
    </OrgJobsRoleActionsContext.Provider>
  );
}

function OrgJobsRouteProvider({
  children,
  routePage,
}: {
  children: ReactNode;
  routePage: Extract<OrgWorkspacePageId, "all" | "inbox" | "jobs">;
}) {
  const { roles } = useOrgWorkspace();
  const roleActions = useOrgJobsRoleActions();
  const route = useOrgJobsRoute({ page: routePage });
  const {
    activeRoleId,
    changeRole,
    closeTalentDetail,
    detailRecommendationId,
    detailRoleId,
    detailTalentId,
    nameQuery,
    recommendedFromDate,
    recommendedToDate,
    selectTalent,
    selectedRoleId,
    setNameQuery,
    setRecommendedDateRange,
    workspaceId,
  } = route;
  const activeRole = useMemo(
    () => roles.find((role) => role.roleId === activeRoleId) ?? null,
    [activeRoleId, roles]
  );
  const navigationValue = useMemo<OrgJobsNavigationValue>(
    () => ({
      activeRole,
      activeRoleId,
      changeRole: (roleId) => {
        roleActions.closeRoleEditor();
        changeRole(roleId);
      },
      closeTalentDetail,
      detailRecommendationId,
      detailRoleId,
      detailTalentId,
      selectTalent: (item) => {
        roleActions.closeRoleEditor();
        selectTalent(item);
      },
      selectedRoleId,
      workspaceId,
    }),
    [
      activeRole,
      activeRoleId,
      changeRole,
      closeTalentDetail,
      detailRecommendationId,
      detailRoleId,
      detailTalentId,
      roleActions,
      selectTalent,
      selectedRoleId,
      workspaceId,
    ]
  );
  const filtersValue = useMemo<OrgJobsFiltersValue>(
    () => ({
      nameQuery,
      recommendedFromDate,
      recommendedToDate,
      setNameQuery,
      setRecommendedDateRange,
    }),
    [
      nameQuery,
      recommendedFromDate,
      recommendedToDate,
      setNameQuery,
      setRecommendedDateRange,
    ]
  );

  return (
    <OrgJobsNavigationContext.Provider value={navigationValue}>
      <OrgJobsFiltersContext.Provider value={filtersValue}>
        {children}
      </OrgJobsFiltersContext.Provider>
    </OrgJobsNavigationContext.Provider>
  );
}

function OrgJobsBoardProvider({ children }: { children: ReactNode }) {
  const filters = useOrgJobsFilters();
  const navigation = useOrgJobsNavigation();
  const value = useOrgJobsBoardData({
    nameQuery: filters.nameQuery,
    recommendedFromDate: filters.recommendedFromDate,
    recommendedToDate: filters.recommendedToDate,
    selectedRoleId: navigation.selectedRoleId,
    workspaceId: navigation.workspaceId,
  });
  return (
    <OrgJobsBoardContext.Provider value={value}>
      {children}
    </OrgJobsBoardContext.Provider>
  );
}

function OrgJobsDetailProvider({ children }: { children: ReactNode }) {
  const navigation = useOrgJobsNavigation();
  const value = useOrgJobsDetailData({
    detailRecommendationId: navigation.detailRecommendationId,
    detailRoleId: navigation.detailRoleId,
    detailTalentId: navigation.detailTalentId,
    workspaceId: navigation.workspaceId,
  });
  return (
    <OrgJobsDetailContext.Provider value={value}>
      {children}
    </OrgJobsDetailContext.Provider>
  );
}

function OrgJobsCandidateActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { permissions } = useOrgWorkspace();
  const navigation = useOrgJobsNavigation();
  const detail = useOrgJobsDetail();
  const value = useOrgCandidateActions({
    activeDetailRecommendationId: detail.activeDetailRecommendationId,
    activeDetailRoleId: detail.activeDetailRoleId,
    activeDetailTalentId: detail.activeDetailTalentId,
    canManageCandidates: permissions.canManageCandidates,
    detail: detail.detailQuery.data,
    workspaceId: navigation.workspaceId,
  });
  return (
    <OrgJobsCandidateActionsContext.Provider value={value}>
      {children}
    </OrgJobsCandidateActionsContext.Provider>
  );
}

export function OrgJobsProvider({
  children,
  includeBoard = true,
  routePage = "jobs",
}: {
  children: ReactNode;
  includeBoard?: boolean;
  routePage?: Extract<OrgWorkspacePageId, "all" | "inbox" | "jobs">;
}) {
  const detailProviders = (
    <OrgJobsDetailProvider>
      <OrgJobsCandidateActionsProvider>
        {children}
      </OrgJobsCandidateActionsProvider>
    </OrgJobsDetailProvider>
  );

  return (
    <OrgJobsRoleActionsProvider>
      <OrgJobsRouteProvider routePage={routePage}>
        {includeBoard ? (
          <OrgJobsBoardProvider>{detailProviders}</OrgJobsBoardProvider>
        ) : (
          detailProviders
        )}
      </OrgJobsRouteProvider>
    </OrgJobsRoleActionsProvider>
  );
}
