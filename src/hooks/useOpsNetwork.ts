import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  type NetworkLeadDetailResponse,
  type NetworkLeadListResponse,
  type TalentInternalType,
} from "@/lib/opsNetwork";

export const opsNetworkLeadsKey = ["ops-network-leads"] as const;
export const opsNetworkDetailKey = (leadId?: number | null) =>
  ["ops-network-detail", leadId] as const;

export function useOpsNetworkLeads(limit = 40) {
  return useInfiniteQuery({
    queryKey: [...opsNetworkLeadsKey, limit],
    queryFn: ({ pageParam }) =>
      fetchWithInternalAuth<NetworkLeadListResponse>(
        `/api/internal/network/leads?limit=${limit}&offset=${pageParam}`
      ),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    staleTime: 30_000,
  });
}

export function useOpsNetworkDetail(leadId?: number | null) {
  return useQuery({
    queryKey: opsNetworkDetailKey(leadId),
    queryFn: () =>
      fetchWithInternalAuth<NetworkLeadDetailResponse>(
        `/api/internal/network/detail?id=${leadId}`
      ),
    enabled: typeof leadId === "number" && leadId > 0,
    staleTime: 15_000,
  });
}

export function useIngestOpsNetworkLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: number) =>
      fetchWithInternalAuth<{
        ok: boolean;
        resumeTextIncluded: boolean;
        talentId: string;
      }>("/api/internal/network/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: leadId }),
      }),
    onSuccess: async (_, leadId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: opsNetworkLeadsKey }),
        queryClient.invalidateQueries({
          queryKey: opsNetworkDetailKey(leadId),
        }),
      ]);
    },
  });
}

export function useCreateOpsNetworkInternalEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      content: string;
      id: number;
      type: "conversation" | "memo";
    }) =>
      fetchWithInternalAuth<{ ok: boolean }>("/api/internal/network/internal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: opsNetworkLeadsKey }),
        queryClient.invalidateQueries({
          queryKey: opsNetworkDetailKey(variables.id),
        }),
      ]);
    },
  });
}

export function useUpdateOpsNetworkInternalEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      content: string;
      entryId: number;
      leadId: number;
    }) =>
      fetchWithInternalAuth<{ ok: boolean }>("/api/internal/network/internal", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: args.content,
          entryId: args.entryId,
        }),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: opsNetworkLeadsKey }),
        queryClient.invalidateQueries({
          queryKey: opsNetworkDetailKey(variables.leadId),
        }),
      ]);
    },
  });
}

export function useDeleteOpsNetworkInternalEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { entryId: number; leadId: number }) =>
      fetchWithInternalAuth<{ ok: boolean }>("/api/internal/network/internal", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entryId: args.entryId,
        }),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: opsNetworkLeadsKey }),
        queryClient.invalidateQueries({
          queryKey: opsNetworkDetailKey(variables.leadId),
        }),
      ]);
    },
  });
}

export function useSendOpsNetworkMail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      content: string;
      fromEmail: string;
      id: number;
      subject: string;
    }) =>
      fetchWithInternalAuth<{ ok: boolean }>("/api/internal/network/mail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: opsNetworkLeadsKey }),
        queryClient.invalidateQueries({
          queryKey: opsNetworkDetailKey(variables.id),
        }),
      ]);
    },
  });
}
