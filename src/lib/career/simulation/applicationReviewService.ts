import { z } from "zod";
import {
  applicationFieldAnswerSchema,
  editApplicationReview,
} from "./applicationReview";
import { preparationResponseSchema } from "./preparation";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
import {
  saveSession,
  sessionOperation,
  type SessionRecord,
  type SessionStoreArgs,
} from "./sessionStore";
import { executePreparationRequest } from "./preparationService";
import { startApplicationBrowser } from "./applicationBrowserServer";
import { pendingApplicationBatch } from "./applicationInput";

export const reviewRequestSchema = z
  .object({
    messageId: z.number().int().positive(),
    requestId: z.string().min(1),
    operation: z.enum(["save", "start", "answers", "resume", "stop"]),
    reviewRevision: z.number().int().positive().optional(),
    answers: z.array(applicationFieldAnswerSchema).optional(),
    batchId: z.string().optional(),
    responses: z.record(z.string(), preparationResponseSchema).optional(),
  })
  .strict();

export async function executeApplicationReview(
  store: SessionStoreArgs,
  record: SessionRecord,
  input: z.infer<typeof reviewRequestSchema>
) {
  if (input.operation === "resume") {
    return (
      (await sessionOperation({
        ...store,
        operation: "resume",
        messageId: record.messageId,
        key: input.requestId,
      })) ?? record
    );
  }
  if (!record.state.applicationReview)
    throw new Error("Application review unavailable");
  if (input.operation === "answers") {
    const batch = pendingApplicationBatch(record.state);
    if (!batch || batch.id !== input.batchId || !batch.browser)
      throw new Error("Application questions changed");
    return executePreparationRequest(store, {
      conversationId: store.conversationId,
      sessionMessageId: record.messageId,
      expectedRevision: record.state.revision,
      requestId: input.requestId,
      operation: "submit_answers",
      batchId: input.batchId,
      responses: input.responses,
    });
  }
  if (input.operation === "stop") {
    return executePreparationRequest(store, {
      conversationId: store.conversationId,
      sessionMessageId: record.messageId,
      expectedRevision: record.state.revision,
      requestId: input.requestId,
      operation: "end",
    });
  }
  if (input.operation === "start") {
    return startApplicationBrowser(
      store,
      record,
      {
        purpose:
          "Apply with the application reviewed and selected by the user.",
      },
      undefined,
      input.reviewRevision
    );
  }
  if (record.state.status !== "active")
    throw new Error("Resume this application before editing");
  const browser = record.state.browser;
  if (
    browser &&
    (["queued", "running", "waiting", "succeeded", "uncertain"].includes(
      browser.status
    ) ||
      browser.transmissionAttemptedAt)
  )
    throw new Error(
      "The application used by the website cannot be edited during or after transmission"
    );
  for (const answer of input.answers ?? []) {
    if (
      answer.documentId &&
      !(await fetchTalentDocument({ ...store, documentId: answer.documentId }))
    )
      throw new Error("Application attachment unavailable");
  }
  const state = structuredClone(record.state);
  state.applicationReview = editApplicationReview(
    state.applicationReview!,
    input.reviewRevision ?? 0,
    input.answers ?? []
  );
  state.lastActivityAt = new Date().toISOString();
  return saveSession(store, record, state, input.requestId);
}
