import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsCompanyManagementEmployeeCountRangeFilter } from "@/lib/opsOpportunityCompanyManagement";
import { queryKeys } from "@/lib/queryKeys";
import type {
  OpsCompanyManagementPageResponse,
  OpsOpportunityCandidateSearchResponse,
  OpsOpportunityCatalogResponse,
  OpsOpportunityMatchListResponse,
  OpsOpportunityRecommendationListResponse,
  OpsOpportunityRoleSyncResult,
  OpsOpportunityType,
  OpsOpportunityWorkspaceExtraction,
  OpportunityEmploymentType,
  OpportunitySourceType,
  OpportunityStatus,
  OpportunityWorkMode,
} from "@/lib/opsOpportunity";

type SaveWorkspaceInput = {
  careerUrl?: string | null;
  companyDescription?: string | null;
  companyName?: string;
  homepageUrl?: string | null;
  isInternal?: boolean;
  linkedinUrl?: string | null;
  pitch?: string | null;
  request?: string | null;
  workspaceId?: string | null;
};

type ExtractWorkspaceInput = {
  linkedinUrl?: string | null;
};

type SyncRolesInput = {
  careerUrl?: string | null;
  workspaceId: string;
};

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

type SaveMatchInput = {
  candidId: string;
  harperMemo?: string | null;
  roleId: string;
};

type DeleteMatchInput = {
  candidId: string;
  roleId: string;
};

type SaveRecommendationInput = {
  opportunityType: OpsOpportunityType;
  recommendationMemo?: string | null;
  roleId: string;
  talentId: string;
};

type DeleteRecommendationInput = {
  recommendationId: string;
};

type GenerateRecommendationDraftInput = {
  opportunityType: OpsOpportunityType;
  promptTemplate?: string | null;
  roleId: string;
  talentId: string;
};

type GenerateRecommendationDraftResponse = {
  draft: string;
};

type SendCandidateMailInput = {
  content: string;
  fromEmail: string;
  subject: string;
  talentId: string;
};

type UpdateCompanyScrapeOriginalInput = {
  isScrapeOriginal: boolean;
  workspaceId: string;
};

export function useOpsOpportunityCatalog() {
  return useQuery({
    queryKey: queryKeys.opsOpportunity.catalog,
    queryFn: () =>
      fetchWithInternalAuth<OpsOpportunityCatalogResponse>(
        "/api/internal/opportunities/catalog"
      ),
    staleTime: 15_000,
  });
}

export function useOpsOpportunityCompanies(args: {
  companyName?: string | null;
  enabled?: boolean;
  employeeCountRange?: OpsCompanyManagementEmployeeCountRangeFilter | null;
  foundedYearMin?: number | string | null;
  hasCareerUrlOnly?: boolean;
  investors?: string | null;
  limit?: number;
  location?: string | null;
}) {
  const limit = Math.max(1, Math.min(Number(args.limit ?? 30) || 30, 80));
  const companyName = String(args.companyName ?? "").trim();
  const employeeCountRange = String(args.employeeCountRange ?? "").trim();
  const investors = String(args.investors ?? "").trim();
  const location = String(args.location ?? "").trim();
  const hasCareerUrlOnly = Boolean(args.hasCareerUrlOnly);
  const foundedYearMinNumber = Number(args.foundedYearMin ?? "");
  const foundedYearMin =
    Number.isFinite(foundedYearMinNumber) && foundedYearMinNumber > 0
      ? Math.floor(foundedYearMinNumber)
      : null;

  return useInfiniteQuery({
    queryKey: queryKeys.opsOpportunity.companies({
      companyName,
      employeeCountRange,
      foundedYearMin,
      hasCareerUrlOnly,
      investors,
      limit,
      location,
    }),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(pageParam));
      if (companyName) {
        params.set("companyName", companyName);
      }
      if (employeeCountRange) {
        params.set("employeeCountRange", employeeCountRange);
      }
      if (location) {
        params.set("location", location);
      }
      if (investors) {
        params.set("investors", investors);
      }
      if (foundedYearMin) {
        params.set("foundedYearMin", String(foundedYearMin));
      }
      if (hasCareerUrlOnly) {
        params.set("hasCareerUrlOnly", "true");
      }

      return fetchWithInternalAuth<OpsCompanyManagementPageResponse>(
        `/api/internal/opportunities/companies?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: args.enabled ?? true,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateOpsCompanyScrapeOriginal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateCompanyScrapeOriginalInput) =>
      fetchWithInternalAuth<{
        isScrapeOriginal: boolean;
        workspaceId: string;
      }>("/api/internal/opportunities/companies", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.opsOpportunity.companiesAll,
      });

      queryClient.setQueriesData<
        InfiniteData<OpsCompanyManagementPageResponse>
      >(
        {
          queryKey: queryKeys.opsOpportunity.companiesAll,
        },
        (current) => {
          if (!current) return current;
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.companyWorkspaceId === input.workspaceId
                  ? {
                      ...item,
                      isScrapeOriginal: input.isScrapeOriginal,
                    }
                  : item
              ),
            })),
          };
        }
      );
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.opsOpportunity.companiesAll,
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.opsOpportunity.companiesAll,
      });
    },
  });
}

export function useSaveOpsOpportunityWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveWorkspaceInput) =>
      fetchWithInternalAuth<{
        workspace: OpsOpportunityCatalogResponse["workspaces"][number];
      }>("/api/internal/opportunities/workspace", {
        method: input.workspaceId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    onSuccess: (data, input) => {
      queryClient.setQueryData<OpsOpportunityCatalogResponse | undefined>(
        queryKeys.opsOpportunity.catalog,
        (current) => {
          if (!current) return current;

          const savedWorkspace = data.workspace;
          const existingWorkspace = current.workspaces.find(
            (workspace) =>
              workspace.companyWorkspaceId === savedWorkspace.companyWorkspaceId
          );
          const nextWorkspace = existingWorkspace
            ? {
                ...existingWorkspace,
                ...savedWorkspace,
              }
            : savedWorkspace;

          const remainingWorkspaces = current.workspaces.filter(
            (workspace) =>
              workspace.companyWorkspaceId !== savedWorkspace.companyWorkspaceId
          );
          const nextWorkspaces = input.workspaceId
            ? current.workspaces.map((workspace) =>
                workspace.companyWorkspaceId === savedWorkspace.companyWorkspaceId
                  ? nextWorkspace
                  : workspace
              )
            : [nextWorkspace, ...remainingWorkspaces];

          return {
            ...current,
            workspaces: nextWorkspaces,
          };
        }
      );
    },
  });
}

export function useExtractOpsOpportunityWorkspace() {
  return useMutation({
    mutationFn: (input: ExtractWorkspaceInput) =>
      fetchWithInternalAuth<{
        workspace: OpsOpportunityWorkspaceExtraction;
      }>("/api/internal/opportunities/workspace/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }),
  });
}

export function useSyncOpsOpportunityRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SyncRolesInput) =>
      fetchWithInternalAuth<{
        result: OpsOpportunityRoleSyncResult;
      }>("/api/internal/opportunities/role/sync", {
        method: "POST",
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

export function useOpsOpportunityCandidates(args: {
  enabled?: boolean;
  query?: string | null;
  roleId?: string | null;
}) {
  return useQuery({
    queryKey: queryKeys.opsOpportunity.candidates(args.query, args.roleId),
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("query", String(args.query ?? ""));
      if (args.roleId) {
        params.set("roleId", args.roleId);
      }
      return fetchWithInternalAuth<OpsOpportunityCandidateSearchResponse>(
        `/api/internal/opportunities/candidates?${params.toString()}`
      );
    },
    enabled: (args.enabled ?? true) && Boolean(String(args.query ?? "").trim()),
    staleTime: 10_000,
  });
}

export function useOpsOpportunityMatches(args: {
  candidId?: string | null;
  enabled?: boolean;
  roleId?: string | null;
}) {
  return useQuery({
    queryKey: queryKeys.opsOpportunity.matches(args.roleId, args.candidId),
    queryFn: () => {
      const params = new URLSearchParams();
      if (args.roleId) {
        params.set("roleId", args.roleId);
      }
      if (args.candidId) {
        params.set("candidId", args.candidId);
      }
      return fetchWithInternalAuth<OpsOpportunityMatchListResponse>(
        `/api/internal/opportunities/matches?${params.toString()}`
      );
    },
    enabled:
      (args.enabled ?? true) &&
      Boolean(
        String(args.roleId ?? "").trim() || String(args.candidId ?? "").trim()
      ),
    staleTime: 10_000,
  });
}

export function useSaveOpsOpportunityMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveMatchInput) =>
      fetchWithInternalAuth<OpsOpportunityMatchListResponse>(
        "/api/internal/opportunities/matches",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.opsOpportunity.all,
      });
    },
  });
}

export function useDeleteOpsOpportunityMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeleteMatchInput) =>
      fetchWithInternalAuth<{ ok: boolean }>(
        "/api/internal/opportunities/matches",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.opsOpportunity.all,
      });
    },
  });
}

export function useOpsOpportunityRecommendations(args: {
  enabled?: boolean;
  roleId?: string | null;
  talentId?: string | null;
}) {
  return useQuery({
    queryKey: queryKeys.opsOpportunity.recommendations(
      args.roleId,
      args.talentId
    ),
    queryFn: () => {
      const params = new URLSearchParams();
      if (args.roleId) {
        params.set("roleId", args.roleId);
      }
      if (args.talentId) {
        params.set("talentId", args.talentId);
      }
      return fetchWithInternalAuth<OpsOpportunityRecommendationListResponse>(
        `/api/internal/opportunities/recommendations?${params.toString()}`
      );
    },
    enabled:
      (args.enabled ?? true) &&
      Boolean(
        String(args.roleId ?? "").trim() || String(args.talentId ?? "").trim()
      ),
    staleTime: 10_000,
  });
}

export function useSaveOpsOpportunityRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveRecommendationInput) =>
      fetchWithInternalAuth<OpsOpportunityRecommendationListResponse>(
        "/api/internal/opportunities/recommendations",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.opsOpportunity.all,
      });
    },
  });
}

export function useDeleteOpsOpportunityRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeleteRecommendationInput) =>
      fetchWithInternalAuth<{ ok: boolean }>(
        "/api/internal/opportunities/recommendations",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.opsOpportunity.all,
      });
    },
  });
}

export function useGenerateOpsOpportunityRecommendationDraft() {
  return useMutation({
    mutationFn: (input: GenerateRecommendationDraftInput) =>
      fetchWithInternalAuth<GenerateRecommendationDraftResponse>(
        "/api/internal/opportunities/recommendation-draft",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        }
      ),
  });
}

export function useSendOpsOpportunityCandidateMail() {
  return useMutation({
    mutationFn: (input: SendCandidateMailInput) =>
      fetchWithInternalAuth<{
        ok: boolean;
        recipientEmail: string;
        recipientName: string | null;
      }>("/api/internal/opportunities/candidate-mail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }),
  });
}
