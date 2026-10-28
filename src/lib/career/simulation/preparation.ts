import { z } from "zod";

export const preparationResponseSchema = z.object({
  decision: z.enum(["accept", "ignore", "answer", "document", "help", "skip"]),
  text: z.string().optional(),
  edits: z.array(z.object({target:z.string(),originalText:z.string(),suggestedText:z.string()})).optional(),
  draftText: z.string().optional(),
  documentId: z.string().optional(),
  documentName: z.string().optional(),
  applicationMethod: z.enum(["harper", "manual"]).optional(),
  optionId: z.string().optional(),
  evidenceMessageId: z.number().optional(),
  reviewId: z.string().optional(),
});
export const draftContentSchema = z.object({
  resume: z.string().min(1),
  materials: z.array(
    z.object({ itemId: z.string(), title: z.string(), content: z.string() })
  ),
  notes: z.string(),
});
export const draftGenerationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["resume", "materials", "notes"],
  properties: {
    resume: { type: "string" },
    notes: { type: "string" },
    materials: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["itemId", "title", "content"],
        properties: {
          itemId: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
        },
      },
    },
  },
};
export const preparationSchema = z.object({
  version: z.literal(1),
  responses: z.record(z.string(), preparationResponseSchema),
  currentItemId: z.string().nullable(),
  showInputs: z.boolean(),
  inputRevision: z.number().int(),
  preparedInputRevision: z.number().int().optional(),
  preparedResumeChangesFingerprint: z.string().optional(),
  generation: z.object({
    status: z.enum(["idle", "running", "failed", "ready"]),
    runId: z.string().nullable(),
    startedAt: z.string().nullable(),
    inputRevision: z.number().int(),
  }),
  draftVersion: z.number().int(),
  draftMessageId: z.number().nullable(),
  approvedVersion: z.number().nullable(),
  finalDocumentId: z.string().nullable(),
  applicationMethod: z.enum(["harper", "manual"]).optional(),
  finalDocumentFingerprint: z.string().nullable().optional(),
  workingResume: z.object({documentId: z.string(), revision: z.number().int(), fileName: z.string()}).optional(),
});
export type Preparation = z.infer<typeof preparationSchema>;
export type PreparationResponse = z.infer<typeof preparationResponseSchema>;
export type DraftContent = z.infer<typeof draftContentSchema>;
export const DRAFT_MESSAGE_TYPE = "application_draft";
export const draftPayloadSchema = z.object({
  version: z.literal(1),
  sessionMessageId: z.number(),
  draftVersion: z.number(),
  inputRevision: z.number(),
  runId: z.string(),
  roleName: z.string(),
  content: draftContentSchema,
});
export type ApplicationDraft = z.infer<typeof draftPayloadSchema>;
export function parseApplicationDraft(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "pending" in value &&
    value.pending === true
  )
    return undefined;
  const parsed = draftPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
export function createPreparation(): Preparation {
  return {
    version: 1,
    responses: {},
    currentItemId: null,
    showInputs: true,
    inputRevision: 0,
    generation: {
      status: "idle",
      runId: null,
      startedAt: null,
      inputRevision: 0,
    },
    draftVersion: 0,
    draftMessageId: null,
    approvedVersion: null,
    finalDocumentId: null,
  };
}
type Item = {
  id: string;
  inputKind?: "change" | "question" | "material" | "choice";
  draftText?: string;
  edits?: {target:string;originalText:string;suggestedText:string}[];
  target?: string;
  originalText?: string;
  suggestedText?: string;
  category: string;
  needsConfirmation: boolean;
  options?: { id: string; label: string }[];
};
export function preparationKind(item: Item) {
  return (
    item.inputKind ??
    (item.category === "materials"
      ? "material"
      : item.needsConfirmation
        ? "question"
        : "change")
  );
}
export function allPreparationAnswered(p: Preparation, items: Item[]) {
  return items.every((item) => Boolean(p.responses[item.id]));
}
export function respondToPreparation(
  p: Preparation,
  items: Item[],
  id: string,
  raw: PreparationResponse
): Preparation {
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error("Unknown preparation item");
  if (p.generation.status === "running")
    throw new Error("Draft generation is running");
  const response = preparationResponseSchema.parse(raw);
  if (response.optionId) {
    const option = item.options?.find((o) => o.id === response.optionId);
    if (
      !option ||
      preparationKind(item) !== "choice" ||
      response.decision !== "answer"
    )
      throw new Error("Unknown choice");
    response.text = option.label;
  }
  const allowed = {
    choice: ["answer", "skip"],
    change: ["accept", "ignore", "answer", "skip"],
    question: ["answer", "skip"],
    material: item.draftText !== undefined ? ["accept", "ignore", "answer", "skip"] : ["document", "help", "answer", "skip"],
  };
  if (!allowed[preparationKind(item)].includes(response.decision))
    throw new Error("Invalid response for this item");
  if (response.decision === "answer" && !response.text?.trim())
    throw new Error("Answer required");
  if (response.decision === "document" && !response.documentId)
    throw new Error("Document required");
  const sourceEdits = item.edits?.length ? item.edits : item.originalText || item.suggestedText ? [{target:item.target ?? "",originalText:item.originalText ?? "",suggestedText:item.suggestedText ?? ""}] : [];
  if (response.edits && (response.decision !== "accept" || preparationKind(item) !== "change" || response.edits.length !== sourceEdits.length || response.edits.some((e,i) => e.target !== sourceEdits[i].target || e.originalText !== sourceEdits[i].originalText))) throw new Error("Edited text must keep the original suggestion targets");
  if (response.draftText !== undefined && (response.decision !== "accept" || item.draftText === undefined)) throw new Error("Only a proposed material can carry edited text");
  const next = structuredClone(p);
  next.responses[id] = response;
  next.inputRevision++;
  next.approvedVersion = null;
  next.finalDocumentId = null;
  next.currentItemId = items.find((i) => !next.responses[i.id])?.id ?? id;
  return next;
}
