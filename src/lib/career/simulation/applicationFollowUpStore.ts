import { randomUUID } from "node:crypto";
import { applicationFollowUpReady, recordResumeDelivery } from "./applicationFollowUp";
import { saveSession, sessionOperation, type SessionStoreArgs } from "./sessionStore";
import type { SimulationSession } from "./session";

async function mutate(store: SessionStoreArgs, messageId: number, change: (s: SimulationSession) => SimulationSession | null) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const record = await sessionOperation({ ...store, operation: "read", messageId });
    if (!record || record.state.status !== "active") return null;
    const next = change(record.state);
    if (!next || next === record.state) return null;
    try {
      return await saveSession(store, record, next, `application-follow-up:${randomUUID()}`);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Session revision conflict" || attempt === 3) throw error;
    }
  }
  return null;
}

export function deliverApplicationResume(store: SessionStoreArgs, messageId: number, replyId: number) {
  const id = randomUUID();
  return mutate(store, messageId, s => recordResumeDelivery(s, replyId, id));
}

export function claimApplicationAnswers(store: SessionStoreArgs, messageId: number, batchId: string, expectedRevision: number) {
  return mutate(store, messageId, s => {
    const batch = s.activity?.batches.find(b => b.id === batchId);
    if (s.revision < expectedRevision || !batch || batch.browser || batch.status !== "submitted" || !["pending", "failed"].includes(batch.continuation)) return null;
    const next = structuredClone(s);
    const claimed = next.activity!.batches.find(b => b.id === batchId)!;
    claimed.continuation = "running";
    claimed.continuationStartedAt = new Date().toISOString();
    return next;
  });
}

export function finishApplicationAnswers(store: SessionStoreArgs, messageId: number, batchId: string, startedAt: string | undefined, failed = false) {
  return mutate(store, messageId, s => {
    const batch = s.activity?.batches.find(b => b.id === batchId);
    if (!startedAt || !batch || batch.continuation !== "running" || batch.continuationStartedAt !== startedAt) return null;
    const next = structuredClone(s);
    next.activity!.batches.find(b => b.id === batchId)!.continuation = failed ? "failed" : "done";
    return next;
  });
}

export function claimApplicationFollowUp(store: SessionStoreArgs, messageId: number, id: string) {
  return mutate(store, messageId, s => {
    if (s.preparation?.applicationFollowUp?.id !== id) return null;
    const next = structuredClone(s);
    // Failed continuations require an explicit client retry; polling only sends pending work.
    if (next.preparation!.applicationFollowUp!.status === "failed") next.preparation!.applicationFollowUp!.status = "pending";
    if (!applicationFollowUpReady(next)) return null;
    next.preparation!.applicationFollowUp = { id, status: "running", startedAt: new Date().toISOString() };
    return next;
  });
}

export function finishApplicationFollowUp(store: SessionStoreArgs, messageId: number, id: string, result: { failed?: boolean; replyId?: number; startedAt?: string }) {
  return mutate(store, messageId, s => {
    const current = s.preparation?.applicationFollowUp;
    if (current?.id !== id || current.status !== "running" || (result.startedAt && current.startedAt !== result.startedAt)) return null;
    const next = structuredClone(s);
    next.preparation!.applicationFollowUp = { ...current, status: result.failed ? "failed" : "done", ...(result.replyId ? { messageId: result.replyId } : {}) };
    return next;
  });
}
