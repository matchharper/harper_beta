import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import { z } from "zod";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
import { formatPromptText } from "@/lib/llm/promptText";
import { applicationResumeDelivered } from "./applicationFollowUp";
import { isApplicationInspectionPending } from "./applicationForm";
import { applicationFieldAnswerSchema, prepareApplicationReview } from "./applicationReview";
import { documentFingerprint } from "./resumeAttachment";
import { assertApplicationResumeWrite } from "./resumeWorkflow";
import { saveSession, type SessionRecord, type SessionStoreArgs } from "./sessionStore";

export const SAVE_APPLICATION = "save_application";
export const saveApplicationTool = {
  type: "function" as const,
  function: {
    name: SAVE_APPLICATION,
    description: TOOL_DESCRIPTIONS.save_application,
    parameters: {
      type: "object", additionalProperties: false, required: ["application_fields"],
      properties: {
        application_fields: {
          type: "array", description: "Finished answers for observed field IDs. Use documentId=final_resume for the prepared resume, or an exact owned document ID for other file fields.",
          items: { type: "object", additionalProperties: false, required: ["fieldId"], properties: {
            fieldId: { type: "string" }, value: { type: "string" }, values: { type: "array", items: { type: "string" } }, documentId: { type: "string" },
          } },
        },
        application_documents: { type: "array", items: { type: "string" }, description: "Owned supporting document IDs to display with the resume. Replaces this list; omit to preserve existing files. Field attachments must also be assigned in application_fields." },
      },
    },
  },
};

export const saveApplicationSchema = z.object({
  application_fields: z.array(applicationFieldAnswerSchema),
  application_documents: z.array(z.string()).optional(),
}).strict();

export async function saveApplication(store: SessionStoreArgs, record: SessionRecord, raw: unknown, key: string) {
  const input = saveApplicationSchema.parse(raw);
  const s = record.state;
  if (s.status !== "active" || !s.preparation) throw new Error("No active application");
  assertApplicationResumeWrite(s);
  if (!applicationResumeDelivered(s)) throw new Error("Deliver the prepared resume before the application-writing turn");
  if (isApplicationInspectionPending(s)) throw new Error("Application inspection is still pending");
  const id = s.preparation.finalDocumentId;
  const resume = id ? await fetchTalentDocument({ ...store, documentId: id }) : null;
  if (!resume || documentFingerprint(resume) !== s.preparation.finalDocumentFingerprint)
    throw new Error("Save the current resume with ready_for_role first");
  const documentIds = input.application_documents ?? s.applicationReview?.documents?.map(d => d.documentId) ?? [];
  const docs = new Map<string, NonNullable<Awaited<ReturnType<typeof fetchTalentDocument>>>>();
  for (const documentId of new Set([...documentIds, ...input.application_fields.flatMap(a => a.documentId && a.documentId !== "final_resume" ? [a.documentId] : [])])) {
    const doc = await fetchTalentDocument({ ...store, documentId });
    if (!doc) throw new Error("Application attachment or supporting document unavailable");
    docs.set(documentId, doc);
  }
  const state = structuredClone(s);
  state.applicationReview = prepareApplicationReview(state, resume.id,
    input.application_fields.map(a => ({ ...a, ...(a.documentId === "final_resume" ? { documentId: resume.id } : {}) })),
    documentIds.map(documentId => ({ documentId, title: docs.get(documentId)!.file_name })));
  if (!state.applicationReview) throw new Error("Application inspection result is unavailable");
  const saved = await saveSession(store, record, state, key);
  return { record: saved, result: {
    ok: true,
    applicationReview: { available: true, revision: state.applicationReview.revision },
    modelOutput: formatPromptText({
      savedApplication: {
        revision: state.applicationReview.revision,
        resumeDocumentId: state.applicationReview.resumeDocumentId,
        supportingDocuments: state.applicationReview.documents?.map(d => `${d.title} | documentId: ${d.documentId}`),
        answers: state.applicationReview.fields.map((a, index) => `${a.fieldId} | ${state.applicationReview!.form.fields[index].label}: ${a.values?.join("; ") ?? a.value ?? ""}${a.documentId ? ` | documentId: ${a.documentId}` : ""}${a.editedByUser ? " | User-edited" : ""}`),
      },
      applicationUrl: state.applicationUrl,
      submissionAccess: state.applicationForm?.submission?.status ?? "unknown",
      presentation: "The saved application is displayed below this reply and is available in role details.",
    }),
  } };
}
