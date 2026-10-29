import { z } from "zod";
import type { SessionAction } from "./session";
const base = {
  title: z.string().trim().min(1),
  reason: z.string().trim().min(1),
};
export const suggestionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...base,
      kind: z.literal("change"),
      edits: z
        .array(
          z
            .object({
              target: z.string().min(1).describe("User-visible resume location, such as Harper 경력. Use a short human-readable label, never a JSON path or internal identifier."),
              originalText: z.string(),
              suggestedText: z.string(),
            })
            .strict()
        )
        .min(1),
    })
    .strict(),
  z.object({ ...base, kind: z.literal("question") }).strict(),
  z
    .object({
      ...base,
      kind: z.literal("material"),
      applicationField: z.string().min(1),
      draftText: z.string().min(1),
    })
    .strict(),
]);
export type ApplicationSuggestion = z.infer<typeof suggestionSchema>;
export const suggestionBatchSchema = suggestionSchema.array();
const common = {
  title: { type: "string", description: "User-facing invitation to review a change, or the single actual question for a question item. Use natural language, not an editorial task label." },
  reason: { type: "string", description: "The practical value of this decision for this role. The user already sees the proposed text alongside it: explain why it helps, without repeating the edits, listing source checks, or reassuring them about facts you did not invent." },
};
export const suggestionParameters = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "title", "reason", "edits"],
      properties: {
        ...common,
        kind: { type: "string", enum: ["change"] },
        edits: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["target", "originalText", "suggestedText"],
            properties: {
              target: { type: "string", description: "User-visible resume location, such as Harper 경력. Use a short human-readable label, never a JSON path or internal identifier." },
              originalText: { type: "string", description: "Exact original span to replace once. Combine all changes to that span into one edit; do not repeat the same originalText across edits. Empty for an addition." },
              suggestedText: { type: "string", description: "The complete resulting replacement, combining all authorized improvements to this span. Empty for deletion." },
            },
          },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "title", "reason"],
      properties: { ...common, kind: { type: "string", enum: ["question"] } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "title", "reason", "applicationField", "draftText"],
      properties: {
        ...common,
        kind: { type: "string", enum: ["material"] },
        applicationField: { type: "string" },
        draftText: { type: "string" },
      },
    },
  ],
};

export function suggestionAction(
  value: ApplicationSuggestion,
  id = `S-${crypto.randomUUID()}`
): SessionAction {
  const s = suggestionSchema.parse(value);
  return {
    ...{
      id,
      title: s.title,
      reason: s.reason,
      inputKind: s.kind,
      category: s.kind === "material" ? "materials" : "content",
      target:
        s.kind === "material"
          ? s.applicationField
          : s.kind === "change"
            ? s.edits.map((e) => e.target).join("; ")
            : "",
      proposal: s.kind === "material" ? s.draftText : "",
      ...(s.kind === "change" ? { edits: s.edits } : {}),
      ...(s.kind === "material"
        ? { draftText: s.draftText, applicationField: s.applicationField }
        : {}),
      requirementIds: [],
      evidenceIds: [],
      needsConfirmation: true,
      questions: [],
      executionPrompt: "",
    },
    status: "pending",
    resolution: "",
    evidenceMessageId: null,
  };
}

/** Preparation consumes decisions and editable text, not legacy coaching flags. */
export function applicationSuggestionContext(action: SessionAction) {
  return {
    id: action.id,
    kind: action.inputKind ?? action.category,
    status: action.status,
    content: [
      action.title,
      ...(action.edits ?? []).map(edit =>
        `Location: ${edit.target}\nOriginal: ${edit.originalText}\nProposed replacement: ${edit.suggestedText}`
      ),
      !action.edits?.length && action.originalText !== undefined
        ? `Original: ${action.originalText}\nProposed replacement: ${action.suggestedText ?? ""}`
        : undefined,
      action.draftText ? `Draft: ${action.draftText}` : action.proposal || undefined,
      action.applicationField ? `Application requirement: ${action.applicationField}` : undefined,
      action.resolution ? `Recorded outcome: ${action.resolution}` : undefined,
    ].filter(Boolean).join("\n"),
  };
}
