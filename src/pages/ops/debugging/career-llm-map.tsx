import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import OpsShell from "@/components/ops/OpsShell";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { useAuthStore } from "@/store/useAuthStore";
import type { CareerLlmMapResponse } from "@/lib/ops/careerLlmMap/types";

export default function CareerLlmMapPage() {
  const canFetch = useCanFetchInternal();
  const userId = useAuthStore(state => state.user?.id);
  const client = useQueryClient();
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const queryKey = ["ops", "career-llm-map", userId] as const;
  const query = useQuery({
    queryKey,
    enabled: canFetch,
    queryFn: async ({signal}) => {
      const previous = client.getQueryData<CareerLlmMapResponse>(queryKey);
      const response = await fetchWithInternalAuth<CareerLlmMapResponse | {unchanged: true; revision: string}>(
        "/api/internal/debug/career-llm-map" + (previous ? "?revision=" + previous.revision : ""), {signal, cache: "no-store"}
      );
      if ("unchanged" in response) {
        if (!previous) throw new Error("Career LLM 지도를 다시 불러오세요.");
        return previous;
      }
      return response;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  // Synchronize the sandboxed HTML view without losing selection or scroll on refresh.
  useEffect(() => {
    if (!canFetch || !query.data) return;
    const send = () => frame.current?.contentWindow?.postMessage({type: "career-map:update", manifest: query.data.manifest}, "*");
    const ready = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === "career-map:ready") send();
    };
    window.addEventListener("message", ready);
    send();
    return () => window.removeEventListener("message", ready);
  }, [canFetch, query.data]);

  const content = <>
    {query.error ? <div role="alert" className="flex items-center gap-3 px-4 py-2 text-sm text-red-600">
      <span>{query.error.message}</span><button type="button" onClick={() => void query.refetch()}>다시 불러오기</button>
    </div> : null}
    {canFetch && query.data ? <iframe
      key={userId}
      ref={frame}
      title="Career LLM 입력 지도"
      srcDoc={query.data.document}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      allow="fullscreen"
      className={router.query.fullscreen === "1" ? "h-dvh w-full border-0" : "h-[calc(100dvh-140px)] min-h-[680px] w-full border-0"}
    /> : <div className="p-4 text-sm" role="status">불러오는 중…</div>}
  </>;
  return router.query.fullscreen === "1" && canFetch ? content : <OpsShell compactHeader fullWidth>{content}</OpsShell>;
}
