import { fetchWithInternalAuth } from "@/lib/internalApiClient";
export function gtmRequest<T>(
  action: string,
  data: Record<string, unknown> = {},
  signal?: AbortSignal
): Promise<T> {
  return fetchWithInternalAuth<T>("/api/internal/gtm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
    signal,
  });
}
