import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { buildOrgHref, type OrgWorkspacePageId } from "@/lib/org/routes";

export type OrgTalentSelection = {
  recommendationId: string;
  roleId: string;
  talentId: string;
  workspaceId?: string;
};

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
    if (orgId !== baseWorkspaceId || roleIsCanonical) return;
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
    baseWorkspaceId,
  ]);

  const changeRole = useCallback(
    (roleId: string) => {
      setNameQuery("");
      setRecommendedFromDate("");
      setRecommendedToDate("");
      void router.push(
        buildOrgHref({
          orgId: baseWorkspaceId,
          page: "jobs",
          roleId: roleId || "all",
        })
      );
    },
    [baseWorkspaceId, router]
  );

  const selectTalent = useCallback(
    (item: OrgTalentSelection) => {
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
        })
      );
    },
    [activeRoleId, baseWorkspaceId, page, router]
  );

  const closeTalentDetail = useCallback(() => {
    void router.replace(
      buildOrgHref({
        orgId: baseWorkspaceId,
        page,
        roleId: page === "jobs" ? activeRoleId : null,
      }),
      undefined,
      { shallow: true }
    );
  }, [activeRoleId, baseWorkspaceId, page, router]);

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
