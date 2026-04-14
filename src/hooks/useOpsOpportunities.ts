import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";
import type {
  OpsOpportunityCandidateSearchResponse,
  OpsOpportunityCatalogResponse,
  OpsOpportunityMatchListResponse,
  OpsOpportunityRecommendationListResponse,
  OpsOpportunityType,
  OpportunityEmploymentType,
  OpportunitySourceType,
  OpportunityStatus,
  OpportunityWorkMode,
} from "@/lib/opsOpportunity";

type SaveWorkspaceInput = {
  companyDescription?: string | null;
  companyName?: string;
  homepageUrl?: string | null;
  linkedinUrl?: string | null;
  workspaceId?: string | null;
};

type SaveRoleInput = {
  companyWorkspaceId?: string | null;
  description?: string | null;
  employmentTypes?: OpportunityEmploymentType[];
  expiresAt?: string | null;
  externalJdUrl?: string | null;
  locationText?: string | null;
  name?: string;
  postedAt?: string | null;
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
      Boolean(String(args.roleId ?? "").trim() || String(args.candidId ?? "").trim()),
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
    queryKey: queryKeys.opsOpportunity.recommendations(args.roleId, args.talentId),
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
      Boolean(String(args.roleId ?? "").trim() || String(args.talentId ?? "").trim()),
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
