import { useCallback, useState } from "react";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";

export async function gtmCall<T>(action: string, data: Record<string, unknown> = {}) {
  return fetchWithInternalAuth<T>("/api/internal/gtm-plays", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
  });
}

/** One request at a time per caller: loading flag, last error, last result. */
export function useGtmAction<T>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const run = useCallback(async (action: string, data: Record<string, unknown> = {}) => {
    setLoading(true);
    setError(null);
    try {
      const next = await gtmCall<T>(action, data);
      setResult(next);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했어요.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
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
