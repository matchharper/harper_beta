import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
import {
  formatCareerDocumentLink,
  getCareerDocumentHref,
} from "@/lib/career/documentLinks";
import { resumeDocumentId } from "@/lib/resumes/service";
import { resumeFileName } from "@/lib/resumes/schema";

export const AUTHORED_DOCUMENT_ORIGIN = "harper_authored_document";
export const WRITE_DOCUMENT_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: {
      type: "string",
      minLength: 1,
      maxLength: 240,
      description:
        "Required on create; omit during an edit to keep the filename.",
    },
    markdown: {
      type: "string",
      minLength: 1,
      maxLength: 100000,
      description:
        "Required on create. Complete Markdown (headings, lists, links, tables, code; no HTML/images). For a narrow edit use edits instead of rewriting the whole document.",
    },
    edits: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      description:
        "For existing documents: exact replacements applied in order. Read the needed passage with read_document(query/offset); each old_text must match exactly once. Use either edits or full markdown, not both.",
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
        "Omit to create a private document. Supply only an existing authored document ID to edit it; uploaded originals and resumes are preserved.",
    },
    expected_revision: {
      type: "integer",
      minimum: 1,
      description:
        "Required for an edit, from read_document. Read all needed pages before replacing content.",
    },
  },
};

export async function writeDocument(args: {
  admin: TalentAdminClient;
  userId: string;
  userMessageId: string | number;
  requestId?: string;
  input: Record<string, unknown>;
}) {
  const { input } = args;
  const editing = input.document_id !== undefined;
  if (
    (!editing &&
      (typeof input.title !== "string" ||
        typeof input.markdown !== "string")) ||
    (input.title !== undefined &&
      (typeof input.title !== "string" ||
        !input.title.trim() ||
        input.title.length > 240)) ||
    (input.markdown !== undefined && typeof input.markdown !== "string")
  )
    throw new Error("A title and valid Markdown document are required.");
  if (
    input.edits !== undefined &&
    (!editing ||
      input.markdown !== undefined ||
      !Array.isArray(input.edits) ||
      !input.edits.length ||
      input.edits.length > 20)
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
    editing &&
    (typeof input.document_id !== "string" ||
      !input.document_id ||
      !Number.isSafeInteger(input.expected_revision) ||
      Number(input.expected_revision) < 1)
  )
    throw new Error("Editing requires a document ID and its current revision.");
  const requestKey = createHash("sha256")
    .update(
      JSON.stringify([
        "document",
        args.requestId ?? args.userMessageId,
        input.document_id ?? null,
        input.title,
        editing ? input.markdown : null,
        input.expected_revision ?? null,
        edits ?? null,
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
    revision: row.revision,
    href: getCareerDocumentHref(row.id),
    documentLink: formatCareerDocumentLink({
      id: row.id,
      title: row.file_name,
    }),
    isPrivate: !row.is_public,
  });
  const current = await read();
  if (
    current &&
    !current.is_deleted &&
    current.origin_type === AUTHORED_DOCUMENT_ORIGIN &&
    current.origin_id === requestKey
  )
    return receipt(current);
  if (
    editing &&
    (!current ||
      current.is_deleted ||
      current.origin_type !== AUTHORED_DOCUMENT_ORIGIN)
  )
    throw new Error(
      "Editable document not found. Create a separate document to preserve the original."
    );
  if (editing && current!.revision !== input.expected_revision)
    throw new Error(
      "Document changed. Read the latest revision before editing."
    );
  let markdown =
    typeof input.markdown === "string"
      ? input.markdown
      : (current?.extracted_text ?? "");
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
  if (!markdown.trim() || markdown.length > 100000 || markdown.includes("\0"))
    throw new Error("Document content is empty, invalid or too large.");
  const fields = {
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
  const query = editing
    ? db
        .from("talent_documents")
        .update(fields)
        .eq("id", documentId)
        .eq("talent_id", args.userId)
        .eq("origin_type", AUTHORED_DOCUMENT_ORIGIN)
        .eq("is_deleted", false)
        .eq("revision", input.expected_revision)
        .eq("updated_at", current!.updated_at)
    : db.from("talent_documents").insert({
        ...fields,
        id: documentId,
        talent_id: args.userId,
        kind: "document",
        origin_type: AUTHORED_DOCUMENT_ORIGIN,
        is_public: false,
        is_primary: false,
        is_deleted: false,
      });
  const { data, error } = await query.select("*").maybeSingle();
  if (error || !data) {
    const saved = await read();
    if (
      saved &&
      !saved.is_deleted &&
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
