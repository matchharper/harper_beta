import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  OPS_COMPANY_MANAGEMENT_PAGE_SIZE,
  OPS_OPPORTUNITY_COMPANY_PAGE_SIZE,
  type OpsCompanyManagementEmployeeCountRangeFilter,
  type OpsCompanyManagementQualityLabelFilter,
} from "@/lib/ops/opportunityCompanyManagement";
import { queryKeys } from "@/lib/queryKeys";
import type {
  OpsCompanyQualityLabel,
  OpsCompanyManagementPageResponse,
  OpsOpportunityCandidateSearchResponse,
  OpsOpportunityCatalogResponse,
  OpsOpportunityMatchListResponse,
  OpsOpportunityRecommendationListResponse,
  OpsOpportunityRoleListResponse,
  OpsOpportunityRoleSyncResult,
  OpsOpportunityType,
  OpsOpportunityWorkspaceExtraction,
  OpportunityEmploymentType,
  OpportunitySourceType,
  OpportunityStatus,
  OpportunityWorkMode,
} from "@/lib/ops/opportunity";

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

type DeleteRoleInput = {
  roleId: string;
  companyWorkspaceId?: string | null;
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

type UpdateCompanyHumanQualityLabelInput = {
  humanQualityLabel: OpsCompanyQualityLabel | null;
  workspaceId: string;
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

export function useOpsOpportunityCompanies(args: {
  companyName?: string | null;
  enabled?: boolean;
  employeeCountRange?: OpsCompanyManagementEmployeeCountRangeFilter | null;
  foundedYearMin?: number | string | null;
  hasCareerUrlOnly?: boolean;
  humanLabelMissingFirst?: boolean;
  investors?: string | null;
  limit?: number;
  llmQualityLabelFirst?: boolean;
  location?: string | null;
  qualityLabel?: OpsCompanyManagementQualityLabelFilter | null;
}) {
  const limit = Math.max(
    1,
    Math.min(
      Number(args.limit ?? OPS_COMPANY_MANAGEMENT_PAGE_SIZE) ||
        OPS_COMPANY_MANAGEMENT_PAGE_SIZE,
      OPS_COMPANY_MANAGEMENT_PAGE_SIZE
    )
  );
  const companyName = String(args.companyName ?? "").trim();
  const employeeCountRange = String(args.employeeCountRange ?? "").trim();
  const investors = String(args.investors ?? "").trim();
  const location = String(args.location ?? "").trim();
  const hasCareerUrlOnly = Boolean(args.hasCareerUrlOnly);
  const humanLabelMissingFirst = Boolean(args.humanLabelMissingFirst);
  const llmQualityLabelFirst = Boolean(args.llmQualityLabelFirst);
  const qualityLabel = String(args.qualityLabel ?? "").trim();
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
      humanLabelMissingFirst,
      investors,
      limit,
      llmQualityLabelFirst,
      location,
      qualityLabel,
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
      if (humanLabelMissingFirst) {
        params.set("humanLabelMissingFirst", "true");
      }
      if (llmQualityLabelFirst) {
        params.set("llmQualityLabelFirst", "true");
      }
      if (qualityLabel) {
        params.set("qualityLabel", qualityLabel);
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

export function useUpdateOpsCompanyHumanQualityLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateCompanyHumanQualityLabelInput) =>
      fetchWithInternalAuth<{
        effectiveQualityLabel: OpsCompanyQualityLabel | null;
        humanQualityLabel: OpsCompanyQualityLabel | null;
        humanQualityLabeledAt: string | null;
        workspaceId: string;
      }>("/api/internal/opportunities/companies/quality-label", {
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

      const optimisticLabeledAt =
        input.humanQualityLabel === null ? null : new Date().toISOString();

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
                      effectiveQualityLabel:
                        input.humanQualityLabel ?? item.llmQualityLabel,
                      humanQualityLabel: input.humanQualityLabel,
                      humanQualityLabeledAt: optimisticLabeledAt,
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
    onSuccess: (data) => {
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
                item.companyWorkspaceId === data.workspaceId
                  ? {
                      ...item,
                      effectiveQualityLabel: data.effectiveQualityLabel,
                      humanQualityLabel: data.humanQualityLabel,
                      humanQualityLabeledAt: data.humanQualityLabeledAt,
                    }
                  : item
              ),
            })),
          };
        }
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.opsOpportunity.companiesAll,
      });
    },
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.opsOpportunity.catalogAll,
      });
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

export function useDeleteOpsOpportunityRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeleteRoleInput) =>
      fetchWithInternalAuth<{
        ok: boolean;
        roleId: string;
        deletedCounts: Record<string, number>;
      }>("/api/internal/opportunities/role", {
        method: "DELETE",
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
