import { timingSafeEqual } from "node:crypto";
import { handleCallback } from "@vercel/queue";
import {
  processCompanyAgentWebActionJob,
  WebActionQueuePermanentError,
  WebActionQueueRetryError,
} from "@/lib/org/agent/webActionProcessor.server";

export const runtime = "nodejs";
export const maxDuration = 1800;
const queueCallback = handleCallback(processCompanyAgentWebActionJob, {
  retry: (error, metadata) => {
    if (error instanceof WebActionQueuePermanentError) {
      console.error("[org-agent/web-action:permanent]", error);
      return { acknowledge: true };
    }
    if (error instanceof WebActionQueueRetryError) {
      return { afterSeconds: error.retryAfterSeconds };
    }
    return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
  },
  visibilityTimeoutSeconds: 1860,
});

export async function POST(request: Request) {
  if (process.env.HARPER_LOCAL_E2E !== "1") return queueCallback(request);
  const expected = Buffer.from(process.env.INTERNAL_WORKER_API_SECRET || "");
  const actual = Buffer.from((request.headers.get("authorization") || "").replace(/^Bearer /, ""));
  if (!expected.length || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await processCompanyAgentWebActionJob(await request.json(), { messageId: `local-e2e:${crypto.randomUUID()}` });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Local queue failed" }, { status: 503 });
  }
}
