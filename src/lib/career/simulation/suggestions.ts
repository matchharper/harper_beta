import { z } from "zod";
import type { SimulationSession } from "./session";
import {
  suggestionSchema,
  applicationSuggestionLimitError,
  suggestionParameters,
  suggestionAction,
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
      )
      .max(20),
    introduction: z.string().max(1000).optional(),
  })
  .strict();
export const manageApplicationSuggestionsTool = {
  type: "function" as const,
  function: {
    name: MANAGE_APPLICATION_SUGGESTIONS,
    description:
      "Resolve or revise application suggestions from the user's answers, or propose genuinely new ones. Existing id identifies an item; suggestion replaces its content or creates a new item without id. decision=accept settles a user-authorized change (including their requested rewrite) directly, ignore removes it from execution, ask presents it in the composer. Never reconfirm a rewrite the user just instructed. Questions can be settled with ignore after their facts are used; add a grounded change if its content is new. Saved button decisions and inline edits are authoritative. A request to finish preparation leaves them intact; revise a settled decision only for an explicit subsequent change request. Present at most 3 questions, 7 resume changes, and 10 suggestions total per batch including materials. Each question covers a distinct useful gap with a brief, specific reason; include multiple valuable follow-ups together when needed, with no minimum count. Batch consequential follow-ups; aim for one round, never more than three suggestion rounds. When any ask is published, stop and wait for the user. Otherwise continue to ready_for_role. This tool does not edit the actual resume.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["changes"],
      properties: {
        introduction: { type: "string" },
        changes: {
          type: "array",
          maxItems: 20,
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
      (button.decision === "accept" || button.decision === "ignore")
    ) {
      if (!change.suggestion && change.decision === button.decision) continue;
      throw new Error(
        "This submitted button decision is already final. Preserve its exact approved text or rejection and handle only the free answers/skips. Continue to ready_for_role when resolved. A later user request can revise it in a new turn."
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
  const limitError = applicationSuggestionLimitError(
    present.map((id) => s.actions.find((action) => action.id === id)!.inputKind)
  );
  if (limitError) throw new Error(limitError);
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

export function applicationSuggestionsResult(session: SimulationSession) {
  const awaitingUserInput = !!pendingApplicationBatch(session);
  return {
    ok: true,
    awaitingUserInput,
    suggestions: session.actions,
    assistantInstruction: awaitingUserInput
      ? "The composer shows the suggestions. Wait for the user's answers."
      : "The user's instructions are resolved. Continue in this turn to ready_for_role, using action=reuse when no resume edit is needed. If an essential missing fact prevents preparation, explain that specific blocker and include the application URL for direct completion.",
  };
}
