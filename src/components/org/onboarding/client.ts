import { fetchWithInternalAuth } from "@/lib/internalApiClient";

export function postOrgOnboarding<T>(
  workspaceId: string,
  body: Record<string, unknown>
) {
  return fetchWithInternalAuth<T>("/api/org/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, workspaceId }),
  });
}
