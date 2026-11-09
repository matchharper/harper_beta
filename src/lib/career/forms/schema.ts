import { z } from "zod";

export const CAREER_FORM_MESSAGE_TYPES = [
  "career_form",
  "career_form_presentation",
] as const;

const actionSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  message: z.string(),
});
export const careerFormValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);
export type CareerFormValue = z.infer<typeof careerFormValueSchema>;
export const careerFormItemSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  description: z.string().optional(),
  // Unknown renderer types stay readable, so new use cases do not lose their content.
  type: z.string().min(1),
  content: z.union([z.string(), z.record(z.string(), z.unknown())]),
  positive: actionSchema.optional(),
  negative: actionSchema.optional(),
});
export const careerFormDraftSchema = z
  .object({
    kind: z.enum(["suggestion", "form"]),
    title: z.string().optional(),
    items: z.array(careerFormItemSchema),
    positive: actionSchema.optional(),
    negative: actionSchema.optional(),
    relatedRefs: z
      .array(z.object({ type: z.string(), id: z.string() }))
      .optional(),
  })
  .superRefine((form, ctx) => {
    if (new Set(form.items.map((item) => item.id)).size !== form.items.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Item IDs must be unique",
        path: ["items"],
      });
    for (const [index, item] of form.items.entries()) {
      if (
        item.positive &&
        item.negative &&
        item.positive.id === item.negative.id
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Action IDs must be distinct",
          path: ["items", index],
        });
    }
    if (form.positive && form.negative && form.positive.id === form.negative.id)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Action IDs must be distinct",
        path: ["positive"],
      });
  });
export type CareerFormDraft = z.infer<typeof careerFormDraftSchema>;
// Tool transports may carry the structured draft as a JSON-encoded string.
// Decode only that declared representation; the same draft validation applies.
export const careerFormToolDraftSchema = z.union([
  z.string().transform((value, ctx): unknown => {
    try { return JSON.parse(value); }
    catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "form must contain valid JSON" });
      return z.NEVER;
    }
  }),
  z.object({}).passthrough(),
]).pipe(careerFormDraftSchema.refine(form => form.kind === "form", "Use kind=form"));
export type CareerFormItem = z.infer<typeof careerFormItemSchema>;
export type CareerFormAction = z.infer<typeof actionSchema>;
export type CareerForm = CareerFormDraft & {
  formId: number;
  revision: number;
  hidden?: boolean;
  state?: "open" | "answered" | "resolved" | "superseded";
};
const answerFields = {
  itemId: z.string().optional(),
  actionId: z.string().min(1).optional(),
  message: z.string().optional(),
  skipped: z.boolean().optional(),
  values: z.record(z.string(), careerFormValueSchema),
};
export const careerSuggestionAnswerSchema = z.object({
  ...answerFields,
  itemId: z.string().min(1),
});
export type CareerSuggestionAnswer = z.infer<
  typeof careerSuggestionAnswerSchema
>;
export type CareerFormResponse = z.infer<z.ZodObject<typeof answerFields>> & {
  formId: number;
  revision: number;
  answers?: CareerSuggestionAnswer[];
  formSnapshot: CareerForm;
  requestId: string;
  selectedFiles?: { itemId: string; documentId: string; revision: number | null; snapshotId: string; fileName: string }[];
};

export function parseCareerForm(value: unknown): CareerForm | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const input = value as Record<string, unknown>;
  const draft = careerFormDraftSchema.safeParse(value);
  if (
    !draft.success ||
    !Number.isSafeInteger(input.formId) ||
    Number(input.formId) < 1 ||
    !Number.isSafeInteger(input.revision) ||
    Number(input.revision) < 1
  )
    return undefined;
  return {
    ...draft.data,
    formId: Number(input.formId),
    revision: Number(input.revision),
    ...(input.hidden === true ? { hidden: true } : {}),
    ...(["open", "answered", "resolved", "superseded"].includes(String(input.state)) ? { state: input.state as CareerForm["state"] } : {}),
  };
}

export const careerFormResponseInputSchema = z.object({
  conversationId: z.string().uuid(),
  formId: z.number().int().positive(),
  revision: z.number().int().positive(),
  ...answerFields,
  answers: z.array(careerSuggestionAnswerSchema).optional(),
  requestId: z.string().min(1),
});

export function parseCareerFormResponse(
  value: unknown
): CareerFormResponse | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const input = value as Record<string, unknown>;
  const formSnapshot = parseCareerForm(input.formSnapshot);
  const response = careerFormResponseInputSchema
    .omit({ conversationId: true })
    .safeParse(value);
  if (
    !formSnapshot ||
    !response.success ||
    formSnapshot.formId !== response.data.formId ||
    formSnapshot.revision !== response.data.revision
  )
    return undefined;
  const selectedFiles = z.array(z.object({ itemId: z.string(), documentId: z.string().uuid(), revision: z.number().nullable(), snapshotId: z.string().uuid(), fileName: z.string() })).safeParse(input.selectedFiles);
  return { ...response.data, formSnapshot, ...(selectedFiles.success ? { selectedFiles: selectedFiles.data } : {}) };
}

export function getCareerFormContent(
  item: CareerFormItem
): Record<string, unknown> {
  return typeof item.content === "string"
    ? { value: item.content }
    : item.content;
}

export function getCareerFormInitialValues(
  form: CareerForm
): Record<string, CareerFormValue> {
  return Object.fromEntries(
    form.items
      .filter((item) =>
        [
          "text",
          "textarea",
          "change",
          "select",
          "multiselect",
          "checkbox",
          "document",
        ].includes(item.type)
      )
      .map((item) => {
        const content = getCareerFormContent(item);
        if (item.type === "checkbox") return [item.id, content.value === true];
        const initial =
          content.value ??
          (item.type === "change"
            ? content.suggestedText
            : item.type === "document"
              ? content.documentId
              : undefined);
        const parsed = careerFormValueSchema.safeParse(initial);
        return [
          item.id,
          parsed.success
            ? parsed.data
            : item.type === "checkbox"
              ? false
              : item.type === "multiselect"
                ? []
                : "",
        ];
      })
  );
}

export function findCareerFormAction(
  form: CareerForm,
  actionId: string | undefined,
  itemId?: string
): CareerFormAction | undefined {
  const source = itemId ? form.items.find((item) => item.id === itemId) : form;
  return [source?.positive, source?.negative].find(
    (action) => action?.id === actionId
  );
}

/** Reads both completed batches and historical itemwise responses, without duplicating snapshots. */
export function getCareerSuggestionAnswers(
  form: CareerForm,
  responses: CareerFormResponse[]
): Record<string, CareerSuggestionAnswer> {
  const answers: Record<string, CareerSuggestionAnswer> = {};
  for (const response of responses) {
    if (response.formId !== form.formId || response.revision !== form.revision)
      continue;
    if (response.answers) {
      for (const answer of response.answers) answers[answer.itemId] = answer;
    } else if (response.itemId) {
      answers[response.itemId] = {
        itemId: response.itemId,
        actionId: response.actionId,
        message: response.message,
        skipped: response.skipped,
        values: response.values,
      };
    }
  }
  return answers;
}

export const careerFormBatchInputSchema = z.object({
  conversationId: z.string().uuid(),
  requestId: z.string().min(1),
  responses: z.array(careerFormResponseInputSchema.omit({ conversationId: true, requestId: true })).min(1),
}).refine(value => new Set(value.responses.map(r => r.formId)).size === value.responses.length, "Duplicate form IDs");

export function parseCareerFormResponses(value: unknown): CareerFormResponse[] {
  const payload = value as { responses?: unknown[] } | null;
  return (Array.isArray(payload?.responses) ? payload.responses : [value]).flatMap(item => {
    const response = parseCareerFormResponse(item);
    return response ? [response] : [];
  });
}
