import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";

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
      fetchWithInternalAuth<{ ok: true }>("/api/org/candidate-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.org.boardAll }),
  });
}
