import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  type NetworkLeadDetailResponse,
  type NetworkLeadListResponse,
  type NetworkLeadMessagesPageResponse,
  type TalentInternalType,
} from "@/lib/opsNetwork";

export const opsNetworkLeadsKey = ["ops-network-leads"] as const;
export const opsNetworkDetailKey = (leadId?: number | null) =>
  ["ops-network-detail", leadId] as const;
export const opsNetworkMessagesKey = (leadId?: number | null, limit = 20) =>
  ["ops-network-messages", leadId, limit] as const;

export function useOpsNetworkLeads(args: {
  cvOnly?: boolean;
  enabled?: boolean;
  limit?: number;
  move?: string | null;
  offset?: number;
  query?: string;
  role?: string | null;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(args.limit ?? 40));
  searchParams.set("offset", String(args.offset ?? 0));

  const query = args.query?.trim();
  if (query) {
    searchParams.set("query", query);
  }

  if (args.role) {
    searchParams.set("role", args.role);
  }

  if (args.move) {
    searchParams.set("move", args.move);
  }

  if (args.cvOnly) {
    searchParams.set("cvOnly", "true");
  }

  return useQuery({
    enabled: args.enabled ?? true,
    queryKey: [
      ...opsNetworkLeadsKey,
      args.limit ?? 40,
      args.offset ?? 0,
      query ?? "",
      args.role ?? "",
      args.move ?? "",
      args.cvOnly === true,
    ],
    queryFn: () =>
      fetchWithInternalAuth<NetworkLeadListResponse>(
        `/api/internal/network/leads?${searchParams.toString()}`
      ),
    placeholderData: (previousData) => previousData,
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

export function useOpsNetworkMessages(args: {
  enabled?: boolean;
  leadId?: number | null;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(args.limit ?? 20, 50));

  const infinite = useInfiniteQuery({
    queryKey: opsNetworkMessagesKey(args.leadId, limit),
    enabled:
      (args.enabled ?? true) &&
      typeof args.leadId === "number" &&
      args.leadId > 0,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => {
      const searchParams = new URLSearchParams({
        id: String(args.leadId),
        limit: String(limit),
      });

      if (pageParam) {
        searchParams.set("beforeMessageId", String(pageParam));
      }

      return fetchWithInternalAuth<NetworkLeadMessagesPageResponse>(
        `/api/internal/network/messages?${searchParams.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextBeforeMessageId ?? undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const messages = useMemo(
    () =>
      [...(infinite.data?.pages ?? [])]
        .reverse()
        .flatMap((page) => page.messages),
    [infinite.data?.pages]
  );

  return {
    ...infinite,
    messages,
    hasOlderMessages: Boolean(infinite.hasNextPage),
    loadOlderMessages: infinite.fetchNextPage,
    loadingOlderMessages: infinite.isFetchingNextPage,
  };
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

export function useCreateOpsNetworkNotification() {
  return useMutation({
    mutationFn: async (args: { id: number; message: string }) =>
      fetchWithInternalAuth<{ ok: boolean }>(
        "/api/internal/network/notification",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
        }
      ),
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
