import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { reconcileOrgCandidateSave } from "@/lib/org/mutationCache";

export function useOrgCandidateSave() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      workspaceId: string;
      roleId: string;
      talentId: string;
      recommendationId: string;
      saved: boolean;
    }) =>
      fetchWithInternalAuth<{ ok: true; savedAt: string | null }>(
        "/api/org/candidate-save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      ),
    onSuccess: (result, input) =>
      reconcileOrgCandidateSave(client, input, result.savedAt),
  });
}
