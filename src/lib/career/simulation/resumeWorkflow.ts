import type { SimulationSession } from "./session";

export function assertApplicationResumeWrite(s: SimulationSession) {
  if (s.analysisStatus !== "completed") throw new Error("Finish the application analysis first");
  if (s.browser && ["queued", "running", "waiting"].includes(s.browser.status))
    throw new Error("Stop the current application browser before editing its documents");
}

export function recordApplicationResume(s: SimulationSession, resume: {
  documentId: string; revision: number; fileName: string;
}): SimulationSession {
  const state = structuredClone(s);
  if (!state.preparation) throw new Error("Application preparation unavailable");
  state.preparation.workingResume = resume;
  state.preparation.finalDocumentId = null;
  state.preparation.finalDocumentFingerprint = null;
  state.preparation.approvedVersion = null;
  for (const batch of state.activity?.batches ?? []) {
    if (batch.status === "waiting" && batch.items?.some(item => item.documentPurpose === "final_resume")) {
      batch.status = "cancelled";
      state.preparation.showInputs = false;
    }
  }
  return state;
}
