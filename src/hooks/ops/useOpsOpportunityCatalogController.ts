import { OPS_OPPORTUNITY_COMPANY_PAGE_SIZE } from "@/lib/ops/opportunityConstants";
import type {
  OpsOpportunityRoleRecord,
  OpsOpportunityWorkspaceRecord,
} from "@/lib/ops/opportunity";
import {
  useOpsOpportunityCatalog,
  useOpsOpportunityRoles,
} from "@/hooks/ops/useOpsOpportunities";
import { useCallback, useMemo, useState } from "react";

const CATALOG_ROLE_PAGE_SIZE = 10;

function uniqueRoles(rows: OpsOpportunityRoleRecord[]) {
  const roleById = new Map<string, OpsOpportunityRoleRecord>();
  for (const role of rows) {
    roleById.set(role.roleId, role);
  }
  return Array.from(roleById.values());
}

function pickWorkspace(
  workspaces: OpsOpportunityWorkspaceRecord[],
  selectedWorkspaceId: string | null
) {
  if (selectedWorkspaceId) {
    const selected = workspaces.find(
      (workspace) => workspace.companyWorkspaceId === selectedWorkspaceId
    );
    if (selected) return selected;
  }
  return workspaces[0] ?? null;
}

function pickRole(
  roles: OpsOpportunityRoleRecord[],
  selectedRoleId: string | null
) {
  if (selectedRoleId) {
    const selected = roles.find((role) => role.roleId === selectedRoleId);
    if (selected) return selected;
  }
  return roles[0] ?? null;
}

export function useOpsOpportunityCatalogController(args: {
  canFetchInternal: boolean;
}) {
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [appliedWorkspaceSearch, setAppliedWorkspaceSearch] = useState("");
  const [roleSearch, setRoleSearch] = useState("");
  const [appliedRoleSearch, setAppliedRoleSearch] = useState("");
  const [requestedWorkspaceId, setRequestedWorkspaceId] = useState<
    string | null
  >(null);
  const [requestedRoleId, setRequestedRoleId] = useState<string | null>(null);

  const catalogQuery = useOpsOpportunityCatalog({
    enabled: args.canFetchInternal,
    internalOnly: true,
    limit: OPS_OPPORTUNITY_COMPANY_PAGE_SIZE,
    workspaceQuery: appliedWorkspaceSearch,
  });
  const {
    data: catalogData,
    error: catalogError,
    fetchNextPage: fetchNextCatalogPage,
    hasNextPage: hasNextCatalogPage,
    isFetching: isFetchingCatalog,
    isFetchingNextPage: isFetchingNextCatalogPage,
    isLoading: isLoadingCatalog,
    refetch: refetchCatalog,
  } = catalogQuery;

  const workspaces = useMemo(
    () => catalogData?.pages.flatMap((page) => page.workspaces) ?? [],
    [catalogData?.pages]
  );
  const selectedWorkspace = useMemo(
    () => pickWorkspace(workspaces, requestedWorkspaceId),
    [requestedWorkspaceId, workspaces]
  );
  const selectedWorkspaceId = selectedWorkspace?.companyWorkspaceId ?? null;

  const catalogRolesQuery = useOpsOpportunityRoles({
    enabled: args.canFetchInternal && Boolean(selectedWorkspaceId),
    internalOnly: true,
    limit: CATALOG_ROLE_PAGE_SIZE,
    query: appliedRoleSearch,
    sourceType: "internal",
    workspaceId: selectedWorkspaceId,
  });
  const {
    data: catalogRolesData,
    error: catalogRolesError,
    fetchNextPage: fetchNextCatalogRolesPage,
    hasNextPage: hasNextCatalogRolesPage,
    isFetching: isFetchingCatalogRoles,
    isFetchingNextPage: isFetchingNextCatalogRolesPage,
    isLoading: isLoadingCatalogRoles,
    refetch: refetchCatalogRoles,
  } = catalogRolesQuery;

  const roles = useMemo(
    () => uniqueRoles(catalogData?.pages.flatMap((page) => page.roles) ?? []),
    [catalogData?.pages]
  );
  const catalogRoles = useMemo(
    () =>
      uniqueRoles(catalogRolesData?.pages.flatMap((page) => page.items) ?? []),
    [catalogRolesData?.pages]
  );
  const knownRoles = useMemo(
    () => uniqueRoles([...roles, ...catalogRoles]),
    [catalogRoles, roles]
  );
  const selectedRole = useMemo(
    () => pickRole(catalogRoles, requestedRoleId),
    [catalogRoles, requestedRoleId]
  );
  const selectedRoleId = selectedRole?.roleId ?? null;

  const workspaceTotalCount = useMemo(() => {
    const pages = catalogData?.pages ?? [];
    return pages[0]?.workspaceTotalCount ?? workspaces.length;
  }, [catalogData?.pages, workspaces.length]);
  const roleTotalCount = useMemo(() => {
    const pages = catalogRolesData?.pages ?? [];
    return pages[0]?.totalCount ?? catalogRoles.length;
  }, [catalogRoles.length, catalogRolesData?.pages]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    setRequestedWorkspaceId(workspaceId);
    setRequestedRoleId(null);
  }, []);

  const selectRole = useCallback((roleId: string) => {
    setRequestedRoleId(roleId);
  }, []);

  const handleWorkspaceSearchSubmit = useCallback(() => {
    const nextSearch = workspaceSearch.trim();
    if (nextSearch === appliedWorkspaceSearch) {
      void refetchCatalog();
      return;
    }
    setAppliedWorkspaceSearch(nextSearch);
    setRequestedWorkspaceId(null);
    setRequestedRoleId(null);
  }, [appliedWorkspaceSearch, refetchCatalog, workspaceSearch]);

  const handleRoleSearchSubmit = useCallback(() => {
    const nextSearch = roleSearch.trim();
    if (nextSearch === appliedRoleSearch) {
      void refetchCatalogRoles();
      return;
    }
    setAppliedRoleSearch(nextSearch);
    setRequestedRoleId(null);
  }, [appliedRoleSearch, refetchCatalogRoles, roleSearch]);

  const handleLoadMoreWorkspaces = useCallback(() => {
    if (isFetchingNextCatalogPage || !hasNextCatalogPage) return;
    void fetchNextCatalogPage();
  }, [fetchNextCatalogPage, hasNextCatalogPage, isFetchingNextCatalogPage]);

  const handleLoadMoreRoles = useCallback(() => {
    if (isFetchingNextCatalogRolesPage || !hasNextCatalogRolesPage) {
      return;
    }
    void fetchNextCatalogRolesPage();
  }, [
    fetchNextCatalogRolesPage,
    hasNextCatalogRolesPage,
    isFetchingNextCatalogRolesPage,
  ]);

  return {
    allRoles: roles,
    catalogErrorMessage:
      catalogError instanceof Error
        ? catalogError.message
        : catalogRolesError instanceof Error
          ? catalogRolesError.message
          : null,
    catalogLoading: isLoadingCatalog,
    catalogRoles,
    knownRoles,
    onLoadMoreRoles: handleLoadMoreRoles,
    onLoadMoreWorkspaces: handleLoadMoreWorkspaces,
    onRoleSearchChange: setRoleSearch,
    onRoleSearchSubmit: handleRoleSearchSubmit,
    onRoleSelect: selectRole,
    onWorkspaceSearchChange: setWorkspaceSearch,
    onWorkspaceSearchSubmit: handleWorkspaceSearchSubmit,
    onWorkspaceSelect: selectWorkspace,
    refetchCatalog,
    refetchRoles: refetchCatalogRoles,
    roleLoading: isLoadingCatalogRoles,
    roleSearch,
    roleTotalCount,
    selectedRole,
    selectedRoleId,
    selectedWorkspace,
    selectedWorkspaceId,
    setSelectedRoleId: setRequestedRoleId,
    setSelectedWorkspaceId: setRequestedWorkspaceId,
    workspaceSearch,
    workspaceTotalCount,
    workspaces,
    isFetching: isFetchingCatalog || isFetchingCatalogRoles,
  };
}
