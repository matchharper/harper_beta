import test from "node:test";
import assert from "node:assert/strict";
import { createSimulationSession } from "@/lib/career/simulation/session";
import { createPreparation } from "@/lib/career/simulation/preparation";
import { suggestionAction } from "@/lib/career/simulation/suggestionSchema";
import { askApplicationInput } from "@/lib/career/simulation/applicationInput";
import { respondToApplicationQuestion } from "@/lib/career/simulation/toolExecution";
import { assertEmailApplicationReadyToReply, continueEmailApplication, emailApplicationContext, loadEmailApplication } from "./application";
import { EmailContinuationPending, EmailPermanentError, type EmailJobContext } from "./types";

function fixture() {
  const state = createSimulationSession({ roleRef: "role:engineer", roleName: "Engineer", documentId: "resume", documentName: "Resume" });
  state.analysisStatus = "completed";
  state.activity = { version: 1, channel: "email", sourceMessageId: 1, batches: [], outputs: {} };
  state.preparation = createPreparation();
  const record = { messageId: 100, state } as any;
  const job: any = { id: "job", locked_by: "worker", status: "processing", worker_target: "vercel_queue", metadata: {} };
  let latest = 2;
  const fullText = "Career evidence. ".repeat(8000) + "LAST FACT";
  const admin: any = {
    from(table: string) {
      let patch: any;
      const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, contains: () => q,
        update: (value: any) => { patch = value; return q; },
        maybeSingle: async () => {
          if (table === "email_reply_jobs") { if (patch) Object.assign(job, patch); return { data: job }; }
          if (table === "talent_messages") return { data: { id: latest } };
          if (table === "talent_simulate_application") return { data: { message_id: 100 } };
          if (table === "talent_documents") return { data: { id: "resume", extracted_text: fullText, revision: 4, structured_content: { summary: "LAST FACT" } } };
          throw new Error(table);
        },
      }; return q;
    },
    async rpc(_name: string, args: any) {
      if (args.p_operation === "read" && !args.p_message_id && record.state.status === "ended") return { data: null };
      if (args.p_payload) record.state = args.p_payload;
      return { data: { message_id: 100, payload: record.state, created_at: record.state.startedAt } };
    },
  };
  const ctx = { admin, job, owner: "worker", talentId: "owner", conversationId: "conversation", sourceMessage: { id: 2 } } as EmailJobContext;
  return { ctx, job, record, fullText, setLatest: (id: number) => { latest = id; } };
}

test("new inbound is interpreted first, then takes ownership of unfinished preparation", async () => {
  const f = fixture();
  f.record.state.activity.preparationRequest = { role: {}, requestKey: "start" };
  await continueEmailApplication(f.ctx); // Must not run external preparation before interpreting this reply.
  assert.deepEqual(f.job.metadata, {});
  await assert.rejects(() => assertEmailApplicationReadyToReply(f.ctx), EmailContinuationPending);
  assert.equal(f.job.metadata.applicationMessageId, 100);
});

test("superseded source cannot continue or publish application work", async () => {
  const f = fixture();
  f.job.metadata.applicationMessageId = 100;
  f.setLatest(3);
  await assert.rejects(() => continueEmailApplication(f.ctx), EmailPermanentError);
  await assert.rejects(() => assertEmailApplicationReadyToReply(f.ctx), EmailPermanentError);
});

test("application context gives the model full source and actual pending wording", async () => {
  const f = fixture();
  f.record.state = askApplicationInput(f.record.state, {
    purpose: "Review", items: [{ kind: "change", title: "Improve clarity", reason: "Show responsibility", edits: [{ target: "Experience", originalText: "Before", suggestedText: "Exact proposed wording" }] }],
  }, "review");
  const context = JSON.parse(await emailApplicationContext(f.ctx, f.record));
  assert.equal(context.sourceDocument.fullText, f.fullText);
  assert.equal(context.sourceDocument.revision, 4);
  assert.equal(context.sourceDocument.hasUploadFile, false);
  assert.equal(context.sourceDocument.canExportPdf, false);
  assert.match(context.sourceDocument.documentUrl, /^https?:/);
  assert.deepEqual(context.pendingBatch.items[0].edits, [{
    target: "Experience", originalText: "Before", suggestedText: "Exact proposed wording",
  }]);
});

test("browser execution identity survives continuation and distinguishes a later status email", async () => {
  const f = fixture();
  f.record.state.browser = {
    id: "run-current", status: "succeeded", sourceMessageId: 2,
    startedAt: "2026-10-14T01:00:00Z", updatedAt: "2026-10-14T01:01:00Z",
    documentId: "resume", documentHash: "pinned-version",
    url: "https://example.test/apply", purpose: "Authorized application",
    result: { summary: "Received", url: "https://example.test/receipt", evidence: "Website receipt" },
  };
  f.record.state.status = "ended";
  f.job.metadata.applicationBrowserRunId = "run-current";
  const current = JSON.parse(await emailApplicationContext(f.ctx, f.record));
  assert.equal(current.currentReply.applicationBrowserRunId, current.application.runId);
  assert.equal(current.application.sourceMessageId, 2);
  assert.equal(current.application.documentId, "resume");
  assert.equal(current.application.documentFingerprint, "pinned-version");
  assert.equal(current.application.result.url, "https://example.test/receipt");
  f.job.metadata = {}; // A new inbound status question did not execute this browser.
  f.ctx.sourceMessage.id = 3;
  const completed = await loadEmailApplication(f.ctx);
  assert.equal(completed?.state.browser?.id, "run-current");
  assert.equal(completed?.state.browser?.result?.url, "https://example.test/receipt");
  const later = JSON.parse(await emailApplicationContext(f.ctx, f.record));
  assert.equal(later.currentReply.applicationBrowserRunId, null);
  assert.equal(later.application.runId, current.application.runId);
  assert.equal(later.application.sourceMessageId, 2);
});

test("respond rejects stale batches and unknown choice identifiers before writes", async () => {
  const f = fixture();
  f.record.state = askApplicationInput(f.record.state, {
    purpose: "Review", items: [{ kind: "choice", title: "Proceed?", options: [{ id: "send", label: "Send" }, { id: "stop", label: "Stop" }] }],
  }, "choice");
  const batch = f.record.state.activity.batches[0];
  const store = { admin: f.ctx.admin, userId: "owner", conversationId: "conversation" };
  await assert.rejects(() => respondToApplicationQuestion(store, f.record, { action: "respond", batchId: "stale", actionId: batch.itemIds[0], response: { decision: "answer", optionId: "send" } }, 2), /no longer current/);
  await assert.rejects(() => respondToApplicationQuestion(store, f.record, { action: "respond", batchId: batch.id, actionId: batch.itemIds[0], response: { decision: "answer", optionId: "invented" } }, 2), /current question options/);
});

test("written materials and questions are supplied as evidence for model authoring", async () => {
  const f = fixture();
  f.record.state.actions = [suggestionAction({ kind: "material", title: "Card-style title", reason: "Internal source explanation", applicationField: "Why this role?", draftText: "An exact first paragraph.\n\nAn exact second paragraph." }, "M1")];
  f.record.state = askApplicationInput(f.record.state, {
    purpose: "Review",
    items: [
      { actionId: "M1" },
      { kind: "question", title: "A card question", reason: "A card reason" },
    ],
  }, "material-review");
  const context = JSON.parse(await emailApplicationContext(f.ctx, f.record));
  assert.equal(context.pendingBatch.items[0].draftText, "An exact first paragraph.\n\nAn exact second paragraph.");
  assert.equal(context.pendingBatch.items[1].title, "A card question");
});
