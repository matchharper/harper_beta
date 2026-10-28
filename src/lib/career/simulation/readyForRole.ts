import { isApplicationInspectionPending } from "./applicationForm";
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
      "Save authorized resume edits for this role, including a partial working draft while other questions remain. Unanswered items are preserved; preparationComplete reports whether a submission version was pinned. Read the full source resume first. Supply resume commands to apply ONLY accepted suggestions and the user's direct instructions, preserving unrelated content and original language. First tailoring: use action=copy with document_id, expected_revision and scoped changes for a Harper-generated source; create from the full uploaded source into Harper format (preserve the original file). New filenames are assigned automatically from the company and role title, with a numeric suffix for duplicates; omit document_name. Later edits: update the saved working resume using its current revision and scoped changes, preserving its filename. Supply action and its command fields directly as JSON values, not a string or wrapper. Use action=reuse when no resume edits are needed. This tool validates ownership/revision, saves a private document and returns a preview link. It does not grant submission consent. Explain actual changes and include the returned link. Follow the returned submission support: supported allows assisted application after preparation is complete; unsupported requires a direct handoff; unknown allows rechecking with manage_simulation_session action=inspect. If the user already explicitly requested application after these edits, continue to apply_for_role without redundant confirmation. Free answers/skips must be interpreted and resolved using manage_application_suggestions first. Never fabricate facts or add unreviewed material.",
    // Reuse the native resume command shape. An extra wrapper caused models to
    // serialize the whole command into a string instead of supplying JSON fields.
    parameters: {
      ...GENERATE_RESUME_PARAMETERS,
      required: ["action"],
      properties: {
        ...GENERATE_RESUME_PARAMETERS.properties,
        document_name: {
          type: "string",
          description:
            "Omit. The server assigns company + role title for new files and preserves the name for updates. Legacy values are ignored.",
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
            "reuse: keep the current file unchanged, no other fields. copy: first tailoring of a generated source. create: first tailoring of an uploaded source. update: later edits to the saved workingResume only.",
        },
      },
    },
  },
};
export const readyForRoleSchema = z.record(z.unknown()).transform((input) => {
  const keys = Object.keys(input);
  if (!keys.length) return {};
  if (input.action === "reuse") {
    if (keys.length !== 1)
      throw new Error(
        "reuse keeps the current resume unchanged and accepts no other fields"
      );
    return {};
  }
  // Earlier in-flight calls used a wrapper. New calls use the native command.
  const command =
    keys.length === 1 && keys[0] === "resume"
      ? z.record(z.unknown()).parse(input.resume)
      : input;
  // Reuse the native validator so errors identify the invalid command field,
  // rather than an unrelated empty/wrapped branch of a union.
  return {
    resume: parseResumeInput({
      ...(command.action === "create" || command.action === "copy"
        ? { document_name: "Application resume" }
        : {}),
      ...command,
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
  const { resume } = readyForRoleSchema.parse(raw),
    s = record.state;
  if (s.status !== "active" || !s.preparation)
    throw new Error("No active application");
  assertApplicationResumeWrite(s);
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
  const preparationComplete = !pendingApplicationBatch(state) &&
    pendingItemIds.length === 0 && !isApplicationInspectionPending(state);
  state.preparation!.finalDocumentId = preparationComplete ? document.id : null;
  state.preparation!.finalDocumentFingerprint = preparationComplete ? documentFingerprint(document) : null;
  state.preparation!.showInputs = Boolean(pendingApplicationBatch(state));
  state.preparation!.preparedInputRevision = state.preparation!.inputRevision;
  state.preparation!.preparedResumeChangesFingerprint = changesFingerprint;
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
  return {
    record: saved,
    result: {
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
      // Return the persisted document, not the proposed command. The conversation
      // model must compare this evidence with the user's approved edits.
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
      assistantInstruction:
        "The resume file was saved. If preparationComplete is false, this is a working draft: keep pending questions open and do not claim readiness or submit. Compare savedResumeText with all accepted edits and the latest direct instructions before declaring preparation complete. If an approved edit is missing, read the current structured document and repair it with ready_for_role in this turn; the earlier approval remains valid. Report only changes actually present in the saved file, then use the returned submission status and applicationInspection limitations. Supported means the public form was reachable, not that uploads, conditional fields or submission have succeeded. Offer to help with the next step proportionately to the observed access and unresolved limitations; only supported access permits continuing to apply_for_role with existing authorization. For unsupported access, explain the observed limitation and give the direct application URL. Unknown access is inconclusive, not a permanent refusal: use manage_simulation_session action=inspect to check again when needed for the authorized next step. Do not repeatedly inspect an unchanged result in the same turn. Do not offer to sign in or imply an unreadable form has no additional requirements. Base application progress on the verified result and the user's explicit account of events; composer approvals only approve resume edits. For a user who will apply themselves, distinguish the finished resume from the remaining application: briefly identify consequential observed eligibility restrictions or required written materials in applicationInspection.text that the user still needs to complete. Prioritize those over a checklist of basic or sensitive personal fields. Respect a request to limit this turn to the resume; do not fabricate or silently complete the remaining answers. Describe the available next step; do not describe a failed submission attempt when none occurred. Explain access limitations in plain language without HTTP codes or infrastructure details. Write a concise, natural handoff centered on the useful change and next action, without report headings or lists of unchanged or omitted items. Include the actual documentLink value as the preview link; it renders as a file card. Never print the field name or describe where a placeholder will appear. Describe only positive content actually added to the document; a user’s statement that they did not do something is a limit on your claims, not automatically resume prose. If discussing qualifications, preserve the JD’s common requirements and alternative specialty tracks instead of combining all tracks into mandatory experience. Use a descriptive Markdown link for the exact application URL, keeping surrounding prose outside the link destination. Basic contact information is usable; sensitive demographic and health fields stay empty. Only verified submission is completion.",
    },
  };
}
