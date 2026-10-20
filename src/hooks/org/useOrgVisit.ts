import { useEffect } from "react";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
const pending = new Set<string>();
export function useOrgVisit(workspaceId?: string, userId?: string) {
  useEffect(() => {
    if (!workspaceId || !userId) return;
    const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const key = `org-visit:v1:${userId}:${workspaceId}:${day}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* Storage may be disabled. */
    }
    if (pending.has(key)) return;
    pending.add(key);
    void fetchWithInternalAuth("/api/org/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    })
      .then(() => {
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          /* Nonessential telemetry. */
        }
      })
      .catch(() => {
        /* A failed analytics write must not interrupt the workspace. */
      })
      .finally(() => pending.delete(key));
  }, [workspaceId, userId]);
}
