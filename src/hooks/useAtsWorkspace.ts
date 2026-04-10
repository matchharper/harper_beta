import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  AtsCandidateDetailResponse,
  AtsContactEmailDraft,
  AtsContactHistoryChannel,
  AtsEmailDiscoveryTraceItem,
  AtsOutreachRecord,
  AtsSequenceMarkStatus,
  AtsSequenceStepSchedule,
  AtsWorkspaceRecord,
  AtsWorkspaceResponse,
} from "@/lib/ats/shared";
import { createDefaultAtsSequenceSchedule } from "@/lib/ats/shared";

export const atsWorkspaceKey = ["ats-workspace"] as const;
export const atsCandidateDetailKey = (candidId?: string | null) =>
  ["ats-candidate-detail", candidId] as const;

const ATS_IDLE_POLL_INTERVAL_MS = 30_000;
const ATS_SEARCHING_POLL_INTERVAL_MS = 2_000;

function hasSearchingCandidate(data: AtsWorkspaceResponse | undefined) {
  return Boolean(
    data?.candidates.some(
      (candidate) => candidate.outreach?.emailDiscoveryStatus === "searching"
    )
  );
}

function isCandidateDetailSearching(
  data: AtsCandidateDetailResponse | undefined
) {
  return data?.candidate.outreach?.emailDiscoveryStatus === "searching";
}

function createOptimisticEmailDiscoveryTrace(): AtsEmailDiscoveryTraceItem {
  return {
    at: new Date().toISOString(),
    content: "탐색 요청을 전송했습니다. 로그를 불러오는 중입니다.",
    kind: "decision",
    meta: {
      optimistic: true,
    },
  };
}

function applyOptimisticEmailDiscoveryState(
  outreach: AtsOutreachRecord | null | undefined,
  candidId: string
): AtsOutreachRecord {
  const optimisticTrace = createOptimisticEmailDiscoveryTrace();
  const currentTrace = outreach?.emailDiscoveryTrace ?? [];
  const hasOptimisticTrace = currentTrace.some(
    (item) => item.meta?.optimistic === true
  );

  return {
    activeStep: outreach?.activeStep ?? 0,
    candidId: outreach?.candidId ?? candidId,
    createdAt: outreach?.createdAt ?? optimisticTrace.at,
    emailRecipientName: outreach?.emailRecipientName ?? null,
    emailDiscoveryEvidence: outreach?.emailDiscoveryEvidence ?? [],
    emailDiscoveryStatus: "searching",
    emailDiscoverySummary:
      "공개 이메일 탐색을 시작했습니다. 로그를 갱신하는 중입니다.",
    emailDiscoveryTrace: hasOptimisticTrace
      ? currentTrace
      : [...currentTrace, optimisticTrace],
    emailSourceLabel: outreach?.emailSourceLabel ?? null,
    emailSourceType: outreach?.emailSourceType ?? null,
    emailSourceUrl: outreach?.emailSourceUrl ?? null,
    history: outreach?.history ?? [],
    id: outreach?.id ?? 0,
    lastSentAt: outreach?.lastSentAt ?? null,
    memo: outreach?.memo ?? null,
    nextDueAt: outreach?.nextDueAt ?? null,
    sequenceMark: outreach?.sequenceMark ?? null,
    sequenceSchedule:
      outreach?.sequenceSchedule ?? createDefaultAtsSequenceSchedule(),
    sequenceStatus: outreach?.sequenceStatus ?? "draft",
    stoppedAt: outreach?.stoppedAt ?? null,
    targetEmail: outreach?.targetEmail ?? null,
    updatedAt: optimisticTrace.at,
    userId: outreach?.userId ?? "",
  };
}

export function useAtsWorkspace(enabled = true) {
  return useQuery({
    queryKey: atsWorkspaceKey,
    queryFn: () =>
      fetchWithInternalAuth<AtsWorkspaceResponse>(
        "/api/internal/ats/workspace"
      ),
    enabled,
    refetchInterval: enabled
      ? (query) =>
          hasSearchingCandidate(
            query.state.data as AtsWorkspaceResponse | undefined
          )
            ? ATS_SEARCHING_POLL_INTERVAL_MS
            : ATS_IDLE_POLL_INTERVAL_MS
      : false,
    refetchIntervalInBackground: false,
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
    refetchInterval:
      enabled && Boolean(candidId)
        ? (query) =>
            isCandidateDetailSearching(
              query.state.data as AtsCandidateDetailResponse | undefined
            )
              ? ATS_SEARCHING_POLL_INTERVAL_MS
              : ATS_IDLE_POLL_INTERVAL_MS
        : false,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });
}

export function useSaveAtsWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: Partial<AtsWorkspaceRecord>) =>
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
    onSuccess: async (response) => {
      queryClient.setQueryData<AtsWorkspaceResponse | undefined>(
        atsWorkspaceKey,
        (current) =>
          current
            ? {
                ...current,
                workspace: response.workspace,
              }
            : current
      );
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
    onMutate: async (candidId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: atsWorkspaceKey }),
        queryClient.cancelQueries({
          queryKey: atsCandidateDetailKey(candidId),
        }),
      ]);

      const previousWorkspace =
        queryClient.getQueryData<AtsWorkspaceResponse>(atsWorkspaceKey);
      const previousDetail =
        queryClient.getQueryData<AtsCandidateDetailResponse>(
          atsCandidateDetailKey(candidId)
        );

      queryClient.setQueryData<AtsWorkspaceResponse | undefined>(
        atsWorkspaceKey,
        (current) => {
          if (!current) return current;
          return {
            ...current,
            candidates: current.candidates.map((candidate) =>
              candidate.id === candidId
                ? {
                    ...candidate,
                    outreach: applyOptimisticEmailDiscoveryState(
                      candidate.outreach,
                      candidId
                    ),
                  }
                : candidate
            ),
          };
        }
      );

      queryClient.setQueryData<AtsCandidateDetailResponse | undefined>(
        atsCandidateDetailKey(candidId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            candidate: {
              ...current.candidate,
              outreach: applyOptimisticEmailDiscoveryState(
                current.candidate.outreach,
                candidId
              ),
            },
          };
        }
      );

      void queryClient.invalidateQueries({
        queryKey: atsWorkspaceKey,
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: atsCandidateDetailKey(candidId),
        refetchType: "active",
      });

      return {
        previousDetail,
        previousWorkspace,
      };
    },
    onError: async (_error, candidId, context) => {
      if (context?.previousWorkspace) {
        queryClient.setQueryData(atsWorkspaceKey, context.previousWorkspace);
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(
          atsCandidateDetailKey(candidId),
          context.previousDetail
        );
      }
    },
    onSettled: async (_, __, candidId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: atsWorkspaceKey }),
        queryClient.invalidateQueries({
          queryKey: atsCandidateDetailKey(candidId),
        }),
      ]);
    },
  });
}

export function useCancelAtsEmailDiscovery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (candidId: string) =>
      fetchWithInternalAuth<{ ok: boolean; outreach: AtsOutreachRecord }>(
        "/api/internal/ats/email",
        {
          method: "DELETE",
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

export function useSaveAtsCandidateMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { candidId: string; memo: string }) =>
      fetchWithInternalAuth<{ ok: boolean; outreach: AtsOutreachRecord }>(
        "/api/internal/ats/candidate",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "memo",
            candidId: args.candidId,
            memo: args.memo,
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

export function useSaveAtsEmailRecipientName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { candidId: string; emailRecipientName: string }) =>
      fetchWithInternalAuth<{ ok: boolean; outreach: AtsOutreachRecord }>(
        "/api/internal/ats/candidate",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "email_recipient_name",
            candidId: args.candidId,
            emailRecipientName: args.emailRecipientName,
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

export function useSaveAtsSequenceSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      candidId: string;
      sequenceSchedule: AtsSequenceStepSchedule[];
    }) =>
      fetchWithInternalAuth<{ ok: boolean; outreach: AtsOutreachRecord }>(
        "/api/internal/ats/candidate",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "schedule",
            candidId: args.candidId,
            sequenceSchedule: args.sequenceSchedule,
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

export function useAddAtsContactHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      candidId: string;
      channel: AtsContactHistoryChannel;
      contactedAt: string;
      note?: string | null;
    }) =>
      fetchWithInternalAuth<{ ok: boolean; outreach: AtsOutreachRecord }>(
        "/api/internal/ats/candidate",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "add_history",
            candidId: args.candidId,
            channel: args.channel,
            contactedAt: args.contactedAt,
            note: args.note ?? null,
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

export function useDeleteAtsContactHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { candidId: string; historyId: string }) =>
      fetchWithInternalAuth<{ ok: boolean; outreach: AtsOutreachRecord }>(
        "/api/internal/ats/candidate",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "delete_history",
            candidId: args.candidId,
            historyId: args.historyId,
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

export function useClearAtsEmailDiscoveryTrace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (candidId: string) =>
      fetchWithInternalAuth<{ ok: boolean; outreach: AtsOutreachRecord }>(
        "/api/internal/ats/candidate",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "clear_email_trace",
            candidId,
          }),
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

export function useResetAtsCandidateOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (candidId: string) =>
      fetchWithInternalAuth<{ ok: boolean; outreach: AtsOutreachRecord }>(
        "/api/internal/ats/candidate",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "reset_outreach",
            candidId,
          }),
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

export function useGenerateAtsContactEmail() {
  return useMutation({
    mutationFn: (candidId: string) =>
      fetchWithInternalAuth<{ ok: boolean; draft: AtsContactEmailDraft }>(
        "/api/internal/ats/candidate",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "generate_contact_email",
            candidId,
          }),
        }
      ),
  });
}

export function useSendAtsContactEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      body: string;
      candidId: string;
      subject: string;
      targetEmail: string;
    }) =>
      fetchWithInternalAuth<{ ok: boolean; data: AtsCandidateDetailResponse }>(
        "/api/internal/ats/candidate",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "send_contact_email",
            body: args.body,
            candidId: args.candidId,
            subject: args.subject,
            targetEmail: args.targetEmail,
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

export function useScheduleAtsContactEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      body: string;
      candidId: string;
      scheduledAt: string;
      subject: string;
      targetEmail: string;
    }) =>
      fetchWithInternalAuth<{ ok: boolean; data: AtsCandidateDetailResponse }>(
        "/api/internal/ats/candidate",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "schedule_contact_email",
            body: args.body,
            candidId: args.candidId,
            scheduledAt: args.scheduledAt,
            subject: args.subject,
            targetEmail: args.targetEmail,
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

export function useCancelAtsScheduledContactEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { candidId: string; messageId: number }) =>
      fetchWithInternalAuth<{ ok: boolean; data: AtsCandidateDetailResponse }>(
        "/api/internal/ats/candidate",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "cancel_scheduled_contact_email",
            candidId: args.candidId,
            messageId: args.messageId,
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

export function useSaveAtsSequenceDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      body: string;
      candidId: string;
      stepNumber: number;
      subject: string;
    }) =>
      fetchWithInternalAuth<{ ok: boolean; data: AtsCandidateDetailResponse }>(
        "/api/internal/ats/sequence",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "update_draft",
            body: args.body,
            candidId: args.candidId,
            stepNumber: args.stepNumber,
            subject: args.subject,
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
