import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  AtsCandidateDetailResponse,
  AtsOutreachRecord,
  AtsSequenceMarkStatus,
  AtsWorkspaceRecord,
  AtsWorkspaceResponse,
} from "@/lib/ats/shared";

export const atsWorkspaceKey = ["ats-workspace"] as const;
export const atsCandidateDetailKey = (candidId?: string | null) =>
  ["ats-candidate-detail", candidId] as const;

export function useAtsWorkspace(enabled = true) {
  return useQuery({
    queryKey: atsWorkspaceKey,
    queryFn: () =>
      fetchWithInternalAuth<AtsWorkspaceResponse>("/api/internal/ats/workspace"),
    enabled,
    staleTime: 15_000,
  });
}

export function useAtsCandidateDetail(
  candidId?: string | null,
  enabled = true
) {
  return useQuery({
    queryKey: atsCandidateDetailKey(candidId),
    queryFn: () =>
      fetchWithInternalAuth<AtsCandidateDetailResponse>(
        `/api/internal/ats/candidate?candidId=${encodeURIComponent(
          String(candidId ?? "")
        )}`
      ),
    enabled: enabled && Boolean(candidId),
    staleTime: 15_000,
  });
}

export function useSaveAtsWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: AtsWorkspaceRecord) =>
      fetchWithInternalAuth<{ ok: boolean; workspace: AtsWorkspaceRecord }>(
        "/api/internal/ats/workspace",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: atsWorkspaceKey });
    },
  });
}

export function useDiscoverAtsEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (candidId: string) =>
      fetchWithInternalAuth<{ ok: boolean; outreach: AtsOutreachRecord }>(
        "/api/internal/ats/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ candidId }),
        }
      ),
    onSuccess: async (_, candidId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: atsWorkspaceKey }),
        queryClient.invalidateQueries({
          queryKey: atsCandidateDetailKey(candidId),
        }),
      ]);
    },
  });
}

export function useSaveAtsEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { candidId: string; targetEmail: string }) =>
      fetchWithInternalAuth<{ ok: boolean; outreach: AtsOutreachRecord }>(
        "/api/internal/ats/email",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            candidId: args.candidId,
            email: args.targetEmail,
          }),
        }
      ),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: atsWorkspaceKey }),
        queryClient.invalidateQueries({
          queryKey: atsCandidateDetailKey(variables.candidId),
        }),
      ]);
    },
  });
}

export function useSetManualAtsEmail() {
  const mutation = useSaveAtsEmail();

  return {
    ...mutation,
    mutateAsync: (args: { candidId: string; email: string }) =>
      mutation.mutateAsync({
        candidId: args.candidId,
        targetEmail: args.email,
      }),
  };
}

export function useSetAtsSequenceMark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      candidId: string;
      status: AtsSequenceMarkStatus | null;
    }) =>
      fetchWithInternalAuth<{ ok: boolean; outreach: AtsOutreachRecord }>(
        "/api/internal/ats/mark",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            candidId: args.candidId,
            sequenceMark: args.status,
          }),
        }
      ),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: atsWorkspaceKey }),
        queryClient.invalidateQueries({
          queryKey: atsCandidateDetailKey(variables.candidId),
        }),
      ]);
    },
  });
}

export function useGenerateAtsSequence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (candidId: string) =>
      fetchWithInternalAuth<{ ok: boolean; data: AtsCandidateDetailResponse }>(
        "/api/internal/ats/sequence",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ candidId }),
        }
      ),
    onSuccess: async (_, candidId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: atsWorkspaceKey }),
        queryClient.invalidateQueries({
          queryKey: atsCandidateDetailKey(candidId),
        }),
      ]);
    },
  });
}

export function useSendAtsSequenceStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { candidId: string; stepNumber: number }) =>
      fetchWithInternalAuth<{ ok: boolean; data: AtsCandidateDetailResponse }>(
        "/api/internal/ats/sequence",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "send",
            candidId: args.candidId,
            stepNumber: args.stepNumber,
          }),
        }
      ),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: atsWorkspaceKey }),
        queryClient.invalidateQueries({
          queryKey: atsCandidateDetailKey(variables.candidId),
        }),
      ]);
    },
  });
}

export function useToggleAtsSequencePause() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { candidId: string; paused: boolean }) =>
      fetchWithInternalAuth<{ ok: boolean; outreach: AtsOutreachRecord }>(
        "/api/internal/ats/sequence",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: args.paused ? "pause" : "resume",
            candidId: args.candidId,
          }),
        }
      ),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: atsWorkspaceKey }),
        queryClient.invalidateQueries({
          queryKey: atsCandidateDetailKey(variables.candidId),
        }),
      ]);
    },
  });
}

export function useUpdateAtsSequenceStatus() {
  const mutation = useToggleAtsSequencePause();

  return {
    ...mutation,
    mutateAsync: (args: { action: "pause" | "resume"; candidId: string }) =>
      mutation.mutateAsync({
        candidId: args.candidId,
        paused: args.action === "pause",
      }),
  };
}

export function useBulkSendAtsMessages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      body: string;
      candidIds: string[];
      senderEmail?: string;
      subject: string;
    }) =>
      fetchWithInternalAuth<{
        ok: boolean;
        sent: string[];
        skipped: Array<{ candidId: string; reason: string }>;
      }>("/api/internal/ats/bulk-mail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: atsWorkspaceKey }),
        ...variables.candidIds.map((candidId) =>
          queryClient.invalidateQueries({
            queryKey: atsCandidateDetailKey(candidId),
          })
        ),
      ]);
    },
  });
}

export function useSendAtsBulkMail() {
  return useBulkSendAtsMessages();
}
