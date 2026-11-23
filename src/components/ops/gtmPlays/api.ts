import { useCallback, useState } from "react";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { latestRequests } from "./latestRequest";

export async function gtmCall<T>(action: string, data: Record<string, unknown> = {}) {
  return fetchWithInternalAuth<T>("/api/internal/gtm-plays", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
  });
}

/**
 * One caller's requests: loading flag, last error, last result. The newest request wins (latestRequest.ts): an
 * earlier answer that comes late is dropped (its run resolves to null) and does not end the newer one's loading.
 */
export function useGtmAction<T>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const [runLatest] = useState(latestRequests);
  const run = useCallback((action: string, data: Record<string, unknown> = {}) => runLatest(() => gtmCall<T>(action, data), {
    start: () => { setLoading(true); setError(null); },
    result: setResult,
    error: (caught) => setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했어요."),
    done: () => setLoading(false),
  }), [runLatest]);
  return { loading, error, result, setResult, setError, run };
}

export function formatKst(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}
