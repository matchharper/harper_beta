import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";
import type {
  MatchCandidateDetailResponse,
  MatchDecisionStatus,
  MatchEmploymentType,
  MatchRoleStatus,
  MatchWorkspaceResponse,
} from "@/lib/match/shared";
import type { Json } from "@/types/database.types";
import type { MatchCandidateListItem } from "@/lib/match/server";

type MatchCandidatesResponse = {
  hasNext: boolean;
  items: MatchCandidateListItem[];
  total: number;
  workspace: MatchWorkspaceResponse["workspace"];
};

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
  employmentTypes?: MatchEmploymentType[];
  externalJdUrl?: string | null;
  information?: Json | null;
  name: string;
  roleId?: string | null;
  status?: MatchRoleStatus;
};

type UpdateDecisionInput = {
  candidId: string;
  feedbackText: string;
  roleId: string;
  status: Exclude<MatchDecisionStatus, "pending">;
  workspaceId?: string | null;
};

function buildWorkspaceUrl(workspaceId?: string | null) {
  const params = new URLSearchParams();
  if (workspaceId) {
    params.set("workspaceId", workspaceId);
  }
  const query = params.toString();
  return query ? `/api/match/workspace?${query}` : "/api/match/workspace";
}

function buildCandidateDetailUrl(args: {
  candidId: string;
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("candidId", args.candidId);
  if (args.roleId) {
    params.set("roleId", args.roleId);
  }
  if (args.workspaceId) {
    params.set("workspaceId", args.workspaceId);
  }
  return `/api/match/candidate?${params.toString()}`;
}

export function useMatchWorkspace(workspaceId?: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.match.workspace(workspaceId),
    queryFn: () =>
      fetchWithInternalAuth<MatchWorkspaceResponse>(buildWorkspaceUrl(workspaceId)),
    enabled,
    staleTime: 15_000,
  });
}

export function useCreateMatchWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Required<Pick<SaveWorkspaceInput, "companyName">> & SaveWorkspaceInput) =>
      fetchWithInternalAuth<MatchWorkspaceResponse>("/api/match/workspace", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.match.all });
      queryClient.setQueryData(
        queryKeys.match.workspace(data.workspace?.companyWorkspaceId ?? "active"),
        data
      );
    },
  });
}

export function useUpdateMatchWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveWorkspaceInput) =>
      fetchWithInternalAuth<MatchWorkspaceResponse>("/api/match/workspace", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.match.all });
      queryClient.setQueryData(
        queryKeys.match.workspace(data.workspace?.companyWorkspaceId ?? "active"),
        data
      );
    },
  });
}

export function useSaveMatchRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveRoleInput) =>
      fetchWithInternalAuth<{
        role: MatchWorkspaceResponse["roles"][number];
        workspace: MatchWorkspaceResponse;
      }>("/api/match/role", {
        method: input.roleId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.match.all });
      queryClient.setQueryData(
        queryKeys.match.workspace(data.workspace.workspace?.companyWorkspaceId ?? "active"),
        data.workspace
      );
    },
  });
}

export function useMatchCandidates(args: {
  enabled?: boolean;
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  return useQuery({
    queryKey: queryKeys.match.candidates(args.workspaceId, args.roleId),
    queryFn: () =>
      fetchWithInternalAuth<MatchCandidatesResponse>("/api/match/candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pageIdx: 0,
          pageSize: 24,
          roleId: args.roleId,
          workspaceId: args.workspaceId,
        }),
      }),
    enabled: args.enabled ?? true,
    staleTime: 10_000,
  });
}

export function useMatchCandidateDetail(args: {
  candidId?: string;
  enabled?: boolean;
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  return useQuery({
    queryKey: queryKeys.match.candidateDetail(args.candidId ?? "", args.roleId),
    queryFn: () =>
      fetchWithInternalAuth<MatchCandidateDetailResponse>(
        buildCandidateDetailUrl({
          candidId: String(args.candidId ?? ""),
          roleId: args.roleId,
          workspaceId: args.workspaceId,
        })
      ),
    enabled: (args.enabled ?? true) && Boolean(args.candidId),
    staleTime: 10_000,
  });
}

export function useUpdateMatchCandidateDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateDecisionInput) =>
      fetchWithInternalAuth<MatchCandidateDetailResponse>("/api/match/candidate", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.match.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.match.candidateDetail(
            data.match.candidId,
            data.match.roleId
          ),
        }),
      ]);
      queryClient.setQueryData(
        queryKeys.match.candidateDetail(data.match.candidId, data.match.roleId),
        data
      );
    },
  });
}
