import { documentFingerprint } from "./resumeAttachment";
import { stopApplicationBrowser } from "./agentsApi";
import {
  finishApplicationAnswer,
  applicationQuestionItems,
  validateApplicationChoice,
} from "./applicationInput";
import { z } from "zod";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
import {
  preparationResponseSchema,
  allPreparationAnswered,
} from "./preparation";
import { mutateSimulationSession } from "./session";
import {
  sessionOperation,
  saveSession,
  type SessionRecord,
  type SessionStoreArgs,
} from "./sessionStore";
import { expirePreparation } from "./preparationStore";
import type { generateApplicationDraft } from "./draft";
export const preparationRequestSchema = z
  .object({
    conversationId: z.string().uuid(),
    sessionMessageId: z.number().int().positive(),
    expectedRevision: z.number().int().positive(),
    requestId: z.string().min(1).max(200),
    operation: z.enum([
      "respond",
      "submit_answers",
      "navigate",
      "hide",
      "show",
      "generate",
      "approve",
      "attach",
      "resume",
      "end",
    ]),
    batchId: z.string().optional(),
    responses: z.record(z.string(), preparationResponseSchema).optional(),
    itemId: z.string().optional(),
    response: preparationResponseSchema.optional(),
    documentId: z.string().optional(),
    draftVersion: z.number().optional(),
  })
  .strict();
export async function validatePreparationDocument(
  store: SessionStoreArgs,
  documentId: string,
  resume = false
) {
  const doc = await fetchTalentDocument({ ...store, documentId });
  if (!doc || (resume && doc.kind !== "resume"))
    throw new Error("Document unavailable");
  return doc;
}
export async function respondPreparationFromChat(
  store: SessionStoreArgs,
  record: SessionRecord,
  itemId: string,
  response: z.infer<typeof preparationResponseSchema>,
  messageId: number,
  key: string
) {
  const selected = record.state.actions.find(a => a.id === itemId);
  if (response.decision === "document" && selected?.documentPurpose === "final_resume") {
    const doc = await validatePreparationDocument(store, response.documentId ?? "", true);
    if (selected.documentId !== doc.id || selected.documentFingerprint !== documentFingerprint(doc))
      throw new Error("The file changed; request a new confirmation");
  }
  if (response.documentId)
    response.documentName = (
      await validatePreparationDocument(
        store,
        response.documentId,
        record.state.actions.find((a) => a.id === itemId)?.documentPurpose ===
          "final_resume"
      )
    ).file_name;
  return saveSession(
    store,
    record,
    finishApplicationAnswer(
      mutateSimulationSession(
        record.state,
        { action: "respond", actionId: itemId, response },
        messageId
      )
    ),
    key
  );
}
export async function executePreparationRequest(
  store: SessionStoreArgs,
  input: z.infer<typeof preparationRequestSchema>,
  generate: typeof generateApplicationDraft = async (...args) =>
    (await import("./draft")).generateApplicationDraft(...args),
  onState?: (record: SessionRecord) => void
) {
  let record = await sessionOperation({
    ...store,
    operation: "read",
    messageId: input.sessionMessageId,
  });
  if (!record?.state.preparation) throw new Error("Preparation unavailable");
  if (record.state.revision !== input.expectedRevision)
    throw new Error("Session revision conflict");
  if (["generate", "approve", "resume"].includes(input.operation))
    throw new Error("This operation is no longer supported");
  const expired = expirePreparation(record.state);
  if (expired.status !== "active") {
    if (record.state.status === "active")
      await saveSession(
        store,
        record,
        expired,
        `expired:${record.state.revision}`
      );
    throw new Error("Session has ended");
  }
  if (
    record.state.preparation.generation.status !==
    expired.preparation?.generation.status
  ) {
    record = await saveSession(
      store,
      record,
      expired,
      `recover:${record.state.revision}`
    );
    onState?.(record);
  }
  if (input.operation === "generate")
    return generate(store, record, undefined, onState);
  let state = structuredClone(expired);
  const p = state.preparation!;
  if (p.generation.status === "running" && input.operation !== "end")
    throw new Error("Draft generation is running");
  if (input.operation === "respond" || input.operation === "submit_answers") {
    const batch = state.activity?.batches.find(b => b.id === input.batchId);
    if (input.operation === "submit_answers" && (!batch || batch.status !== "waiting" || !input.responses || Object.keys(input.responses).length !== batch.itemIds.length || batch.itemIds.some(id => !input.responses?.[id])))
      throw new Error("Complete pending question batch required");
    const answers = input.operation === "submit_answers"
      ? batch!.itemIds.map(itemId => ({itemId, response: input.responses![itemId]}))
      : [{itemId: input.itemId, response: input.response}];
    for (const answer of answers) {
    const input = answer;
    if (!input.itemId || !input.response) throw new Error("Response required");
    const item = applicationQuestionItems(state).find(
      (a) => a.id === input.itemId
    );
    if (
      item?.documentPurpose === "final_resume" &&
      input.response.decision === "document" &&
      item.documentId !== input.response.documentId
    )
      throw new Error(
        "The confirmed file has changed; request a new confirmation"
      );
    if (item?.documentPurpose === "final_resume" && input.response.decision === "document") {
      const doc = await validatePreparationDocument(store, input.response.documentId ?? "", true);
      if (item.documentFingerprint !== documentFingerprint(doc))
        throw new Error("The file changed; request a new confirmation");
    }
    if (input.response.documentId)
      input.response.documentName = (
        await validatePreparationDocument(
          store,
          input.response.documentId,
          state.actions.find((a) => a.id === input.itemId)?.documentPurpose ===
            "final_resume"
        )
      ).file_name;
    if (state.activity) validateApplicationChoice(state, input.itemId);
    state = finishApplicationAnswer(
      mutateSimulationSession(
        state,
        { action: "respond", actionId: input.itemId, response: input.response },
        0
      )
    );
    }
  } else if (input.operation === "navigate" || input.operation === "show") {
    if (
      input.itemId &&
      !applicationQuestionItems(state).some((a) => a.id === input.itemId)
    )
      throw new Error("Unknown item");
    p.currentItemId = input.itemId ?? p.currentItemId;
    p.showInputs = true;
  } else if (input.operation === "hide") p.showInputs = false;
  else if (input.operation === "approve") {
    if (
      !p.draftMessageId ||
      p.generation.status !== "ready" ||
      p.inputRevision !== p.generation.inputRevision ||
      input.draftVersion !== p.draftVersion
    )
      throw new Error("Draft is out of date");
    p.approvedVersion = p.draftVersion;
  } else if (input.operation === "attach") {
    if (!input.documentId) throw new Error("Choose a final resume file");
    await validatePreparationDocument(store, input.documentId, true);
    p.finalDocumentId = input.documentId;
  } else if (input.operation === "end") {
    await stopApplicationBrowser(state.browser);
    state = mutateSimulationSession(state, { action: "end" }, 0);
  }
  state.lastActivityAt = new Date().toISOString();
  const saved = await saveSession(store, record, state, input.requestId);
  onState?.(saved);
  return saved;
}
