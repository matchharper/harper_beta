import type { SimulationSession } from "./session";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { isResumeDocumentWrite } from "@/lib/documents/authoring";

export async function assertApplicationDocumentWrite(
  session: SimulationSession,
  args: { name: string; input: Record<string, unknown>; admin: TalentAdminClient; userId: string },
) {
  if (session.status !== "active") return;
  const writesResume = args.name === "generate_resume" ||
    (args.name === "upsert_document" && await isResumeDocumentWrite(args));
  if (!writesResume) return;
  if (session.preparation)
    throw new Error("Use ready_for_role to preserve the selected source and save the prepared resume");
  assertApplicationResumeWrite(session);
}

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
    if (batch.status === "waiting" && batch.items?.length && batch.items.every(item => item.documentPurpose === "final_resume")) {
      batch.status = "cancelled";
      state.preparation.showInputs = false;
    }
  }
  return state;
}
