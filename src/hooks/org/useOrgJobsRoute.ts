import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { buildOrgHref } from "@/lib/org/routes";
import type { OrgBoardItem } from "@/lib/org/server";

function getQueryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function useOrgJobsRoute() {
  const router = useRouter();
  const { roles, workspace } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const urlRoleId = router.isReady ? getQueryText(router.query.roleId) : "";
  const detailTalentId = router.isReady
    ? getQueryText(router.query.talentId)
    : "";
  const detailRecommendationId = router.isReady
    ? getQueryText(router.query.recommendationId)
    : "";
  const detailRoleId = router.isReady
    ? getQueryText(router.query.detailRoleId)
    : "";
  const [nameQuery, setNameQuery] = useState("");
  const [recommendedFromDate, setRecommendedFromDate] = useState("");
  const [recommendedToDate, setRecommendedToDate] = useState("");
  const requestedRoleId = urlRoleId || "all";
  const activeRoleId =
    requestedRoleId === "all" ||
    roles.some((role) => role.roleId === requestedRoleId)
      ? requestedRoleId
      : "all";
  const selectedRoleId = activeRoleId === "all" ? null : activeRoleId;

  useEffect(() => {
    if (!router.isReady) return;
    const orgId = getQueryText(router.query.orgId);
    const roleIsCanonical =
      urlRoleId === activeRoleId || (!urlRoleId && activeRoleId === "all");
    if (orgId !== workspaceId || roleIsCanonical) return;
    void router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, roleId: activeRoleId },
      },
      undefined,
      { shallow: true }
    );
  }, [
    activeRoleId,
    router,
    router.isReady,
    router.query,
    urlRoleId,
    workspaceId,
  ]);

  const changeRole = useCallback(
    (roleId: string) => {
      setNameQuery("");
      setRecommendedFromDate("");
      setRecommendedToDate("");
      void router.push(
        buildOrgHref({
          orgId: workspaceId,
          page: "jobs",
          roleId: roleId || "all",
        })
      );
    },
    [router, workspaceId]
  );

  const selectTalent = useCallback(
    (item: OrgBoardItem) => {
      void router.push(
        buildOrgHref({
          detail: {
            recommendationId: item.recommendationId,
            roleId: item.roleId,
            talentId: item.talentId,
          },
          orgId: workspaceId,
          page: "jobs",
          roleId: activeRoleId,
        })
      );
    },
    [activeRoleId, router, workspaceId]
  );

  const closeTalentDetail = useCallback(() => {
    void router.replace(
      buildOrgHref({
        orgId: workspaceId,
        page: "jobs",
        roleId: activeRoleId,
      }),
      undefined,
      { shallow: true }
    );
  }, [activeRoleId, router, workspaceId]);

  const setRecommendedDateRange = useCallback((from: string, to: string) => {
    setRecommendedFromDate(from);
    setRecommendedToDate(to);
  }, []);

  return {
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
  };
}
