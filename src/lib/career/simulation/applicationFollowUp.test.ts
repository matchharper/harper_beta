import test from "node:test";
import assert from "node:assert/strict";
import { createSimulationSession } from "./session";
import { createPreparation, respondToPreparation } from "./preparation";
import { applicationFollowUpReady, recordResumeDelivery } from "./applicationFollowUp";
import { mergeConcurrentInspection } from "./sessionStore";
import { claimApplicationAnswers, finishApplicationAnswers, claimApplicationFollowUp, finishApplicationFollowUp } from "./applicationFollowUpStore";
import { askApplicationInput } from "./applicationInput";
import { expirePreparation } from "./preparationStore";
import type { SessionStoreArgs } from "./sessionStore";

function fixture() {
  const s = createSimulationSession({ roleRef: "job:fixture", roleName: "Engineer", documentId: "resume", documentName: "Resume" });
  s.analysisStatus = "completed";
  s.preparation = { ...createPreparation(), finalDocumentId: "resume", finalDocumentFingerprint: "version-1" };
  s.activity = { version: 1, channel: "web", batches: [], outputs: {} };
  s.applicationInspection = { status: "running", runId: "inspection" };
  return s;
}

test("either completion order waits for a delivered resume and runs once", () => {
  for (const inspectionFirst of [true, false]) {
    const s = fixture();
    if (inspectionFirst) s.applicationInspection!.status = "completed";
    assert.equal(applicationFollowUpReady(s), false);
    const delivered = recordResumeDelivery(s, 20, "follow-up");
    assert.equal(applicationFollowUpReady(delivered), inspectionFirst);
    delivered.applicationInspection!.status = "completed";
    assert.equal(applicationFollowUpReady(delivered), true);
    assert.equal(recordResumeDelivery(delivered, 21, "duplicate"), delivered);
    delivered.preparation!.applicationFollowUp!.status = "running";
    assert.equal(applicationFollowUpReady(delivered), false);
    delivered.preparation!.applicationFollowUp!.status = "done";
    assert.equal(applicationFollowUpReady(delivered), false);
  }
});

test("public observation merges with a resume save, but changed answers and ended sessions do not", () => {
  const before = fixture(), desired = structuredClone(before), current = structuredClone(before);
  desired.preparation!.finalDocumentId = "new-resume";
  current.revision++;
  current.applicationInspection!.status = "completed";
  current.applicationUrl = "https://example.test/official";
  const merged = mergeConcurrentInspection(before, desired, current)!;
  assert.equal(merged.preparation!.finalDocumentId, "new-resume");
  assert.equal(merged.applicationInspection!.status, "completed");
  assert.equal(merged.applicationUrl, current.applicationUrl);
  current.preparation!.inputRevision++;
  assert.equal(mergeConcurrentInspection(before, desired, current), null);
  current.preparation!.inputRevision--;
  current.status = "ended";
  assert.equal(mergeConcurrentInspection(before, desired, current), null);
});

test("supporting answers preserve the prepared resume while resume edits revoke it", () => {
  const withQuestion = askApplicationInput(fixture(), { purpose: "Required supporting file", items: [{kind: "material", title: "Portfolio", documentPurpose: "supporting"}] }, "portfolio");
  assert.equal(withQuestion.preparation!.finalDocumentId, "resume");
  const p = withQuestion.preparation!;
  const items = [{ id: "q", category: "content", inputKind: "question" as const, needsConfirmation: true }, { id: "edit", category: "wording", inputKind: "change" as const, needsConfirmation: true }];
  const answer = respondToPreparation(p, items, "q", { decision: "answer", text: "Confirmed location" });
  assert.equal(answer.finalDocumentId, "resume");
  assert.equal(answer.finalDocumentFingerprint, "version-1");
  assert.equal(respondToPreparation(answer, items, "edit", { decision: "accept" }).finalDocumentId, null);
});

test("concurrent follow-up requests claim only once; failures require an explicit retry", async () => {
  let state = recordResumeDelivery(fixture(), 20, "follow-up");
  state.applicationInspection!.status = "failed"; // Unknown access still needs a manual handoff.
  const store = { userId: "owner", conversationId: "conversation", admin: {
    rpc: async (_: string, args: Record<string, unknown>) => {
      if (args.p_operation === "save") {
        if (args.p_revision !== state.revision) return { data: null, error: { message: "Session revision conflict" } };
        state = { ...structuredClone(args.p_payload as typeof state), revision: state.revision + 1 };
      }
      return { data: { id: state.sessionId, message_id: 10, payload: structuredClone(state), created_at: state.startedAt }, error: null };
    },
  } } as unknown as SessionStoreArgs;
  const claims = await Promise.all([claimApplicationFollowUp(store, 10, "follow-up"), claimApplicationFollowUp(store, 10, "follow-up")]);
  assert.equal(claims.filter(Boolean).length, 1);
  await finishApplicationFollowUp(store, 10, "follow-up", { failed: true });
  assert.equal(applicationFollowUpReady(state), false);
  assert.ok(await claimApplicationFollowUp(store, 10, "follow-up"));
  await finishApplicationFollowUp(store, 10, "follow-up", { replyId: 21 });
  assert.equal(state.preparation!.applicationFollowUp!.messageId, 21);
  assert.equal(await claimApplicationFollowUp(store, 10, "follow-up"), null);
  state.status = "ended";
  assert.equal(await claimApplicationFollowUp(store, 10, "follow-up"), null);
});

test("a lost follow-up becomes retryable without restarting browser inspection", () => {
  const s = recordResumeDelivery(fixture(), 20, "follow-up");
  s.preparation!.applicationFollowUp = { id: "follow-up", status: "running", startedAt: new Date(Date.now() - 11 * 60_000).toISOString() };
  const next = expirePreparation(s);
  assert.equal(next.preparation!.applicationFollowUp!.status, "failed");
  assert.deepEqual(next.applicationInspection, s.applicationInspection);
});

test("duplicate answer continuations claim once even when the DB returns successful idempotent writes", async () => {
  let state = askApplicationInput(fixture(), { purpose: "Resume experience", items: [{ kind: "question", title: "What did you build?" }] }, "initial");
  const batchId = state.activity!.batches[0].id;
  state.activity!.batches[0].status = "submitted";
  const receipts = new Set();
  const store = { userId: "owner", conversationId: "conversation", admin: {
    rpc: async (_: string, args: Record<string, unknown>) => {
      // write_application_activity checks a known mutation key before revision.
      if (args.p_operation === "save" && !receipts.has(args.p_key)) {
        if (args.p_revision !== state.revision) return { data: null, error: { message: "Session revision conflict" } };
        state = { ...structuredClone(args.p_payload as typeof state), revision: state.revision + 1 };
        receipts.add(args.p_key);
      }
      return { data: { id: state.sessionId, message_id: 10, payload: structuredClone(state), created_at: state.startedAt }, error: null };
    },
  } } as unknown as SessionStoreArgs;
  const revision = state.revision;
  const claims = await Promise.all([claimApplicationAnswers(store, 10, batchId, revision), claimApplicationAnswers(store, 10, batchId, revision)]);
  assert.equal(claims.filter(Boolean).length, 1, "Only the winning request may invoke the model");
  const startedAt = state.activity!.batches[0].continuationStartedAt;
  await finishApplicationAnswers(store, 10, batchId, startedAt, true);
  assert.equal(state.activity!.batches[0].continuation, "failed");
  assert.ok(await claimApplicationAnswers(store, 10, batchId, state.revision));
  // A late error from the first response must not fail the current attempt.
  state.activity!.batches[0].continuationStartedAt = "2030-01-01T00:00:00Z";
  assert.equal(await finishApplicationAnswers(store, 10, batchId, startedAt, true), null);
  assert.equal(state.activity!.batches[0].continuation, "running");
  await finishApplicationAnswers(store, 10, batchId, state.activity!.batches[0].continuationStartedAt);
  assert.equal(await claimApplicationAnswers(store, 10, batchId, state.revision), null);
});
