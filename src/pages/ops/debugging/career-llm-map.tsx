import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import OpsShell from "@/components/ops/OpsShell";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { useAuthStore } from "@/store/useAuthStore";
import type { CareerLlmMapExample, CareerLlmMapResponse } from "@/lib/ops/careerLlmMap/types";

const EXAMPLE_EMAIL_KEY = "ops.career-llm-map.example-email";

function readStoredExampleEmail() {
  try {
    return window.localStorage.getItem(EXAMPLE_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function CareerLlmMapPage() {
  const canFetch = useCanFetchInternal();
  const userId = useAuthStore(state => state.user?.id);
  const client = useQueryClient();
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  // Not rendered by this page, so reading storage at first render cannot mismatch hydration.
  const [exampleEmail, setExampleEmail] = useState(() => typeof window === "undefined" ? "" : readStoredExampleEmail());
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
  // A real talent's current chat input, rebuilt read-only for the data-block modals.
  const example = useQuery({
    queryKey: ["ops", "career-llm-map", "example", userId, exampleEmail] as const,
    enabled: canFetch && Boolean(exampleEmail),
    queryFn: ({signal}) => fetchWithInternalAuth<CareerLlmMapExample>(
      "/api/internal/debug/career-llm-map/example?email=" + encodeURIComponent(exampleEmail), {signal, cache: "no-store"}
    ),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const exampleState = !exampleEmail ? {email: "", status: "idle" as const}
    : example.data ? {email: exampleEmail, status: "ready" as const, data: example.data}
    : example.error ? {email: exampleEmail, status: "error" as const, error: example.error.message}
    : {email: exampleEmail, status: "loading" as const};
  const exampleMessage = JSON.stringify(exampleState);

  const latest = useRef({manifest: query.data?.manifest, exampleMessage, exampleEmail, refetchExample: example.refetch});
  useEffect(() => {
    latest.current = {manifest: query.data?.manifest, exampleMessage, exampleEmail, refetchExample: example.refetch};
  });
  const post = (message: unknown) => frame.current?.contentWindow?.postMessage(message, "*");
  const postExample = () => post({type: "career-map:example", example: JSON.parse(latest.current.exampleMessage)});

  // Synchronize the sandboxed HTML view without losing selection or scroll on refresh.
  useEffect(() => {
    if (!canFetch || !query.data) return;
    post({type: "career-map:update", manifest: query.data.manifest});
    postExample();
  }, [canFetch, query.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // A changed example only refreshes the open modal's example section.
  useEffect(() => postExample(), [exampleMessage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const {manifest, exampleEmail: currentEmail, refetchExample} = latest.current;
      if (event.data?.type === "career-map:ready" && manifest) {
        post({type: "career-map:update", manifest});
        postExample();
      }
      if (event.data?.type === "career-map:example-request" && typeof event.data.email === "string") {
        const email = event.data.email.trim().toLowerCase();
        try { window.localStorage.setItem(EXAMPLE_EMAIL_KEY, email); } catch {}
        if (email && email === currentEmail) void refetchExample();
        else setExampleEmail(email);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
