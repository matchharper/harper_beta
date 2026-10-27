import { z } from "zod";
import { applicationEditsSchema } from "./applicationEditsSchema";
import {
  actionSchema,
  type SimulationSession,
  type SessionAction,
} from "./session";
import { preparationKind } from "./preparation";
export const ASK_APPLICATION_INPUT = "request_application_information";
export const applicationInputSchema = z.object({
  purpose: z.string().min(1),
  introduction: z.string().optional(),
  replace: z.boolean().optional(),
  reviewMarkdown: z.string().trim().min(1).optional(),
  items: z
    .array(
      z.object({
        actionId: z.string().optional(),
        kind: z.enum(["change", "question", "choice", "material"]).optional(),
        documentPurpose: z.enum(["final_resume", "supporting"]).optional(),
        documentId: z.string().optional(),
        documentName: z.string().optional(),
        documentFingerprint: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        target: z.string().optional(),
        reason: z.string().optional(),
        edits: applicationEditsSchema,
        options: z
          .array(
            z.object({
              id: z.string(),
              label: z.string(),
              description: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .min(1),
});
export const applicationInputTool = {
  type: "function" as const,
  function: {
    name: ASK_APPLICATION_INPUT,
    description:
      "Request decisions, missing facts or documents in the application composer. Use question without options to collect writing ideas, motivation or experience notes; use material only to request or select an actual file. Reference existing preparation action IDs to reuse their evidence and edit examples; an explicit different kind creates a new question from that action without overwriting its history; supply kind/title/description/options for additional questions. For an additional change, include target/reason and edits grounded in confirmed source facts; unknown experience belongs in a question, not a finished edit example. For a final resume selection, use a material item with documentPurpose=final_resume. Only ask when the answer changes content or the next operation. One pending batch is allowed; replace=true explicitly replaces it, preserving answers to unchanged items. This tool saves a question batch and ends the current turn to wait for the user. Do not execute other work after it.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["purpose", "introduction", "items"],
      properties: {
        purpose: { type: "string" },
        introduction: { type: "string" },
        replace: { type: "boolean" },
        reviewMarkdown: { type: "string", description: "Full Markdown content for user review in the chat timeline before these questions. Use for written application drafts and detailed submission reviews; keep item descriptions short and do not duplicate this content." },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              actionId: { type: "string" },
              documentId: { type: "string" },
              kind: {
                type: "string",
                enum: ["change", "question", "choice", "material"],
              },
              documentPurpose: {
                type: "string",
                enum: ["final_resume", "supporting"],
              },
              title: { type: "string" },
              description: { type: "string", description: "Brief context for this question. Put full drafts and detailed reviews in reviewMarkdown, displayed in chat, not in this question body." },
              target: { type: "string" },
              reason: { type: "string" },
              edits: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["target", "originalText", "suggestedText"],
                  properties: {
                    target: { type: "string" },
                    originalText: { type: "string" },
                    suggestedText: { type: "string" },
                  },
                },
              },
              options: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "label"],
                  properties: {
                    id: { type: "string" },
                    label: { type: "string" },
                    description: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
export function pendingApplicationBatch(s: SimulationSession) {
  return s.status === "active"
    ? s.activity?.batches.findLast((b) => b.status === "waiting")
    : undefined;
}
export function applicationQuestionItems(
  s: SimulationSession
): SessionAction[] {
  const batch = pendingApplicationBatch(s);
  return s.activity
    ? (batch?.itemIds.flatMap(
        (id) => s.actions.find((a) => a.id === id) ?? []
      ) ?? [])
    : s.actions;
}
export function askApplicationInput(
  s: SimulationSession,
  raw: unknown,
  key: string
): SimulationSession {
  const input = applicationInputSchema.parse(raw);
  if (
    !s.activity ||
    !s.preparation ||
    s.status !== "active" ||
    s.analysisStatus !== "completed"
  )
    throw new Error("Analysis must finish before asking questions");
  if (s.preparation.generation.status === "running")
    throw new Error("Draft generation is running");
  if (s.activity.batches.some((b) => b.key === key)) return s;
  const previous = pendingApplicationBatch(s);
  if (previous && !input.replace)
    throw new Error("A question batch is already waiting for answers");
  const next = structuredClone(s);
  const items = input.items.map((i, index) => {
    if (i.actionId) {
      const action = next.actions.find((a) => a.id === i.actionId);
      if (!action) throw new Error("Unknown analysis item");
      if (i.kind && i.kind !== preparationKind(action)) {
        const question: SessionAction = {
          ...actionSchema.parse({
          ...action,
          id: `Q-${crypto.randomUUID()}-${index}`,
          inputKind: i.kind,
          title: i.title ?? action.title,
          proposal: i.description ?? action.proposal,
          questions: [],
          options: i.kind === "choice" ? i.options : [],
          }),
          status: "pending",
          resolution: "",
          evidenceMessageId: null,
        };
        if (i.kind === "choice" && (!i.options || i.options.length < 2 || new Set(i.options.map(o => o.id)).size !== i.options.length))
          throw new Error("Choices require distinct options");
        next.actions.push(question);
        return question;
      }
      if (action.inputKind === "question" && action.options?.length === 2)
        action.inputKind = "choice";
      return action;
    }
    if (!i.kind || !i.title?.trim())
      throw new Error("New questions need kind and title");
    if (
      i.kind === "choice" &&
      (!i.options ||
        i.options.length < 2 ||
        new Set(i.options.map((o) => o.id)).size !== i.options.length)
    )
      throw new Error("Choices require distinct options");
    const action: SessionAction = {
      ...actionSchema.parse({
        id: `Q-${crypto.randomUUID()}-${index}`,
        inputKind: i.kind,
        documentPurpose: i.documentPurpose,
        documentId: i.documentId,
        documentName: i.documentName,
        documentFingerprint: i.documentFingerprint,
        title: i.title,
        target: i.target ?? "",
        proposal: i.description ?? "",
        reason: i.reason ?? "",
        edits: i.edits,
        category: i.kind === "material" ? "materials" : "content",
        requirementIds: [],
        evidenceIds: [],
        needsConfirmation: i.kind !== "change",
        questions: [],
        executionPrompt: "",
        options: i.options,
      }),
      status: "pending",
      resolution: "",
      evidenceMessageId: null,
    };
    next.actions.push(action);
    return action;
  });
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new Error("Duplicate question item");
  // Every newly published review needs its own decision, even when action IDs are reused.
  if (input.reviewMarkdown) for (const item of items) delete next.preparation!.responses[item.id];
  if (previous)
    next.activity!.batches.find((b) => b.id === previous.id)!.status =
      "cancelled";
  next.activity!.batches.push({
    id: crypto.randomUUID(),
    key,
    purpose: input.purpose,
    introduction: input.introduction,
    ...(input.reviewMarkdown ? { review: { id: crypto.randomUUID(), version: 1 + Math.max(0, ...next.activity!.batches.map(b => b.review?.version ?? 0)), markdown: input.reviewMarkdown } } : {}),
    items: structuredClone(items),

    itemIds: items.map((i) => i.id),
    status: "waiting",
    continuation: "pending",
    responses: {},
    createdAt: new Date().toISOString(),
  });
  next.preparation!.inputRevision++;
  next.preparation!.approvedVersion = null;
  next.preparation!.finalDocumentId = null;
  next.preparation!.showInputs = true;
  next.preparation!.currentItemId =
    items.find((i) => !next.preparation!.responses[i.id])?.id ?? items[0].id;
  return next;
}
export function finishApplicationAnswer(
  s: SimulationSession
): SimulationSession {
  const next = structuredClone(s),
    batch = pendingApplicationBatch(next),
    p = next.preparation;
  if (!batch || !p) return next;
  batch.responses = Object.fromEntries(
    batch.itemIds.flatMap((id) =>
      p.responses[id] ? [[id, { ...p.responses[id], reviewId: batch.review?.id }]] : []
    )
  );
  const remaining = batch.itemIds.find((id) => !p.responses[id]);
  p.currentItemId = remaining ?? batch.itemIds.at(-1) ?? null;
  for (const id of batch.itemIds) {
    const action = next.actions.find(a => a.id === id), response = p.responses[id];
    if (action && response && ["accept", "ignore"].includes(response.decision)) {
      action.status = response.decision === "accept" ? "completed" : "skipped";
      if (response.edits) action.edits = response.edits;
      if (response.draftText !== undefined) {action.draftText=response.draftText;action.proposal=response.draftText;}
    }
    if (next.actions.find(a => a.id === id)?.documentPurpose === "final_resume" && p.responses[id]?.applicationMethod) {
      p.applicationMethod = p.responses[id].applicationMethod;
    }
    if (
      next.actions.find((a) => a.id === id)?.documentPurpose ===
        "final_resume" &&
      p.responses[id]?.decision === "document"
    ) {
      p.finalDocumentId = p.responses[id].documentId ?? null;
      const item = next.actions.find((a) => a.id === id);
      p.finalDocumentFingerprint =
        item?.documentId === p.finalDocumentId
          ? (item?.documentFingerprint ?? null)
          : null;
    }
  }
  if (!remaining) {
    batch.status = "submitted";
    batch.continuation = "pending";
    p.showInputs = false;
  }
  return next;
}
export function validateApplicationChoice(s: SimulationSession, id: string) {
  const item = applicationQuestionItems(s).find((a) => a.id === id);
  if (!item) throw new Error("Question is no longer pending");
  // Free text remains user-authored; the model interprets it, including choice refinements.
  return preparationKind(item);
}
