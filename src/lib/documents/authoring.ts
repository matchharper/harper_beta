import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { prepareTalentDocumentMetadataUpdate, saveTalentDocumentUpdate, updateTalentDocumentForTool } from "@/lib/talentOnboarding/documentTool";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
import {
  formatCareerDocumentLink,
  getCareerDocumentHref,
} from "@/lib/career/documentLinks";
import { generateResume, resumeDocumentId } from "@/lib/resumes/service";
import { GENERATED_RESUME_ORIGIN, GENERATE_RESUME_PARAMETERS, resumeFileName } from "@/lib/resumes/schema";

export const AUTHORED_DOCUMENT_ORIGIN = "harper_authored_document";
export const UPSERT_DOCUMENT_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["action"],
  properties: {
    action: { type: "string", enum: ["create", "update", "copy"], description: "create saves a new document; update changes the existing document; copy creates a separately named private version of an authored document, preserving its source. Metadata-only changes use update." },
    type: { type: "string", enum: ["resume", "markdown"], description: "Required for create: resume uses structured content and the resume layout; markdown uses a general Markdown body. Both support PDF download. For update/copy omit to retain the stored format; this does not convert an existing file." },
    description: {
      type: ["string", "null"],
      description: "What this document contains or is for, so it can be found without reading its body. Supply on create when known; omit to preserve it, or use null to clear it. Available for uploaded files and generated resumes too.",
    },
    kind: { type: "string", enum: ["resume", "document"], description: "Optional metadata classification for an existing uploaded file; independent of authoring type. A generated resume retains kind=resume." },
    is_primary: { type: "boolean", description: "Select an existing uploaded resume as primary. This also makes it public." },
    is_public: { type: "boolean", description: "Whether Harper may expose this document to companies. Change only with authorization; new documents are private by default." },
    is_deleted: { type: "boolean", description: "Soft-delete or restore an exact document. Deletion keeps the stored file but removes it from list/read and clears public/primary state." },
    title: {
      type: "string",
      minLength: 1,
      description:
        "Filename without .pdf, required for create/copy. Use the requested name or a descriptive name. Omit during update to keep the filename.",
    },
    markdown: {
      type: "string",
      description:
        "Required for type=markdown create. Complete Markdown (headings, lists, links, tables, code; no HTML/images). For a narrow update/copy use edits. Omit on copy to preserve the source body. Not used for type=resume.",
    },
    edits: {
      type: "array",
      minItems: 1,
      description:
        "For Markdown update/copy: exact replacements applied in order. Read the needed passage with read_document(query/offset); each old_text must match exactly once. Use either edits or full markdown, not both. Resume edits use changes.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["old_text", "new_text"],
        properties: {
          old_text: { type: "string", minLength: 1 },
          new_text: { type: "string" },
        },
      },
    },
    document_id: {
      type: "string",
      description:
        "Required for update/copy: exact owned document ID from list_documents/read_document. Metadata applies to any owned file; content update/copy applies to Harper-authored documents of the matching format. Read an uploaded original and use create for a separate editable version.",
    },
    expected_revision: {
      type: "integer",
      minimum: 1,
      description:
        "Required for copy and title/body updates, from read_document; optional for metadata-only updates. Read a generated resume with format=structured before editing/copying.",
    },
    content: { ...GENERATE_RESUME_PARAMETERS.properties.content as Record<string, unknown>, description: "Full structured resume for type=resume create. Update/copy use scoped changes to preserve unrelated content and stable entry IDs." },
    changes: GENERATE_RESUME_PARAMETERS.properties.changes,
    target_role: GENERATE_RESUME_PARAMETERS.properties.target_role,
    source_document_ids: GENERATE_RESUME_PARAMETERS.properties.source_document_ids,
    source_refs: GENERATE_RESUME_PARAMETERS.properties.source_refs,
  },
};

type DocumentWriteArgs = {
  admin: TalentAdminClient;
  userId: string;
  userMessageId: string | number;
  requestId?: string;
  input: Record<string, unknown>;
};
const resumeFields = ["content", "changes", "target_role", "source_document_ids", "source_refs"] as const;
const metadataFields = ["description", "kind", "is_primary", "is_public", "is_deleted"] as const;
const hasContentChange = (input: Record<string, unknown>) =>
  ["title", "markdown", "edits", ...resumeFields].some(key => input[key] !== undefined);
const storedType = (document: TalentDocumentRow | null) =>
  document?.origin_type === GENERATED_RESUME_ORIGIN ? "resume" :
    document?.origin_type === AUTHORED_DOCUMENT_ORIGIN ? "markdown" : undefined;

function documentAction(input: Record<string, unknown>) {
  // Older in-flight calls predate the explicit command field.
  const action = input.action ?? (input.document_id === undefined ? "create" : "update");
  if (action !== "create" && action !== "update" && action !== "copy")
    throw new Error("action must be create, update or copy.");
  return action;
}

/** Application resume guards must run before a write, including inferred-format edits. */
export async function isResumeDocumentWrite(args: Pick<DocumentWriteArgs, "admin" | "userId" | "input">) {
  const action = documentAction(args.input);
  if (action === "update" && !hasContentChange(args.input)) return false;
  if (args.input.type !== undefined) return args.input.type === "resume";
  if (typeof args.input.document_id !== "string") return false;
  return storedType(await fetchTalentDocument({ admin: args.admin, userId: args.userId, documentId: args.input.document_id, includeDeleted: true })) === "resume";
}

export async function upsertDocument(args: DocumentWriteArgs) {
  const { input } = args;
  const action = documentAction(input);
  if (input.type !== undefined && input.type !== "resume" && input.type !== "markdown")
    throw new Error("type must be resume or markdown.");
  if (action === "create" && (input.document_id !== undefined || input.expected_revision !== undefined))
    throw new Error("create must not include document_id or expected_revision.");
  if (action !== "create" && (typeof input.document_id !== "string" || !input.document_id))
    throw new Error("update/copy requires document_id.");
  if (action === "update" && !hasContentChange(input)) {
    const result = await updateTalentDocumentForTool(args);
    return { ...result, action, contentSaved: false };
  }
  const source = action !== "create" ? await fetchTalentDocument({
    admin: args.admin, userId: args.userId, documentId: input.document_id as string,
    // Routing alone must not hide a completed retry after a soft deletion.
    // The format-specific writer checks deletion before any new mutation.
    includeDeleted: true,
  }) : null;
  if (action !== "create" && (!source || !storedType(source)))
    throw new Error("Editable document not found. Create a separate document to preserve the original.");
  const type = input.type ?? storedType(source) ?? (input.action === undefined ? "markdown" : undefined);
  if (!type) throw new Error("create requires type=resume or type=markdown.");
  if (source && type !== storedType(source))
    throw new Error("Document type differs from the saved source. Use create for a separate format.");
  if (type === "markdown") {
    if (resumeFields.some(key => input[key] !== undefined))
      throw new Error("Markdown uses markdown/edits; structured content/changes and resume sources require type=resume.");
    return writeDocument(args);
  }
  if (input.markdown !== undefined || input.edits !== undefined)
    throw new Error("Resume documents use structured content/changes, not markdown/edits.");
  const resumeInput = {
    action,
    ...(input.title !== undefined ? { document_name: input.title } : {}),
    ...Object.fromEntries(["document_id", "expected_revision", ...resumeFields]
      .filter(key => input[key] !== undefined).map(key => [key, input[key]])),
  };
  const metadata = Object.fromEntries(metadataFields.filter(key => input[key] !== undefined).map(key => [key, input[key]]));
  const result = await generateResume({ ...args, input: resumeInput, metadata });
  return { ...result, action, type: "resume" as const, kind: "resume" as const, contentSaved: true };
}

export async function writeDocument(args: DocumentWriteArgs) {
  const { input } = args;
  const action = documentAction(input);
  const editing = action === "update";
  const copying = action === "copy";
  if (
    (action === "create" &&
      (typeof input.title !== "string" ||
        typeof input.markdown !== "string")) ||
    (input.title !== undefined &&
      (typeof input.title !== "string" ||
        !input.title.trim())) ||
    (input.markdown !== undefined && typeof input.markdown !== "string")
  )
    throw new Error("A title and valid Markdown document are required.");
  if (
    input.edits !== undefined &&
      ((!editing && !copying) ||
      input.markdown !== undefined ||
      !Array.isArray(input.edits) ||
      !input.edits.length)
  )
    throw new Error(
      "Use edits only for an existing document, without markdown."
    );
  const edits = input.edits as
    | { old_text: string; new_text: string }[]
    | undefined;
  if (
    edits?.some(
      (edit) =>
        !edit ||
        typeof edit.old_text !== "string" ||
        !edit.old_text ||
        typeof edit.new_text !== "string"
    )
  )
    throw new Error(
      "Each edit needs nonempty old_text and replacement new_text."
    );
  if (
    input.markdown === undefined &&
    !edits?.length &&
    input.title === undefined
  )
    throw new Error("Document content or a title change is required.");
  if (
    (editing || copying) &&
    (typeof input.document_id !== "string" ||
      !input.document_id ||
      !Number.isSafeInteger(input.expected_revision) ||
      Number(input.expected_revision) < 1)
  )
    throw new Error("Editing requires a document ID and its current revision.");
  if (copying && (typeof input.title !== "string" || !input.title.trim()))
    throw new Error("copy requires a new title.");
  const requestKey = createHash("sha256")
    .update(
      JSON.stringify([
        "document",
        ...(copying ? ["copy"] : []),
        args.requestId ?? args.userMessageId,
        input.document_id ?? null,
        input.title,
        editing || copying ? input.markdown : null,
        input.expected_revision ?? null,
        edits ?? null,
        ...["description", "kind", "is_primary", "is_public", "is_deleted"].map(key => [key, input[key]]),
      ])
    )
    .digest("hex");
  const documentId = editing
    ? (input.document_id as string)
    : resumeDocumentId(args.userId, requestKey);
  const read = () =>
    fetchTalentDocument({
      admin: args.admin,
      userId: args.userId,
      documentId,
      includeDeleted: true,
    });
  const receipt = (row: TalentDocumentRow) => ({
    ok: true,
    documentId: row.id,
    fileName: row.file_name,
    description: row.description ?? null,
    contentSaved: true,
    isDeleted: row.is_deleted,
    revision: row.revision,
    ...(!row.is_deleted ? {
      href: getCareerDocumentHref(row.id),
      documentLink: formatCareerDocumentLink({ id: row.id, title: row.file_name }),
    } : {}),
    isPrivate: !row.is_public,
    kind: row.kind,
    isPrimary: row.is_primary,
    action,
    type: "markdown" as const,
  });
  const current = await read();
  if (
    current &&
    (!current.is_deleted || input.is_deleted === true) &&
    current.origin_type === AUTHORED_DOCUMENT_ORIGIN &&
    current.origin_id === requestKey
  )
    return receipt(current);
  if (
    editing &&
    (!current ||
      (current.is_deleted && input.is_deleted !== false) ||
      current.origin_type !== AUTHORED_DOCUMENT_ORIGIN)
  )
    throw new Error(
      "Editable document not found. Create a separate document to preserve the original."
    );
  if (editing && current!.revision !== input.expected_revision)
    throw new Error(
      "Document changed. Read the latest revision before editing."
    );
  const source = copying ? await fetchTalentDocument({ admin: args.admin, userId: args.userId, documentId: input.document_id as string }) : current;
  if (copying && (!source || source.origin_type !== AUTHORED_DOCUMENT_ORIGIN))
    throw new Error("Editable document not found. Create a separate document to preserve the original.");
  if (copying && source!.revision !== input.expected_revision)
    throw new Error("Document changed. Read the latest revision before copying.");
  let markdown =
    typeof input.markdown === "string"
      ? input.markdown
      : (source?.extracted_text ?? "");
  for (const edit of edits ?? []) {
    const start = markdown.indexOf(edit.old_text);
    if (start < 0 || markdown.indexOf(edit.old_text, start + 1) >= 0)
      throw new Error(
        "Edit text is missing or ambiguous. Read a longer exact passage before retrying."
      );
    markdown =
      markdown.slice(0, start) +
      edit.new_text +
      markdown.slice(start + edit.old_text.length);
  }
  if (markdown.includes("\0"))
    throw new Error("Document content contains a null character unsupported by storage.");
  const metadata = prepareTalentDocumentMetadataUpdate((editing ? current : null) ?? {
    kind: "document", origin_type: AUTHORED_DOCUMENT_ORIGIN, origin_id: null,
    is_primary: false, is_deleted: false,
  }, input);
  if (!editing && metadata.kind === "resume")
    throw new Error("Create resume content with the resume writer.");
  const fields = {
    ...(copying ? { description: source!.description ?? null } : {}),
    ...metadata,
    file_name:
      input.title === undefined
        ? current!.file_name
        : resumeFileName(input.title as string),
    extracted_text: markdown,
    origin_id: requestKey,
    revision: editing ? Number(input.expected_revision) + 1 : 1,
    updated_at: new Date().toISOString(),
  };
  const db = args.admin as unknown as SupabaseClient;
  let data: TalentDocumentRow | null = null;
  let error: unknown;
  if (editing) {
    try {
      data = await saveTalentDocumentUpdate({ ...args, document: current!, update: fields });
    } catch (cause) { error = cause; }
  } else {
    const saved = await db.from("talent_documents").insert({
      id: documentId,
      talent_id: args.userId,
      kind: "document",
      origin_type: AUTHORED_DOCUMENT_ORIGIN,
      is_public: false,
      is_primary: false,
      is_deleted: false,
      ...fields,
    }).select("*").maybeSingle();
    data = saved.data as TalentDocumentRow | null;
    error = saved.error;
  }
  if (error || !data) {
    const saved = await read();
    if (
      saved &&
      (!saved.is_deleted || input.is_deleted === true) &&
      saved.origin_type === AUTHORED_DOCUMENT_ORIGIN &&
      saved.origin_id === requestKey
    )
      return receipt(saved);
    throw new Error(
      "Document could not be saved or changed concurrently. Read it again before retrying."
    );
  }
  return receipt(data as TalentDocumentRow);
}
