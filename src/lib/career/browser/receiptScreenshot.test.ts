import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { keepReceiptScreenshot, receiptScreenshotSettled } from "./receiptScreenshot";
import { refreshBrowserExecution } from "./tool";
import { browserUseAgents, type SessionPageCapture } from "../simulation/browserUseAgents";
import { TALENT_RESUME_BUCKET } from "@/lib/talentOnboarding/models";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { ExternalOperation } from "../externalOperations/store";

const userId = "00000000-0000-4000-8000-000000000001",
  executionId = "00000000-0000-4000-8000-000000000004",
  remoteSession = "00000000-0000-4000-8000-000000000005",
  remoteRun = "00000000-0000-4000-8000-000000000006";
const completePage = "https://company-a.example/apply/complete";
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const storedPath = `${userId}/browser-receipt-${executionId}.jpg`;
const captured: SessionPageCapture = { status: "captured", jpeg, pageUrl: completePage, capturedAt: "2026-11-27T00:01:02.000Z" };
const receipt = (submitted?: string) => ({
  summary: "Company A's application form was sent.", evidence: ["A thank-you page was shown"], needsUser: false, url: completePage,
  ...(submitted === undefined ? {} : { submitted }),
});

function finishedRun(mode: string, submitted?: string, changes: Partial<ExternalOperation> = {}): ExternalOperation {
  return {
    id: executionId, user_id: userId, conversation_id: null, parent_id: null, kind: "browser_run",
    idempotency_key: "fixture", status: "completed", revision: 2, request: { mode }, result: receipt(submitted),
    provider_refs: { run_id: remoteRun, session_id: remoteSession },
    created_at: "2026-11-27T00:00:00Z", updated_at: "2026-11-27T00:01:00Z",
    ...changes,
  };
}

/** A fake service client over these rows (operation reads and revision-checked updates) and its private bucket. */
function fakeAdmin(rows: ExternalOperation[], upload: () => Promise<{ error: unknown }> = async () => ({ error: null })) {
  const uploads: { bucket: string; path: string; bytes: Buffer; options: unknown }[] = [];
  const admin = {
    from: (table: string) => {
      assert.equal(table, "talent_external_operations");
      const filters: Record<string, unknown> = {};
      let changes: Record<string, unknown> | undefined;
      const chain = {
        select: () => chain,
        update: (value: Record<string, unknown>) => { changes = value; return chain; },
        eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
        maybeSingle: async () => {
          const row = rows.find((candidate) =>
            Object.entries(filters).every(([key, value]) => candidate[key as keyof ExternalOperation] === value));
          if (row && changes) Object.assign(row, structuredClone(changes));
          return { data: row ? structuredClone(row) : null, error: null };
        },
      };
      return chain;
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Buffer, options: unknown) => {
          uploads.push({ bucket, path, bytes, options });
          return upload();
        },
      }),
    },
  };
  return { uploads, context: { admin: admin as unknown as TalentAdminClient, userId } };
}

/** Starts a picture with a keepAlive that hands back the work it was given. */
function start(context: ReturnType<typeof fakeAdmin>["context"], run: ExternalOperation) {
  const kept: Promise<void>[] = [];
  keepReceiptScreenshot(context, run, (work) => { kept.push(work); });
  return kept;
}

test("a submitted run's completion page is stored at the top of the person's folder and recorded beside the unchanged receipt", async (t) => {
  const run = finishedRun("execute", "yes");
  const rows = [structuredClone(run)];
  const { uploads, context } = fakeAdmin(rows);
  const capture = t.mock.method(browserUseAgents, "captureSessionPage", async () => captured);
  const kept = start(context, run);
  assert.equal(kept.length, 1);
  await kept[0];
  assert.deepEqual(capture.mock.calls.map((call) => call.arguments), [[remoteSession, completePage]]);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].bucket, TALENT_RESUME_BUCKET);
  // Directly in the person's folder: deleting the account removes the files listed at that level.
  assert.equal(uploads[0].path, storedPath);
  assert.deepEqual(uploads[0].bytes, jpeg);
  assert.deepEqual(uploads[0].options, { contentType: "image/jpeg", upsert: false });
  assert.deepEqual(rows[0].provider_refs, {
    ...run.provider_refs,
    receipt_screenshot: {
      path: storedPath, sha256: createHash("sha256").update(jpeg).digest("hex"), bytes: jpeg.length,
      page_url: completePage, captured_at: "2026-11-27T00:01:02.000Z",
    },
  });
  assert.equal(rows[0].status, run.status);
  assert.deepEqual(rows[0].result, run.result);
});

test("an unclear receipt is pictured too; a preparation, a not-submitted or an unreported receipt is not", async (t) => {
  const capture = t.mock.method(browserUseAgents, "captureSessionPage", async (): Promise<SessionPageCapture> =>
    ({ status: "unavailable", reason: "no_cdp_url" }));
  for (const run of [
    finishedRun("prepare", "yes"),
    finishedRun("prepare", "unclear"),
    finishedRun("execute", "no"),
    finishedRun("execute"),
    finishedRun("execute", "yes", { kind: "browser_session" }),
    finishedRun("execute", "yes", { provider_refs: { session_id: remoteSession, receipt_screenshot: { status: "unavailable", reason: "timeout" } } }),
  ]) {
    const { uploads, context } = fakeAdmin([structuredClone(run)]);
    assert.deepEqual(start(context, run), []);
    assert.equal(uploads.length, 0);
  }
  assert.equal(capture.mock.callCount(), 0);
  const unclear = finishedRun("execute", " Unclear ");
  const rows = [structuredClone(unclear)];
  const { uploads, context } = fakeAdmin(rows);
  await start(context, unclear)[0];
  assert.equal(capture.mock.callCount(), 1);
  assert.equal(uploads.length, 0);
  assert.deepEqual(rows[0].provider_refs.receipt_screenshot, { status: "unavailable", reason: "no_cdp_url" });
  assert.deepEqual(rows[0].result, unclear.result);
});

test("a picture that could not be taken, or a run with no provider session, records why and uploads nothing", async (t) => {
  const capture = t.mock.method(browserUseAgents, "captureSessionPage", async (): Promise<SessionPageCapture> =>
    ({ status: "unavailable", reason: "timeout" }));
  const run = finishedRun("execute", "yes");
  const rows = [structuredClone(run)];
  const { uploads, context } = fakeAdmin(rows);
  await start(context, run)[0];
  assert.deepEqual(rows[0].provider_refs.receipt_screenshot, { status: "unavailable", reason: "timeout" });
  const sessionless = finishedRun("execute", "yes", { provider_refs: { run_id: remoteRun } });
  const sessionlessRows = [structuredClone(sessionless)];
  await start(fakeAdmin(sessionlessRows).context, sessionless)[0];
  assert.deepEqual(sessionlessRows[0].provider_refs.receipt_screenshot, { status: "unavailable", reason: "no_browser_session" });
  assert.equal(capture.mock.callCount(), 1);
  assert.equal(uploads.length, 0);
  assert.deepEqual(rows[0].result, run.result);
});

test("a failed upload is recorded as such and never claims a stored picture", async (t) => {
  t.mock.method(console, "warn", () => {});
  t.mock.method(browserUseAgents, "captureSessionPage", async () => captured);
  for (const upload of [async () => ({ error: { message: "Bucket unavailable" } }), async () => { throw new Error("socket hang up"); }]) {
    const run = finishedRun("execute", "yes");
    const rows = [structuredClone(run)];
    const { uploads, context } = fakeAdmin(rows, upload);
    await start(context, run)[0];
    assert.equal(uploads.length, 1);
    assert.deepEqual(rows[0].provider_refs.receipt_screenshot, { status: "unavailable", reason: "upload_failed" });
    assert.deepEqual(rows[0].result, run.result);
  }
});

test("a run another writer saved meanwhile is read again and keeps that writer's references", async (t) => {
  const run = finishedRun("execute", "yes");
  const rows = [structuredClone(run)];
  const { context } = fakeAdmin(rows);
  t.mock.method(browserUseAgents, "captureSessionPage", async (): Promise<SessionPageCapture> => {
    rows[0].revision++;
    rows[0].provider_refs = { ...rows[0].provider_refs, workspace_id: "00000000-0000-4000-8000-000000000007" };
    return { status: "unavailable", reason: "no_page" };
  });
  await start(context, run)[0];
  assert.equal(rows[0].revision, run.revision + 2);
  assert.deepEqual(rows[0].provider_refs, {
    ...run.provider_refs, workspace_id: "00000000-0000-4000-8000-000000000007",
    receipt_screenshot: { status: "unavailable", reason: "no_page" },
  });
});

test("the work never rejects: a record that cannot be written is only logged", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {});
  t.mock.method(browserUseAgents, "captureSessionPage", async (): Promise<SessionPageCapture> =>
    ({ status: "unavailable", reason: "no_active_browser" }));
  const run = finishedRun("execute", "yes");
  const context = { admin: { from: () => { throw new Error("Database unavailable"); } } as unknown as TalentAdminClient, userId };
  const kept: Promise<void>[] = [];
  keepReceiptScreenshot(context, run, (work) => { kept.push(work); });
  await kept[0];
  assert.equal(warnings.mock.callCount(), 1);
  // A run that is gone by the time of the record is left alone.
  await start(fakeAdmin([]).context, run)[0];
  assert.equal(warnings.mock.callCount(), 1);
});

test("one picture per run while it is in flight; outside a request, where after() refuses, it still finishes", async (t) => {
  let release!: (capture: SessionPageCapture) => void;
  const capture = t.mock.method(browserUseAgents, "captureSessionPage", () =>
    new Promise<SessionPageCapture>((resolve) => { release = resolve; }));
  const run = finishedRun("execute", "yes");
  const rows = [structuredClone(run)];
  const { context } = fakeAdmin(rows);
  // The real after() throws outside a request scope; the work is not lost.
  assert.doesNotThrow(() => keepReceiptScreenshot(context, run));
  assert.deepEqual(start(context, run), []);
  assert.equal(capture.mock.callCount(), 1);
  release(captured);
  await receiptScreenshotSettled(executionId);
  assert.equal((rows[0].provider_refs.receipt_screenshot as { path?: string }).path, storedPath);
});

test("the reader whose save won starts the picture without waiting for it; another reader of the same run starts none", async (t) => {
  const running = finishedRun("execute", undefined, { status: "running", revision: 1, result: {} });
  const rows = [structuredClone(running)];
  const { uploads, context } = fakeAdmin(rows);
  t.mock.method(browserUseAgents, "status", async () => ({ status: "completed" }));
  t.mock.method(browserUseAgents, "result", async () => ({
    id: remoteRun, sessionId: remoteSession, status: "completed", output: receipt("yes"),
  }));
  let release!: (capture: SessionPageCapture) => void;
  const capture = t.mock.method(browserUseAgents, "captureSessionPage", () =>
    new Promise<SessionPageCapture>((resolve) => { release = resolve; }));
  const readers = await Promise.all([
    refreshBrowserExecution(context, structuredClone(running)),
    refreshBrowserExecution(context, structuredClone(running)),
  ]);
  // Both readers already have the saved receipt while the picture is still being taken.
  for (const latest of readers) {
    assert.equal(latest.status, "completed");
    assert.equal(latest.result.submitted, "yes");
  }
  assert.deepEqual(capture.mock.calls.map((call) => call.arguments), [[remoteSession, completePage]]);
  assert.equal(uploads.length, 0);
  release(captured);
  await receiptScreenshotSettled(executionId);
  assert.equal(uploads.length, 1);
  assert.equal(rows[0].status, "completed");
  assert.deepEqual(rows[0].result, readers[0].result);
  assert.equal((rows[0].provider_refs.receipt_screenshot as { bytes?: number }).bytes, jpeg.length);
  // Reading the finished run again takes no second picture.
  await refreshBrowserExecution(context, structuredClone(rows[0]));
  assert.equal(capture.mock.callCount(), 1);
});

test("a picture that fails in any way leaves the saved and returned receipt as it was", async (t) => {
  t.mock.method(console, "warn", () => {});
  const running = finishedRun("execute", undefined, { status: "running", revision: 1, result: {} });
  const rows = [structuredClone(running)];
  const { context } = fakeAdmin(rows);
  t.mock.method(browserUseAgents, "status", async () => ({ status: "completed" }));
  t.mock.method(browserUseAgents, "result", async () => ({
    id: remoteRun, sessionId: remoteSession, status: "completed", output: JSON.stringify(receipt("unclear")),
  }));
  t.mock.method(browserUseAgents, "captureSessionPage", () => { throw new Error("Unexpected capture failure"); });
  const latest = await refreshBrowserExecution(context, structuredClone(running));
  assert.equal(latest.status, "completed");
  assert.deepEqual(latest.result, receipt("unclear"));
  await receiptScreenshotSettled(executionId);
  assert.equal(rows[0].status, "completed");
  assert.equal(rows[0].revision, 2);
  assert.deepEqual(rows[0].result, receipt("unclear"));
  assert.equal(rows[0].provider_refs.receipt_screenshot, undefined);
});
