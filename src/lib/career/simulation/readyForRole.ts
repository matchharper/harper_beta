import { applicationReviewText } from "./applicationReview";
import { isApplicationInspectionPending } from "./applicationForm";
import { formatPromptText } from "@/lib/llm/promptText";
import {
  applicationFieldAnswerSchema,
  prepareApplicationReview,
} from "./applicationReview";
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  GENERATE_RESUME_PARAMETERS,
  parseResumeInput,
  GENERATED_RESUME_ORIGIN,
} from "@/lib/resumes/schema";
import { generateResume } from "@/lib/resumes/service";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
import { formatCareerDocumentLink } from "@/lib/career/documentLinks";
import { documentFingerprint } from "./resumeAttachment";
import {
  assertApplicationResumeWrite,
  recordApplicationResume,
} from "./resumeWorkflow";
import { pendingApplicationBatch } from "./applicationInput";
import {
  saveSession,
  type SessionStoreArgs,
  type SessionRecord,
} from "./sessionStore";

export const READY_FOR_ROLE = "ready_for_role";
export const readyForRoleTool = {
  type: "function" as const,
  function: {
    name: READY_FOR_ROLE,
    description:
      "Save the selected/working resume and the private application draft. Use native action=reuse/create/copy/update and command fields. First tailoring preserves the original: create from the full uploaded source or copy a generated source with its current revision. Later edits update workingResume. Supports partial drafts; unresolved questions are preserved. preparationComplete only reports whether the resume version was pinned, not whether every application requirement is fulfilled. application_fields saves observed answers/attachments; application_documents retains owned supporting files. Returns actual saved content, links and review state. Does not submit or grant transmission consent.",
    // Reuse the native resume command shape. An extra wrapper caused models to
    // serialize the whole command into a string instead of supplying JSON fields.
    parameters: {
      ...GENERATE_RESUME_PARAMETERS,
      required: ["action"],
      properties: {
        ...GENERATE_RESUME_PARAMETERS.properties,
        document_name: {
          ...(GENERATE_RESUME_PARAMETERS.properties.document_name as Record<
            string,
            unknown
          >),
          description:
            "Required for create/copy: provide company + role title without .pdf. Omit for update/reuse to preserve the existing filename. The server resolves the final filename and duplicate suffix.",
        },
        application_documents: {
          type: "array",
          description: "Owned supporting document IDs prepared for this role, including ordinary documents requested by the public JD when the form is inaccessible. Save them first with write_document. The documents appear with the resume in the inline review and role details. This replaces the supporting-document list; omit to preserve it. Field-specific attachments must also be assigned in application_fields.",
          items: { type: "string" },
        },
        application_fields: {
          type: "array",
          description:
            "Prepare the editable application form from observed field IDs (field-1, field-2, ...). Populate every usable observed field from confirmed profile/contact facts, preparation answers and finished written materials. Write actual responses and select the matching owned file for each attachment. Do this before claiming the application is ready, also with action=reuse. Preserve approved wording. Leave unknown facts and unapproved consents blank. File fields use an owned documentId. Use documentId=final_resume to attach the resume saved by this call. Optional alongside any resume action, including reuse. Existing user edits are preserved.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["fieldId"],
            properties: {
              fieldId: { type: "string" },
              value: { type: "string" },
              values: { type: "array", items: { type: "string" } },
              documentId: { type: "string" },
            },
          },
        },
        document_id: {
          ...(GENERATE_RESUME_PARAMETERS.properties.document_id as Record<
            string,
            unknown
          >),
          description:
            "Required for copy/update: the generated document to copy or update. Omit for create/reuse; the selected uploaded source is already known to the application.",
        },
        expected_revision: {
          ...(GENERATE_RESUME_PARAMETERS.properties.expected_revision as Record<
            string,
            unknown
          >),
          description:
            "Required for copy/update: current revision from read_document. Omit for create/reuse.",
        },
        source_document_ids: {
          ...(GENERATE_RESUME_PARAMETERS.properties
            .source_document_ids as Record<string, unknown>),
          description:
            "Optional sources for CREATE only. COPY records its source document automatically; omit this field for copy and update.",
        },
        source_refs: {
          ...(GENERATE_RESUME_PARAMETERS.properties.source_refs as Record<
            string,
            unknown
          >),
          description:
            "Optional verified references for CREATE only. COPY preserves source references automatically; omit this field for copy and update.",
        },
        action: {
          type: "string",
          enum: ["reuse", "create", "copy", "update"],
          description:
            "reuse: keep the current resume unchanged; application_fields may still be supplied. create: first tailoring of an uploaded source; provide document_name and full content, omit document_id, expected_revision and changes. copy: first tailoring of a generated source; provide document_name, document_id and expected_revision, optionally scoped changes, omit content. update: edit the saved workingResume; provide document_id, expected_revision and scoped changes, omit content. Filenames are assigned by the server for every action.",
        },
      },
    },
  },
};
export const readyForRoleSchema = z.record(z.unknown()).transform((input) => {
  const applicationFields = z
    .array(applicationFieldAnswerSchema)
    .optional()
    .parse(input.application_fields);
  const applicationDocuments = z.array(z.string()).optional().parse(input.application_documents);
  const application = {
    ...(applicationFields ? { applicationFields } : {}),
    ...(applicationDocuments ? { applicationDocuments } : {}),
  };
  input = { ...input };
  delete input.application_fields;
  delete input.application_documents;
  const keys = Object.keys(input);
  if (!keys.length) return application;
  if (input.action === "reuse") {
    // Reuse always selects the session's current resume. Descriptive metadata
    // is unused; reject only a conflicting write that would otherwise be lost.
    if (input.content !== undefined || input.changes !== undefined)
      throw new Error(
        "reuse keeps the current resume unchanged; use create, copy or update to apply content or changes"
      );
    return application;
  }
  // Earlier in-flight calls used a wrapper. New calls use the native command.
  const command =
    keys.length === 1 && keys[0] === "resume"
      ? z.record(z.unknown()).parse(input.resume)
      : input;
  const fields = { ...command };
  // Retain compatibility with older calls without letting a model-supplied
  // empty filename override the application's executor-owned name.
  delete fields.document_name;
  // Reuse the native validator so errors identify the invalid command field,
  // rather than an unrelated empty/wrapped branch of a union.
  return {
    ...application,
    resume: parseResumeInput({
      ...fields,
      ...(command.action === "create" || command.action === "copy"
        ? { document_name: "Application resume" }
        : {}),
    }),
  };
});

export async function readyForRole(
  store: SessionStoreArgs,
  record: SessionRecord,
  raw: unknown,
  messageId: number,
  key: string
) {
  const parsed = readyForRoleSchema.parse(raw);
  const resume = "resume" in parsed ? parsed.resume : undefined;
  const { applicationFields, applicationDocuments } = parsed,
    s = record.state;
  if (s.status !== "active" || !s.preparation)
    throw new Error("No active application");
  assertApplicationResumeWrite(s);
  const documentIds = applicationDocuments ?? s.applicationReview?.documents?.map(document => document.documentId);
  const attachments = new Map<string, NonNullable<Awaited<ReturnType<typeof fetchTalentDocument>>>>();
  // Resolve ownership before creating a resume, so an invalid attachment cannot
  // leave an extra tailored copy behind when the caller corrects the reference.
  for (const id of new Set([
    ...(applicationFields ?? []).flatMap(answer => answer.documentId && answer.documentId !== "final_resume" ? [answer.documentId] : []),
    ...(documentIds ?? []),
  ])) {
    const owned = await fetchTalentDocument({ ...store, documentId: id });
    if (!owned) throw new Error("Application attachment or supporting document unavailable");
    attachments.set(id, owned);
  }
  const approvedChanges = s.actions
    .filter((a) => a.inputKind === "change" && a.status === "completed")
    .map((a) => ({
      id: a.id,
      edits: a.edits,
      originalText: a.originalText,
      suggestedText: a.suggestedText,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const changesFingerprint = createHash("sha256")
    .update(JSON.stringify(approvedChanges))
    .digest("hex");
  const changesUnprepared = s.preparation.preparedResumeChangesFingerprint
    ? s.preparation.preparedResumeChangesFingerprint !== changesFingerprint
    : s.preparation.preparedInputRevision !== s.preparation.inputRevision &&
      approvedChanges.length > 0;
  if (resume === undefined && changesUnprepared)
    throw new Error(
      "Accepted resume changes need explicit resume commands before readiness"
    );
  let state = structuredClone(s);
  if (resume !== undefined) {
    const command = parseResumeInput(resume);
    const sourceId = s.preparation.workingResume?.documentId ?? s.documentId;
    if (!sourceId) throw new Error("Selected resume unavailable");
    const source = await fetchTalentDocument({
      ...store,
      documentId: sourceId,
    });
    if (!source || source.kind !== "resume")
      throw new Error("Selected resume unavailable");
    if (s.preparation.workingResume) {
      if (command.action !== "update" || command.document_id !== sourceId)
        throw new Error("Use scoped updates to the current working resume");
    } else if (source.origin_type === GENERATED_RESUME_ORIGIN) {
      if (command.action !== "copy" || command.document_id !== sourceId)
        throw new Error(
          "Create a tailored copy of the selected resume, preserving the original"
        );
    } else {
      if (command.action !== "create")
        throw new Error("Uploaded resumes require a new Harper-format copy");
      command.source_document_ids = Array.from(
        new Set([...(command.source_document_ids ?? []), sourceId])
      );
    }
    // The application owns the file title, not the model. Content edits retain
    // the working copy's allocated title; first saves use canonical role data.
    if (command.action === "update") delete command.document_name;
    else command.document_name = s.roleName;
    const result = await generateResume({
      ...store,
      userMessageId: messageId,
      requestId: key,
      input: command,
      deduplicateName: true,
    });
    if (typeof result.revision !== "number")
      throw new Error("Generated resume revision unavailable");
    state = recordApplicationResume(state, {
      ...result,
      revision: result.revision,
    });
  }
  const documentId =
    state.preparation!.workingResume?.documentId ?? state.documentId;
  if (!documentId) throw new Error("No resume is available");
  const document = await fetchTalentDocument({ ...store, documentId });
  if (
    !document ||
    document.kind !== "resume" ||
    !document.extracted_text?.trim()
  )
    throw new Error("The prepared resume is unavailable");
  // Private edits can be saved independently of unanswered questions. Only pin
  // a submission version after the current preparation has been resolved.
  const pendingItemIds = state.actions
    .filter((a) => !["completed", "skipped"].includes(a.status))
    .map((a) => a.id);
  const preparationComplete =
    !pendingApplicationBatch(state) &&
    pendingItemIds.length === 0 &&
    !isApplicationInspectionPending(state);
  state.preparation!.finalDocumentId = preparationComplete ? document.id : null;
  state.preparation!.finalDocumentFingerprint = preparationComplete
    ? documentFingerprint(document)
    : null;
  state.preparation!.showInputs = Boolean(pendingApplicationBatch(state));
  state.preparation!.preparedInputRevision = state.preparation!.inputRevision;
  state.preparation!.preparedResumeChangesFingerprint = changesFingerprint;
  if (preparationComplete && state.activity?.channel !== "email") {
    for (const answer of applicationFields ?? []) {
      if (answer.documentId === "final_resume") answer.documentId = document.id;
    }
    const documents = documentIds ?
      [...new Set(documentIds)].map(documentId => {
        const supporting = attachments.get(documentId)!;
        return { documentId: supporting.id, title: supporting.file_name };
      }) : undefined;
    state.applicationReview = prepareApplicationReview(
      state,
      document.id,
      applicationFields,
      documents
    );
  }
  const saved = await saveSession(
    store,
    record,
    state,
    `${key}:ready:${document.id}:${document.revision}`
  );
  const submission = state.applicationForm?.submission ?? {
    status: "unknown" as const,
    reason: "Assisted application access has not been verified.",
  };
  const result = {
    ok: true,
    documentId: document.id,
    revision: document.revision,
    fileName: document.file_name,
    documentLink: formatCareerDocumentLink({
      id: document.id,
      title: document.file_name,
    }),
    resumeChanged: resume !== undefined,
    preparationComplete,
    pendingItemIds,
    // Preserve the saved body for execution/trace readers. The model receives a
    // compact save receipt and can inspect the document through read_document.
    savedResumeText: document.extracted_text,
    applicationUrl: state.applicationUrl,
    submission,
    applicationInspection: {
      status: state.applicationForm?.status ?? "unavailable",
      text: state.applicationForm?.text,
      limitations: state.applicationForm?.limitations ?? [
        "Application requirements have not been verified.",
      ],
    },
    applicationStarted: Boolean(state.browser),
    ...(state.applicationReview
      ? {
          applicationReview: {
            available: true,
            revision: state.applicationReview.revision,
            presentation: state.applicationReview.fields.length
              ? "Editable form and files below this reply; also available on the role detail page."
              : "Prepared files below this reply; also available on the role detail page.",
          },
        }
      : {}),

  };
  // Preserve the machine result while giving the conversation model the same
  // observed access facts it receives in the current preparation context.
  return {
    record: saved,
    result: {
      ...result,
      modelOutput: formatPromptText({
        ok: result.ok,
        documentId: result.documentId,
        revision: result.revision,
        documentLink: result.documentLink,
        resumeChanged: result.resumeChanged,
        resumeVersionPinned: result.preparationComplete,
        pendingItemIds: result.pendingItemIds,
        applicationUrl: result.applicationUrl,
        submissionAccess: submission.status,
        // Detailed navigation evidence remains in the stored inspection/context.
        // A save receipt only needs the available action and prepared artifacts.
        supportingDocuments: state.applicationReview?.documents?.map(document =>
          formatCareerDocumentLink({ id: document.documentId, title: document.title })
        ),
        applicationStarted: result.applicationStarted,
        savedApplication: state.applicationReview
          ? applicationReviewText(state.applicationReview)
          : "Not prepared yet.",
        applicationReview: result.applicationReview
          ? `Revision ${result.applicationReview.revision}. ${result.applicationReview.presentation}`
          : "No application review has been saved.",
      }),
    },
  };
}
