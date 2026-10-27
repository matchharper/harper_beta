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
