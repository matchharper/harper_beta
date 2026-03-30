import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { useAuthStore } from "@/store/useAuthStore";

type RevealResponse = {
  ok: boolean;
  alreadyRevealed: boolean;
  newBalance: number;
};

type BulkRevealResponse = {
  ok: boolean;
  totalCount: number;
  revealedCount: number;
  alreadyRevealedCount: number;
  newBalance: number;
};

function syncRevealQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  authUserId: string | undefined,
  newBalance: number
) {
  queryClient.setQueryData(
    ["credits", authUserId],
    (current: { remain_credit?: number; charged_credit?: number } | undefined) => {
      if (!current) return current;
      return {
        ...current,
        remain_credit: newBalance,
      };
    }
  );

  queryClient.invalidateQueries({ queryKey: ["candidate"] });
  queryClient.invalidateQueries({ queryKey: ["runPages"] });
  queryClient.invalidateQueries({ queryKey: ["connections"] });
  queryClient.invalidateQueries({ queryKey: ["automationResults"] });
}

export function useRevealCandidateProfile() {
  const queryClient = useQueryClient();
  const authUserId = useAuthStore((state) => state.user?.id);

  return useMutation({
    mutationFn: async (candidId: string) => {
      return fetchWithInternalAuth<RevealResponse>("/api/candidates/reveal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ candidId }),
      });
    },
    onSuccess: (result) => {
      syncRevealQueries(queryClient, authUserId, result.newBalance);
    },
  });
}

export function useRevealCandidateProfiles() {
  const queryClient = useQueryClient();
  const authUserId = useAuthStore((state) => state.user?.id);

  return useMutation({
    mutationFn: async (candidIds: string[]) => {
      const normalizedIds = Array.from(
        new Set(
          candidIds
            .map((candidId) => String(candidId ?? "").trim())
            .filter(Boolean)
        )
      );

      if (normalizedIds.length === 0) {
        throw new Error("열람할 프로필이 없습니다.");
      }

      return fetchWithInternalAuth<BulkRevealResponse>("/api/candidates/reveal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ candidIds: normalizedIds }),
      });
    },
    onSuccess: (result) => {
      syncRevealQueries(queryClient, authUserId, result.newBalance);
    },
  });
}
