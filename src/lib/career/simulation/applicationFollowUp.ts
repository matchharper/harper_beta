import { isApplicationInspectionPending } from "./applicationForm";
import type { SimulationSession } from "./session";

/** A delivery receipt and a durable continuation claim, not a model's reasoning state. */
export function applicationResumeDelivered(s: SimulationSession) {
  const p = s.preparation;
  if (s.activity?.channel === "email") return true;
  if (!p?.resumeDelivery) return Boolean(p?.finalDocumentId && p.finalDocumentFingerprint && s.applicationReview?.resumeDocumentId === p.finalDocumentId); // Already delivered legacy drafts.
  return p.resumeDelivery.documentId === p.finalDocumentId &&
    p.resumeDelivery.fingerprint === p.finalDocumentFingerprint;
}

export function applicationFollowUpReady(s: SimulationSession) {
  return s.status === "active" && applicationResumeDelivered(s) &&
    Boolean(s.preparation?.finalDocumentId) && !s.activity?.batches.some(b => b.status === "waiting") &&
    !isApplicationInspectionPending(s) &&
    s.preparation?.applicationFollowUp?.status === "pending";
}

export function recordResumeDelivery(s: SimulationSession, messageId: number, id: string) {
  const p = s.preparation;
  if (s.status !== "active" || s.activity?.channel === "email" ||
      !p?.finalDocumentId || !p.finalDocumentFingerprint || s.activity?.batches.some(b => b.status === "waiting")) return s;
  if (p.resumeDelivery?.documentId === p.finalDocumentId &&
      p.resumeDelivery.fingerprint === p.finalDocumentFingerprint) return s;
  const next = structuredClone(s);
  next.preparation!.resumeDelivery = { documentId: p.finalDocumentId, fingerprint: p.finalDocumentFingerprint, messageId };
  next.preparation!.applicationFollowUp = { id, status: "pending" };
  return next;
}
