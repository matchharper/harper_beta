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
import type { OrgJobsView, OrgWorkspacePageId } from "@/lib/org/routes";

type OrgJobsNavigationValue = {
  activeRole: OrgRole | null;
  activeRoleId: string;
  activeView: OrgJobsView;
  changeRole: (roleId: string, view?: OrgJobsView) => void;
  changeView: (view: OrgJobsView) => void;
  closeTalentDetail: () => void;
  detailRecommendationId: string;
  detailRoleId: string;
  detailTalentId: string;
  selectTalent: (
    item: OrgTalentSelection,
    navigationItems?: readonly OrgTalentSelection[],
    navigationLabel?: string
  ) => void;
  selectedRoleId: string | null;
  talentNavigationItems: readonly OrgTalentSelection[];
  talentNavigationLabel: string;
  workspaceId: string;
};

type OrgJobsBoardValue = ReturnType<typeof useOrgJobsBoardData>;
type OrgJobsDetailValue = ReturnType<typeof useOrgJobsDetailData>;
type OrgJobsCandidateActionsValue = ReturnType<typeof useOrgCandidateActions>;
type OrgJobsRoleActionsValue = ReturnType<typeof useOrgRoleActions>;

const OrgJobsNavigationContext = createContext<OrgJobsNavigationValue | null>(
  null
);
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

export function useOrgJobsBoard() {
  return useRequiredContext(OrgJobsBoardContext, "useOrgJobsBoard");
}

export function useOptionalOrgJobsBoard() {
  return useContext(OrgJobsBoardContext);
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
  const { permissions, workspace } = useOrgWorkspace();
  const value = useOrgRoleActions({
    canManageCandidates: permissions.canManageCandidates,
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
  routePage: Extract<OrgWorkspacePageId, "all" | "inbox" | "jobs" | "role">;
}) {
  const { roles } = useOrgWorkspace();
  const route = useOrgJobsRoute({ page: routePage });
  const {
    activeRoleId,
    activeView,
    changeRole,
    changeView,
    closeTalentDetail,
    detailRecommendationId,
    detailRoleId,
    detailTalentId,
    selectTalent,
    selectedRoleId,
    talentNavigationItems,
    talentNavigationLabel,
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
      activeView,
      changeRole,
      changeView,
      closeTalentDetail,
      detailRecommendationId,
      detailRoleId,
      detailTalentId,
      selectTalent,
      selectedRoleId,
      talentNavigationItems,
      talentNavigationLabel,
      workspaceId,
    }),
    [
      activeRole,
      activeRoleId,
      activeView,
      changeRole,
      changeView,
      closeTalentDetail,
      detailRecommendationId,
      detailRoleId,
      detailTalentId,
      selectTalent,
      selectedRoleId,
      talentNavigationItems,
      talentNavigationLabel,
      workspaceId,
    ]
  );
  return (
    <OrgJobsNavigationContext.Provider value={navigationValue}>
      {children}
    </OrgJobsNavigationContext.Provider>
  );
}

function OrgJobsBoardProvider({ children }: { children: ReactNode }) {
  const navigation = useOrgJobsNavigation();
  const value = useOrgJobsBoardData({
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
  routePage?: Extract<OrgWorkspacePageId, "all" | "inbox" | "jobs" | "role">;
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
