import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { OPS_OPPORTUNITY_COMPANY_PAGE_SIZE } from "@/lib/ops/opportunityConstants";
import { queryKeys } from "@/lib/queryKeys";
import type {
  OpsOpportunityCatalogResponse,
  OpsOpportunityRoleListResponse,
  OpportunityEmploymentType,
  OpportunitySourceType,
  OpportunityStatus,
  OpportunityWorkMode,
} from "@/lib/ops/opportunity";

type SaveRoleInput = {
  companyWorkspaceId?: string | null;
  description?: string | null;
  descriptionSummary?: string | null;
  employmentTypes?: OpportunityEmploymentType[];
  expiresAt?: string | null;
  externalJdUrl?: string | null;
  locationText?: string | null;
  name?: string;
  postedAt?: string | null;
  request?: string | null;
  roleId?: string | null;
  sourceJobId?: string | null;
  sourceProvider?: string | null;
  sourceType?: OpportunitySourceType | null;
  status?: OpportunityStatus | null;
  workMode?: OpportunityWorkMode | null;
};

export function useOpsOpportunityCatalog(
  args: {
    enabled?: boolean;
    internalOnly?: boolean;
    limit?: number;
    workspaceQuery?: string | null;
  } = {}
) {
  const limit = Math.max(
    1,
    Math.min(
      Number(args.limit ?? OPS_OPPORTUNITY_COMPANY_PAGE_SIZE) ||
        OPS_OPPORTUNITY_COMPANY_PAGE_SIZE,
      OPS_OPPORTUNITY_COMPANY_PAGE_SIZE
    )
  );
  const workspaceQuery = String(args.workspaceQuery ?? "").trim();
  const internalOnly = Boolean(args.internalOnly);

  return useInfiniteQuery({
    queryKey: queryKeys.opsOpportunity.catalog({
      internalOnly,
      limit,
      workspaceQuery,
    }),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(pageParam));
      if (internalOnly) {
        params.set("internalOnly", "true");
      }
      if (workspaceQuery) {
        params.set("workspaceQuery", workspaceQuery);
      }
      return fetchWithInternalAuth<OpsOpportunityCatalogResponse>(
        `/api/internal/opportunities/catalog?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextWorkspaceOffset ?? undefined,
    enabled: args.enabled ?? true,
    staleTime: 15_000,
  });
}

export function useOpsOpportunityRoles(
  args: {
    enabled?: boolean;
    internalOnly?: boolean;
    limit?: number;
    query?: string | null;
    roleId?: string | null;
    sourceType?: OpportunitySourceType | null;
    workspaceId?: string | null;
  } = {}
) {
  const limit = Math.max(1, Math.min(Number(args.limit ?? 25) || 25, 100));
  const query = String(args.query ?? "").trim();
  const sourceType =
    args.sourceType === "internal" || args.sourceType === "external"
      ? args.sourceType
      : null;
  const roleId = String(args.roleId ?? "").trim();
  const workspaceId = String(args.workspaceId ?? "").trim();
  const internalOnly = Boolean(args.internalOnly);

  return useInfiniteQuery({
    queryKey: queryKeys.opsOpportunity.roles({
      internalOnly,
      limit,
      query,
      roleId,
      sourceType,
      workspaceId,
    }),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(pageParam));
      if (internalOnly) {
        params.set("internalOnly", "true");
      }
      if (query) {
        params.set("query", query);
      }
      if (roleId) {
        params.set("roleId", roleId);
      }
      if (sourceType) {
        params.set("sourceType", sourceType);
      }
      if (workspaceId) {
        params.set("workspaceId", workspaceId);
      }
      return fetchWithInternalAuth<OpsOpportunityRoleListResponse>(
        `/api/internal/opportunities/roles?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: (args.enabled ?? true) && Boolean(workspaceId),
    staleTime: 15_000,
  });
}

export function useSaveOpsOpportunityRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveRoleInput) =>
      fetchWithInternalAuth<{
        role: OpsOpportunityCatalogResponse["roles"][number];
      }>("/api/internal/opportunities/role", {
        method: input.roleId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.opsOpportunity.all,
      });
    },
  });
}
