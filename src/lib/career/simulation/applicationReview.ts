import { z } from "zod";
import { applicationFormSchema } from "./applicationForm";
import type { SimulationSession } from "./session";

// Stored in the existing application activity; the form observation supplies the
// field identities. A separate revision protects edits from background updates.
export const applicationFieldAnswerSchema = z.object({
  fieldId: z.string(),
  value: z.string().optional(),
  values: z.array(z.string()).optional(),
  documentId: z.string().nullable().optional(),
});
export const applicationReviewSchema = z.object({
  revision: z.number().int().positive(),
  updatedAt: z.string(),
  form: applicationFormSchema,
  formId: z.string().uuid().optional(),
  resumeDocumentId: z.string(),
  documents: z.array(z.object({ documentId: z.string(), title: z.string() })).optional(),
  fields: z.array(
    applicationFieldAnswerSchema.extend({ editedByUser: z.boolean() })
  ),
});
export type ApplicationReview = z.infer<typeof applicationReviewSchema>;
export type ApplicationFieldAnswer = z.infer<
  typeof applicationFieldAnswerSchema
>;
export const applicationFieldId = (index: number) => `field-${index + 1}`;

/** Positional field IDs are only valid for the observation that created them. */
export function applicationReviewMatchesForm(state: SimulationSession) {
  const review = state.applicationReview, form = state.applicationForm;
  if (!review || !form) return false;
  if (review.formId && state.applicationFormId)
    return review.formId === state.applicationFormId;
  return review.form.checkedAt === form.checkedAt && review.form.url === form.url;
}

export function prepareApplicationReview(
  state: SimulationSession,
  resumeDocumentId: string,
  answers: ApplicationFieldAnswer[] = [],
  documents?: ApplicationReview["documents"]
): ApplicationReview | undefined {
  if (!state.applicationForm)
    return undefined;
  const form = state.applicationForm;
  const old = state.applicationReview;
  // Reinspection changes field identity. Keep the prior draft until the model
  // explicitly prepares the new observation, rather than remapping by labels.
  const sameForm = applicationReviewMatchesForm(state);
  const ids = new Set(form.fields.map((_, index) => applicationFieldId(index)));
  if (answers.some((answer) => !ids.has(answer.fieldId)))
    throw new Error("Unknown application field");
  return {
    revision: (old?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    resumeDocumentId,
    documents: documents ?? old?.documents,
    form: structuredClone(form),
    formId: state.applicationFormId,
    fields: form.fields.map((_, index) => {
      const fieldId = applicationFieldId(index);
      const previous = sameForm
        ? old?.fields.find((field) => field.fieldId === fieldId)
        : undefined;
      const answer = answers.find((answer) => answer.fieldId === fieldId);
      return {
        fieldId,
        value: "",
        ...previous,
        ...answer,
        editedByUser: answer ? false : (previous?.editedByUser ?? false),
      };
    }),
  };
}

export function editApplicationReview(
  review: ApplicationReview,
  revision: number,
  answers: ApplicationFieldAnswer[]
) {
  if (review.revision !== revision)
    throw new Error("Application review revision conflict");
  const next = structuredClone(review);
  for (const answer of answers) {
    const index = next.fields.findIndex(
      (field) => field.fieldId === answer.fieldId
    );
    if (index < 0) throw new Error("Unknown application field");
    next.fields[index] = {
      ...next.fields[index],
      ...answer,
      editedByUser: true,
    };
  }
  next.revision++;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function applicationReviewText(review: ApplicationReview) {
  return [
    `${review.fields.length ? "Prepared application draft" : "Prepared files"} version: ${review.revision}. Resume document: ${review.resumeDocumentId}.`,
    "Saved draft; no transmission or user approval is established by this save.",
    ...(review.documents ?? []).map(document => `Prepared document: ${document.title} | documentId: ${document.documentId}`),
    ...review.fields.map((answer) => {
      const field = review.form.fields.find(
        (_, index) => applicationFieldId(index) === answer.fieldId
      );
      return `${answer.fieldId} | ${field?.label ?? ""}: ${answer.values ? answer.values.join("; ") : (answer.value ?? "")}${answer.editedByUser ? "\nUser-edited: preserve unless the user requests a change." : ""}${answer.documentId ? `\nAttachment document: ${answer.documentId}` : ""}`;
    }),
  ].join("\n");
}
