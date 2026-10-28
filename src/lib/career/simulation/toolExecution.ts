import { createHash } from "node:crypto";
import { z } from "zod";
import { manageApplicationSuggestions, applicationSuggestionsResult, MANAGE_APPLICATION_SUGGESTIONS } from "./suggestions";
import { readyForRole, READY_FOR_ROLE } from "./readyForRole";
import { saveSession, type SessionRecord, type SessionStoreArgs } from "./sessionStore";
import { pendingApplicationBatch } from "./applicationInput";
import { respondPreparationFromChat } from "./preparationService";
import { preparationResponseSchema } from "./preparation";
import { refreshApplicationInspection } from "./applicationInspection";
import { applicationFormText } from "./applicationFormText";
import { formatPromptText } from "@/lib/llm/promptText";

// Both transports execute the same commands and preserve the same decisions.
export async function executeApplicationPreparationTool(args: {
  store: SessionStoreArgs;
  record: SessionRecord;
  name: string;
  input: Record<string, unknown>;
  messageId: number;
  submittedBatchId?: string;
}) {
  const { store, record, name, input, messageId, submittedBatchId } = args;
  if (name === "manage_simulation_session" && input.action === "inspect") {
    const saved = await refreshApplicationInspection(store, record.messageId, messageId);
    const result = {
      ok: true,
      inspectionStatus: saved.state.applicationInspection?.status,
      applicationForm: applicationFormText(saved.state.applicationForm),
      applicationUrl: saved.state.applicationUrl,
      assistantInstruction: "These are the current observed application requirements and access limits. Reconcile them with existing answers and materials, then save any authorized resume edits. Call ready_for_role again before an authorized application to pin the current file. Unknown access is inconclusive; unsupported access describes an observed barrier. This inspection did not submit anything. Do not repeat an unchanged inspection in this turn.",
    };
    return { record: saved, result: { ...result, modelOutput: formatPromptText(result) } };
  }
  if (name === MANAGE_APPLICATION_SUGGESTIONS) {
    const key = `suggestions:${submittedBatchId ?? messageId}:${JSON.stringify(input)}`;
    const state = manageApplicationSuggestions(record.state, input, key, messageId, submittedBatchId);
    const saved = await saveSession(store, record, state, key);
    return { record: saved, result: applicationSuggestionsResult(saved.state, record.state) };
  }
  if (name === READY_FOR_ROLE) {
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    return readyForRole(store, record, input, messageId,
      `ready:${submittedBatchId ?? messageId}:${record.state.preparation?.inputRevision}:${hash}`);
  }
  return null;
}

export const applicationResponseCommand = z.object({
  action: z.literal("respond"),
  batchId: z.string(),
  actionId: z.string(),
  response: preparationResponseSchema,
}).strict();

export async function respondToApplicationQuestion(
  store: SessionStoreArgs, record: SessionRecord, raw: unknown, messageId: number
) {
  const input = applicationResponseCommand.parse(raw);
  const batch = pendingApplicationBatch(record.state);
  if (!batch || batch.id !== input.batchId || !batch.itemIds.includes(input.actionId))
    throw new Error("Application question is no longer current");
  const item = (batch.items ?? record.state.actions).find(a => a.id === input.actionId);
  if (item?.options?.length && input.response.decision === "answer" &&
      !item.options.some(option => option.id === input.response.optionId))
    throw new Error("Choose an identifier from the current question options");
  const response = { ...input.response, evidenceMessageId: messageId };
  return respondPreparationFromChat(store, record, input.actionId, response, messageId,
    `application-response:${messageId}:${batch.id}:${input.actionId}:${JSON.stringify(response)}`);
}
