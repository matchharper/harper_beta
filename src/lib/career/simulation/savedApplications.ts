import { z } from "zod";
import { sessionOperation, type SessionStoreArgs } from "./sessionStore";
import { pendingApplicationBatch } from "./applicationInput";
import type { SimulationSession } from "./session";
import type { TalentMessageResponse } from "@/lib/talentOnboarding/models";

const commandSchema = z.object({
  action: z.enum(["list", "resume"]),
  sessionMessageId: z.number().int().positive().optional(),
  beforeMessageId: z.number().int().positive().optional(),
}).strict();

export function resumeSavedPreparation(state: SimulationSession, now = new Date().toISOString()): SimulationSession {
  if (!state.preparation || !state.activity || state.analysisStatus !== "completed")
    throw new Error("The initial preparation did not finish. Start preparation again with its saved role and source resume.");
  const next = structuredClone(state);
  next.status = "active";
  next.endReason = null;
  next.endedAt = null;
  next.lastActivityAt = now;
  next.switchRequest = null;
  // A stopped website attempt is historical evidence, never an instruction to
  // resume a lost browser or repeat a potentially completed submission.
  next.preparation!.showInputs = Boolean(pendingApplicationBatch(next));
  return next;
}

export async function manageSavedApplications(
  store: SessionStoreArgs,
  raw: Record<string, unknown>,
  requestKey: string,
  onMessage?: (message: TalentMessageResponse) => void,
) {
  const input = commandSchema.parse(raw);
  if (input.action === "list") {
    // Select only an index. Full source text stays out of both the query and the
    // model context until a single preparation is resumed.
    let query = store.admin.from("talent_simulate_application")
      .select("message_id, role_ref, status, updated_at, role_name:payload->>roleName, document_id:payload->>documentId, document_name:payload->>documentName, analysis_status:payload->>analysisStatus, browser_status:payload->browser->>status")
      .eq("user_id", store.userId).eq("conversation_id", store.conversationId)
      .order("message_id", { ascending: false }).limit(21);
    if (input.beforeMessageId) query = query.lt("message_id", input.beforeMessageId);
    const { data, error } = await query;
    if (error) throw new Error("Saved application preparations could not be read.");
    const rows = data ?? [];
    return {
      ok: true,
      preparations: rows.slice(0, 20).map(row => ({
        sessionMessageId: row.message_id, roleRef: row.role_ref,
        roleName: row.role_name, status: row.status, savedAt: row.updated_at,
        sourceDocumentId: row.document_id, sourceDocumentName: row.document_name,
        analysisStatus: row.analysis_status, applicationStatus: row.browser_status,
      })),
      nextBeforeMessageId: rows.length > 20 ? rows[19].message_id : null,
    };
  }
  if (!input.sessionMessageId) throw new Error("Choose a sessionMessageId from the saved preparations.");
  const record = await sessionOperation({ ...store, operation: "read", messageId: input.sessionMessageId });
  if (!record) throw new Error("Saved preparation unavailable in this conversation.");
  const active = await sessionOperation({ ...store, operation: "read" });
  if (active && active.messageId !== record.messageId)
    return { ok: false, reason: "Another application is active. Save and end it first if the user requested switching.", activeSessionMessageId: active.messageId };
  const saved = record.state.status === "active" ? record : await sessionOperation({
    ...store, operation: "resume", record,
    state: resumeSavedPreparation(record.state),
    key: `${requestKey}:resume:${record.messageId}`,
  });
  if (!saved) throw new Error("Saved preparation unavailable.");
  onMessage?.(saved.message);
  return {
    ok: true, resumed: true, sessionMessageId: saved.messageId,
    roleName: saved.state.roleName, sessionStatus: saved.state.status,
    pendingQuestions: pendingApplicationBatch(saved.state)?.itemIds.length ?? 0,
    applicationStatus: saved.state.browser?.status ?? null,
    browserStarted: false,
    assistantInstruction: "Continue from the restored preparation and existing answers. Do not repeat the initial analysis or request approval again for already approved edits. A pending question batch is available in the composer. Resuming does not grant submission consent or restart a website attempt; use its recorded outcome without implying a submission.",
  };
}
