import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { browserUseAgents, browserUseTerminal } from "./simulation/browserUseAgents";
import type { CareerBrowserServiceTier } from "./browserServiceTier";

export type BrowserUseDevEvent =
  | { type: "preview"; liveUrl: string }
  | { type: "result"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export async function runBrowserUseDev(
  task: string,
  signal: AbortSignal,
  send: (event: BrowserUseDevEvent) => void,
  serviceTier?: CareerBrowserServiceTier,
) {
  let run: { id: string; sessionId: string } | undefined;
  try {
    signal.throwIfAborted();
    run = await browserUseAgents.createRun(
      `Use the browser to carry out this lightweight preview task on public pages. Return a brief text answer. Do not sign in, submit forms, make purchases, or send messages.\n\n${task}`,
      { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
      undefined, undefined, { serviceTier }
    );
    let liveUrl: string | null = null;
    while (true) {
      signal.throwIfAborted();
      const previewRequest: Promise<string | null> = liveUrl
        ? Promise.resolve(null)
        : browserUseAgents.livePreview(run.sessionId);
      const [status, preview] = await Promise.all([
        browserUseAgents.status(run.id),
        previewRequest,
      ]);
      signal.throwIfAborted();
      if (preview) {
        liveUrl = preview;
        send({ type: "preview", liveUrl: preview });
      }
      if (browserUseTerminal(status.status)) break;
      await delay(3000, undefined, { signal });
    }
    const result = await browserUseAgents.result(run.id);
    if (result.status !== "completed")
      throw new Error(result.error || `Browser Use: ${result.status}`);
    const output = typeof result.output === "string" ? JSON.parse(result.output) : result.output;
    send({ type: "result", text: z.object({ text: z.string() }).parse(output).text });
  } catch (error) {
    send({ type: "error", message: signal.aborted
      ? "실행이 중단되었습니다."
      : error instanceof Error ? error.message : "Browser Use 실행에 실패했습니다." });
  } finally {
    if (run) {
      try {
        // Cleanup deliberately uses the transport's own signal after a disconnect.
        await browserUseAgents.stop({ runId: run.id, sessionId: run.sessionId }, false);
      } catch (error) {
        console.error("Browser Use dev cleanup failed", { runId: run.id, error });
        send({ type: "error", message: "테스트 브라우저 종료를 확인하지 못했습니다." });
      }
    }
    send({ type: "done" });
  }
}
