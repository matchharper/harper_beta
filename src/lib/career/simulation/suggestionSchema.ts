import { z } from "zod";
import type { SessionAction } from "./session";
export const MAX_APPLICATION_SUGGESTIONS = 10;
export const MAX_APPLICATION_QUESTIONS = 3;
export const MAX_APPLICATION_RESUME_CHANGES = 7;

export function applicationSuggestionLimitError(
  kinds: readonly (string | undefined)[]
) {
  if (kinds.length > MAX_APPLICATION_SUGGESTIONS)
    return `Present at most ${MAX_APPLICATION_SUGGESTIONS} suggestions in one batch, including materials.`;
  if (
    kinds.filter((kind) => kind === "question").length >
    MAX_APPLICATION_QUESTIONS
  )
    return `Present at most ${MAX_APPLICATION_QUESTIONS} questions in one batch.`;
  if (
    kinds.filter((kind) => kind === "change").length >
    MAX_APPLICATION_RESUME_CHANGES
  )
    return `Present at most ${MAX_APPLICATION_RESUME_CHANGES} resume changes in one batch.`;
}
const base = {
  title: z.string().trim().min(1).max(300),
  reason: z.string().trim().min(1).max(3000),
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
        .min(1)
        .max(12),
    })
    .strict(),
  z.object({ ...base, kind: z.literal("question") }).strict(),
  z
    .object({
      ...base,
      kind: z.literal("material"),
      applicationField: z.string().min(1),
      draftText: z.string().min(1).max(30000),
    })
    .strict(),
]);
export type ApplicationSuggestion = z.infer<typeof suggestionSchema>;
export const suggestionBatchSchema = suggestionSchema
  .array()
  .superRefine((items, ctx) => {
    const message = applicationSuggestionLimitError(
      items.map((item) => item.kind)
    );
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });
const common = { title: { type: "string" }, reason: { type: "string" } };
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
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["target", "originalText", "suggestedText"],
            properties: {
              target: { type: "string", description: "User-visible resume location, such as Harper 경력. Use a short human-readable label, never a JSON path or internal identifier." },
              originalText: { type: "string" },
              suggestedText: { type: "string" },
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
