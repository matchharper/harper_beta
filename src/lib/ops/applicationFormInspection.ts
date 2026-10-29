import type { ApplicationForm } from "@/lib/career/simulation/applicationForm";
import type { ApplicationInspectionEvent } from "@/lib/career/simulation/applicationInspectionTrace";

export type InspectionUsage = {
  requests: number;
  unpricedRequests: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
  pricingSources: string[];
  searchRequests?: number;
  searchCostUsd?: number | null;
  unpricedSearchRequests?: number;
  contentRequests?: number;
  contentCostUsd?: number | null;
  unpricedContentRequests?: number;
};
export type InspectionRole = {
  id: string;
  name: string;
  company: string;
  homepage: string | null;
  location: string | null;
  originalUrl: string | null;
};
export type InspectionSource = Omit<InspectionRole, "id"> & {
  id: string | null;
  evidence?: string;
};
export type InspectionLinkSearch = {
  query: string;
  candidates: {
    id: number;
    title: string;
    url: string;
    highlights: string[];
  }[];
  selectedUrl: string | null;
  reason: string;
  durationMs: number;
  costUsd: number | null;
};
export type InspectionResolution = {
  role: InspectionSource;
  searches: InspectionLinkSearch[];
  attempts: { url: string; durationMs: number; form: ApplicationForm }[];
  savedUrl: string | null;
};
export type InspectionDebugResult = {
  runId: string;
  url: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  form: ApplicationForm;
  usage: InspectionUsage;
  resolution?: InspectionResolution;
};
export type InspectionStreamEvent =
  | { type: "started"; runId: string; startedAt: string; url: string }
  | { type: "log"; event: ApplicationInspectionEvent }
  | { type: "usage"; usage: InspectionUsage }
  | { type: "completed"; result: InspectionDebugResult }
  | { type: "error"; message: string };

/** NDJSON can split inside a UTF-8 character or between any two JSON bytes. */
export async function readInspectionStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: InspectionStreamEvent) => void
) {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let pending = "",
    completed = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as InspectionStreamEvent;
    if (event.type === "completed" || event.type === "error") completed = true;
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = pending.indexOf("\n")) >= 0) {
        consume(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
      if (done) {
        consume(pending);
        break;
      }
    }
    if (!completed)
      throw new Error(
        "연결이 종료되어 최종 결과를 받지 못했습니다. 아래 로그와 비용은 수신한 범위입니다."
      );
  } finally {
    reader.releaseLock();
  }
}
