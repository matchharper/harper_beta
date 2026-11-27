import { createHash } from "node:crypto";
import { after } from "next/server";
import { browserUseAgents, type SessionPageCapture } from "@/lib/career/simulation/browserUseAgents";
import { TALENT_RESUME_BUCKET } from "@/lib/talentOnboarding/models";
import { readOperation, updateOperation, type ExternalOperation, type ExternalToolContext } from "../externalOperations/store";
import { browserRunSubmission } from "./submissionReceipt";

type Context = Pick<ExternalToolContext, "admin" | "userId">;
type PageCapture = Extract<SessionPageCapture, { status: "captured" }>;

/** What a finished run keeps of the page it ended on (provider_refs.receipt_screenshot): the stored picture, or why there is none. */
export type ReceiptScreenshot =
  | { path: string; sha256: string; bytes: number; page_url: string; captured_at: string }
  | {
      status: "unavailable";
      reason: Extract<SessionPageCapture, { status: "unavailable" }>["reason"] | "no_browser_session" | "upload_failed";
    };

const inFlight = new Map<string, Promise<void>>();

/** An approved submission's run whose own receipt says the site received the application, or may have. */
function showsSubmission(run: ExternalOperation) {
  return run.kind === "browser_run" && run.request.mode === "execute"
    && ["yes", "unclear"].includes(browserRunSubmission(run.result) ?? "")
    && run.provider_refs.receipt_screenshot === undefined;
}

/**
 * Keeps a picture of the page a finished execute run ended on when its receipt says the application went through or
 * may have, so the person can see what the company's site showed. It starts at once, while the browser still shows
 * that page. Nothing waits for it; keepAlive (after() in a request) lets it finish after the response. It never throws
 * and never changes the receipt: what it found is recorded beside it, on provider_refs.receipt_screenshot.
 */
export function keepReceiptScreenshot(
  context: Context,
  run: ExternalOperation,
  keepAlive: (work: Promise<void>) => void = after
) {
  if (!showsSubmission(run) || inFlight.has(run.id)) return;
  const work = captureAndRecord(context, run)
    .catch((error) => console.warn("[CareerBrowser] Receipt screenshot was not recorded", {
      executionId: run.id, error: error instanceof Error ? error.message : String(error),
    }))
    .finally(() => inFlight.delete(run.id));
  inFlight.set(run.id, work);
  try {
    keepAlive(work);
  } catch {
    // Outside a request (a script or a test) there is no response to outlive; the work runs on by itself.
  }
}

/** Settles once this run's picture, if this server is taking one, is recorded or given up. */
export function receiptScreenshotSettled(executionId: string) {
  return inFlight.get(executionId) ?? Promise.resolve();
}

async function captureAndRecord(context: Context, run: ExternalOperation) {
  const sessionId = typeof run.provider_refs.session_id === "string" ? run.provider_refs.session_id : "";
  const pageUrl = typeof run.result.url === "string" ? run.result.url.trim() : "";
  const capture = sessionId ? await browserUseAgents.captureSessionPage(sessionId, pageUrl || undefined) : null;
  const screenshot: ReceiptScreenshot = !capture
    ? { status: "unavailable", reason: "no_browser_session" }
    : capture.status === "captured"
      ? await storeScreenshot(context, run, capture)
      : { status: "unavailable", reason: capture.reason };
  await recordOnRun(context, run, screenshot);
}

/** At the top of the person's folder, where deleting the account finds it. A stored picture is never replaced. */
async function storeScreenshot(context: Context, run: ExternalOperation, capture: PageCapture): Promise<ReceiptScreenshot> {
  const path = `${context.userId}/browser-receipt-${run.id}.jpg`;
  let failure: unknown = null;
  try {
    ({ error: failure } = await context.admin.storage.from(TALENT_RESUME_BUCKET)
      .upload(path, capture.jpeg, { contentType: "image/jpeg", upsert: false }));
  } catch (error) {
    failure = error ?? new Error("Storage upload threw");
  }
  if (failure) {
    console.warn("[CareerBrowser] Receipt screenshot upload failed", {
      executionId: run.id, error: failure instanceof Error ? failure.message : String(failure),
    });
    return { status: "unavailable", reason: "upload_failed" };
  }
  return {
    path,
    sha256: createHash("sha256").update(capture.jpeg).digest("hex"),
    bytes: capture.jpeg.length,
    page_url: capture.pageUrl,
    captured_at: capture.capturedAt,
  };
}

/** Adds the record beside the receipt. A run another writer changed meanwhile is read again, up to three tries. */
async function recordOnRun(context: Context, run: ExternalOperation, screenshot: ReceiptScreenshot) {
  let current: ExternalOperation | null = run;
  for (let attempt = 1; current && current.provider_refs.receipt_screenshot === undefined; attempt++) {
    try {
      await updateOperation(context, current, {
        provider_refs: { ...current.provider_refs, receipt_screenshot: screenshot },
      });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      current = await readOperation(context, run.id);
    }
  }
}
