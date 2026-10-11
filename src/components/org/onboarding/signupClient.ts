import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { SignupCompany, WorkspaceSignupState } from "@/lib/org/signup";
export function signupRequest<T = unknown>(
  workspaceId: string,
  action: string,
  values: Record<string, unknown> = {}
) {
  return fetchWithInternalAuth<T>("/api/org/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...values, workspaceId, action }),
  });
}
export function useSignupCompany(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["org", "signup-company", workspaceId],
    enabled,
    queryFn: () =>
      fetchWithInternalAuth<{
        state: WorkspaceSignupState;
        company: SignupCompany | null;
      }>(`/api/org/signup?workspaceId=${encodeURIComponent(workspaceId)}`),
    refetchInterval: (q) =>
      (q.state.data?.state.researchStatus === "pending" &&
        Date.now() - Date.parse(q.state.data.state.researchStartedAt || "") <
          120000) ||
      q.state.data?.state.researchStatus === "idle"
        ? 2000
        : false,
    retry: 1,
  });
}
