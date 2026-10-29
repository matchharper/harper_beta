import { formatPromptText } from "@/lib/llm/promptText";
import { z } from "zod";
import type { SimulationSession } from "./session";
import {
  suggestionSchema,
  suggestionParameters,
  suggestionAction,
  applicationSuggestionContext,
} from "./suggestionSchema";
import {
  askApplicationInput,
  pendingApplicationBatch,
} from "./applicationInput";
export const MANAGE_APPLICATION_SUGGESTIONS = "manage_application_suggestions";
export const manageSuggestionsSchema = z
  .object({
    changes: z
      .array(
        z
          .object({
            id: z.string().optional(),
            suggestion: suggestionSchema.optional(),
            // Human interpretation stays in the conversation model; these are execution commands.
            decision: z.enum(["accept", "ignore", "ask"]).optional(),
          })
          .strict()
      ),
    introduction: z.string().optional(),
  })
  .strict();
export const manageApplicationSuggestionsTool = {
  type: "function" as const,
  function: {
    name: MANAGE_APPLICATION_SUGGESTIONS,
    description:
      "Resolve or revise preparation suggestions. Existing id addresses an item; suggestion replaces it or creates one without id. accept settles an authorized change, ignore removes it from execution, ask publishes it in the question composer and ends the turn. For an answered question, use ignore and accept any resulting grounded change. Saved button choices remain settled unless the user subsequently changes them. This tool records decisions; ready_for_role writes the actual resume. Save useful partial work before publishing a new essential question.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["changes"],
      properties: {
        introduction: { type: "string" },
        changes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              suggestion: suggestionParameters,
              decision: { type: "string", enum: ["accept", "ignore", "ask"] },
            },
          },
        },
      },
    },
  },
};
export function manageApplicationSuggestions(
  session: SimulationSession,
  raw: unknown,
  key: string,
  messageId: number,
  submittedBatchId?: string
) {
  const input = manageSuggestionsSchema.parse(raw);
  if (
    session.status !== "active" ||
    session.analysisStatus !== "completed" ||
    !session.preparation ||
    !session.activity
  )
    throw new Error("Application preparation is unavailable");
  if (
    session.browser &&
    ["queued", "running", "waiting"].includes(session.browser.status)
  )
    throw new Error(
      "The browser owns this application; finish or stop it before revising suggestions"
    );
  if (session.activity.batches.some((b) => b.key === key)) return session;
  const submittedBatch = submittedBatchId
    ? session.activity.batches.find(
        (batch) => batch.id === submittedBatchId && batch.status === "submitted"
      )
    : undefined;
  if (submittedBatchId && !submittedBatch)
    throw new Error("Submitted suggestion batch unavailable");
  const s = structuredClone(session),
    present: string[] = [];
  let changed = false;
  const ids = input.changes.flatMap((c) => (c.id ? [c.id] : []));
  if (new Set(ids).size !== ids.length)
    throw new Error("Each suggestion may be changed once per call");
  for (const change of input.changes) {
    const button = change.id ? submittedBatch?.responses[change.id] : undefined;
    if (
      button &&
      (button.decision === "accept" || button.decision === "ignore" || button.decision === "skip")
    ) {
      const settledDecision = button.decision === "skip" ? "ignore" : button.decision;
      if (!change.suggestion && change.decision === settledDecision) continue;
      throw new Error(
        "This submitted button decision is already final, including skip. Preserve the user's choice and handle only the written answers. Continue preparation with existing facts. A later explicit user request can revise the choice in a new turn."
      );
    }
    changed = true;
    let item = change.id
      ? s.actions.find((a) => a.id === change.id)
      : undefined;
    if (change.id && !item) throw new Error("Unknown suggestion");
    if (!item && !change.suggestion)
      throw new Error("New suggestions require content");
    if (change.suggestion) {
      const replacement = suggestionAction(change.suggestion, item?.id);
      if (item) s.actions[s.actions.indexOf(item)] = replacement;
      else s.actions.push(replacement);
      item = replacement;
    }
    const decision = change.decision ?? "ask";
    if (decision === "ask") {
      item!.status = "pending";
      delete s.preparation!.responses[item!.id];
      present.push(item!.id);
    } else {
      if (decision === "accept" && item!.inputKind === "question")
        throw new Error(
          "Questions cannot be accepted as resume changes; use their answer to propose a change or resolve the question"
        );
      item!.status = decision === "accept" ? "completed" : "skipped";
      item!.evidenceMessageId = messageId;
      s.preparation!.responses[item!.id] = {
        decision,
        evidenceMessageId: messageId,
      };
    }
  }
  if (changed) {
    s.preparation!.inputRevision++;
    s.preparation!.finalDocumentId = null;
    s.preparation!.finalDocumentFingerprint = null;
  }
  if (present.length)
    return askApplicationInput(
      s,
      {
        purpose: "suggestions",
        introduction: input.introduction,
        replace: true,
        items: present.map((actionId) => ({ actionId })),
      },
      key
    );
  const waiting = pendingApplicationBatch(s);
  if (waiting && waiting.itemIds.every((id) => s.preparation!.responses[id])) {
    waiting.status = "cancelled";
    s.preparation!.showInputs = false;
  }
  return s;
}

export function applicationSuggestionsResult(
  session: SimulationSession,
  previousSession?: SimulationSession
) {
  const pending = pendingApplicationBatch(session);
  // Existing unanswered items must not stop the tool loop before an approved
  // subset has been written. Only publishing a new batch ends this turn.
  const awaitingUserInput = !!pending &&
    (!previousSession || !previousSession.activity?.batches.some(b => b.id === pending.id));
  const result = {
    ok: true,
    awaitingUserInput,
    suggestions: session.actions,
    documentWritePerformed: false,
    questionPresentation: awaitingUserInput
      ? "New question batch displayed; waiting for the user."
      : "No new question batch. Any existing unanswered items remain open.",
  };
  const previous = new Map(previousSession?.actions.map(action => [action.id, action]));
  const suggestions = session.actions.filter(action =>
    !["completed", "skipped"].includes(action.status) ||
    (previousSession && JSON.stringify(previous.get(action.id)) !== JSON.stringify(action))
  );
  return { ...result, modelOutput: formatPromptText({ ...result, suggestions: suggestions.map(applicationSuggestionContext) }) };
}
