import { useEffect, useMemo, useRef, useState } from "react";

type LinkPreview = {
  title: string | null;
  description: string | null;
  publishedAt: string | null;
};

const EMPTY: LinkPreview = {
  title: null,
  description: null,
  publishedAt: null,
};

export function useLinkTitlePreview(url: string, debounceMs: number = 700) {
  const normalizedUrl = useMemo(() => url?.trim() ?? "", [url]);

  const [data, setData] = useState<LinkPreview>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-hook cache (URL -> preview)
  const cacheRef = useRef<Map<string, LinkPreview>>(new Map());
  // Track latest request to avoid late responses overwriting state
  const reqSeqRef = useRef(0);

  useEffect(() => {
    if (!normalizedUrl) {
      setData(EMPTY);
      setError(null);
      setLoading(false);
      return;
    }

    // Cache hit
    const cached = cacheRef.current.get(normalizedUrl);
    if (cached) {
      setData(cached);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const seq = ++reqSeqRef.current;

    const timerId = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/linkpreview?url=${encodeURIComponent(normalizedUrl)}`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          }
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();

        const preview: LinkPreview = {
          title: json?.title ?? null,
          description: json?.description ?? null,
          publishedAt: json?.published_at ?? null,
        };

        // If a newer request started, ignore this response
        if (reqSeqRef.current !== seq) return;

        cacheRef.current.set(normalizedUrl, preview);
        setData(preview);
      } catch (e: any) {
        if (controller.signal.aborted) return;
        // If a newer request started, ignore this error
        if (reqSeqRef.current !== seq) return;

        setError(e?.message ?? "Failed to fetch preview");
        setData(EMPTY);
      } finally {
        if (reqSeqRef.current === seq) setLoading(false);
      }
    }, debounceMs);

    return () => {
      window.clearTimeout(timerId);
      controller.abort();
    };
  }, [normalizedUrl, debounceMs]);

  return {
    ...data,
    loading,
    error,
    // optional: expose cache controls if you want
    // clearCache: () => cacheRef.current.clear(),
  };
}
