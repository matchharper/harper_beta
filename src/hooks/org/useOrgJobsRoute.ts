import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import type { OrgTalentDetailNavigationTarget } from "@/lib/org/detailNavigation";
import {
  buildOrgHref,
  type OrgJobsView,
  type OrgWorkspacePageId,
} from "@/lib/org/routes";

export type OrgTalentSelection = OrgTalentDetailNavigationTarget;

function getQueryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function useOrgJobsRoute({
  page = "jobs",
}: {
  page?: Extract<OrgWorkspacePageId, "all" | "inbox" | "jobs">;
} = {}) {
  const router = useRouter();
  const { roles, workspace } = useOrgWorkspace();
  const baseWorkspaceId = workspace.workspaceId;
  const urlRoleId = router.isReady ? getQueryText(router.query.roleId) : "";
  const urlView = router.isReady ? getQueryText(router.query.view) : "";
  const detailTalentId = router.isReady
    ? getQueryText(router.query.talentId)
    : "";
  const detailRecommendationId = router.isReady
    ? getQueryText(router.query.recommendationId)
    : "";
  const detailRoleId = router.isReady
    ? getQueryText(router.query.detailRoleId)
    : "";
  const detailWorkspaceId = router.isReady
    ? getQueryText(router.query.detailWorkspaceId)
    : "";
  const workspaceId =
    page === "all" && detailWorkspaceId ? detailWorkspaceId : baseWorkspaceId;
  const [nameQuery, setNameQuery] = useState("");
  const [recommendedFromDate, setRecommendedFromDate] = useState("");
  const [recommendedToDate, setRecommendedToDate] = useState("");
  const [talentNavigationItems, setTalentNavigationItems] = useState<
    OrgTalentSelection[]
  >([]);
  const [talentNavigationLabel, setTalentNavigationLabel] = useState("");
  const requestedRoleId = urlRoleId || "all";
  const activeRoleId =
    requestedRoleId === "all" ||
    roles.some((role) => role.roleId === requestedRoleId)
      ? requestedRoleId
      : "all";
  const selectedRoleId = activeRoleId === "all" ? null : activeRoleId;
  const activeView: OrgJobsView =
    page === "jobs" && urlView === "pipeline" ? "pipeline" : "role";

  useEffect(() => {
    if (!router.isReady) return;
    const orgId = getQueryText(router.query.orgId);
    const roleIsCanonical =
      urlRoleId === activeRoleId || (!urlRoleId && activeRoleId === "all");
    const viewIsCanonical =
      page !== "jobs" ||
      (activeRoleId === "all" ? !urlView : urlView === activeView);
    if (orgId !== baseWorkspaceId || (roleIsCanonical && viewIsCanonical)) {
      return;
    }
    const nextQuery: Record<string, string | string[] | undefined> = {
      ...router.query,
      roleId: activeRoleId,
    };
    if (activeRoleId === "all") {
      delete nextQuery.view;
    } else {
      nextQuery.view = activeView;
    }
    void router.replace(
      {
        pathname: router.pathname,
        query: nextQuery,
      },
      undefined,
      { shallow: true }
    );
  }, [
    activeRoleId,
    activeView,
    page,
    router,
    router.isReady,
    router.query,
    urlRoleId,
    urlView,
    baseWorkspaceId,
  ]);

  const changeRole = useCallback(
    (roleId: string, view: OrgJobsView = "role") => {
      setNameQuery("");
      setRecommendedFromDate("");
      setRecommendedToDate("");
      void router.push(
        buildOrgHref({
          orgId: baseWorkspaceId,
          page: "jobs",
          roleId: roleId || "all",
          view,
        })
      );
    },
    [baseWorkspaceId, router]
  );

  const changeView = useCallback(
    (view: OrgJobsView) => {
      if (activeRoleId === "all" || view === activeView) return;
      void router.push(
        buildOrgHref({
          orgId: baseWorkspaceId,
          page: "jobs",
          roleId: activeRoleId,
          view,
        })
      );
    },
    [activeRoleId, activeView, baseWorkspaceId, router]
  );

  const selectTalent = useCallback(
    (
      item: OrgTalentSelection,
      navigationItems: readonly OrgTalentSelection[] = [],
      navigationLabel = ""
    ) => {
      setTalentNavigationItems([...navigationItems]);
      setTalentNavigationLabel(navigationLabel);
      void router.push(
        buildOrgHref({
          detail: {
            recommendationId: item.recommendationId,
            roleId: item.roleId,
            talentId: item.talentId,
            workspaceId: item.workspaceId ?? baseWorkspaceId,
          },
          orgId: baseWorkspaceId,
          page,
          roleId: page === "jobs" ? activeRoleId : null,
          view: page === "jobs" ? activeView : null,
        })
      );
    },
    [activeRoleId, activeView, baseWorkspaceId, page, router]
  );

  const closeTalentDetail = useCallback(() => {
    setTalentNavigationItems([]);
    setTalentNavigationLabel("");
    void router.replace(
      buildOrgHref({
        orgId: baseWorkspaceId,
        page,
        roleId: page === "jobs" ? activeRoleId : null,
        view: page === "jobs" ? activeView : null,
      }),
      undefined,
      { shallow: true }
    );
  }, [activeRoleId, activeView, baseWorkspaceId, page, router]);

  const setRecommendedDateRange = useCallback((from: string, to: string) => {
    setRecommendedFromDate(from);
    setRecommendedToDate(to);
  }, []);

  return {
    activeRoleId,
    activeView,
    changeRole,
    changeView,
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
    talentNavigationItems,
    talentNavigationLabel,
    workspaceId,
  };
}
