import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";
import { isOrgQueryAccessError } from "@/lib/org/queryError";
import type { ExternalCandidatesResponse } from "@/lib/org/agent/externalSourcing";

const SEARCHING = new Set(["queued", "running"]);

export function isExternalSearchRunning(data: ExternalCandidatesResponse | undefined) {
  return Boolean(data?.search && SEARCHING.has(data.search.status));
}

/** People outside Harper shown for one Role; polls only while a search for it is running. */
export function useOrgExternalCandidates(args: { workspaceId?: string | null; roleId?: string | null }) {
  const workspaceId = args.workspaceId?.trim() ?? "";
  const roleId = args.roleId?.trim() ?? "";
  return useQuery({
    queryKey: queryKeys.org.externalCandidates(workspaceId, roleId),
    queryFn: () =>
      fetchWithInternalAuth<ExternalCandidatesResponse>(
        `/api/org/external-candidates?${new URLSearchParams({ workspaceId, roleId })}`
      ),
    enabled: Boolean(workspaceId && roleId),
    staleTime: 60_000,
    refetchInterval: (query) =>
      !isOrgQueryAccessError(query.state.error) && isExternalSearchRunning(query.state.data) ? 15_000 : false,
  });
}

/** Pass and Request intro for one person outside Harper; the list refreshes after each. */
export function useOrgExternalCandidateActions(args: { workspaceId?: string | null; roleId?: string | null }) {
  const queryClient = useQueryClient();
  const workspaceId = args.workspaceId?.trim() ?? "";
  const roleId = args.roleId?.trim() ?? "";
  const key = queryKeys.org.externalCandidates(workspaceId, roleId);
  const post = (path: string, payload: Record<string, unknown>) =>
    fetchWithInternalAuth<{ ok: true; status: string }>(`/api/org/external-candidates/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, roleId, ...payload }),
    });
  const pass = useMutation({
    mutationFn: (input: { candidateId: string; reason: string }) => post("pass", input),
    onSuccess: (_result, input) => {
      queryClient.setQueryData<ExternalCandidatesResponse>(key, (current) => current
        ? { ...current, candidates: current.candidates.filter((person) => person.id !== input.candidateId) }
        : current);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const requestIntro = useMutation({
    mutationFn: (input: { candidateId: string; companyAppeal: string; introRecipientEmails: string[] }) => post("intro", input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  return { pass, requestIntro };
}
