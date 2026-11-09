import { GENERATED_RESUME_ORIGIN } from "@/lib/resumes/schema";
import { readPdfExportDiagnostics } from "@/lib/documents/pdfDiagnostics";
import type { Database } from "@/types/database.types";
import type { TalentAdminClient } from "./admin";
import {
  fetchTalentDocument,
  syncLegacyResumeFromDocuments,
} from "./documentStore";
import type { TalentDocumentRow } from "./models";
import {
  GMAIL_CAREER_HISTORY_ORIGIN_ID,
  GMAIL_CAREER_HISTORY_ORIGIN_TYPE,
} from "@/lib/integrations/gmailCareerHistoryCore";

type TalentDocumentMetadataRow = Pick<
  TalentDocumentRow,
  | "created_at"
  | "file_name"
  | "description"
  | "id"
  | "is_primary"
  | "is_public"
  | "kind"
  | "origin_type"
  | "revision"
>;

const DOCUMENT_LIST_SELECT =
  "id, kind, file_name, description, is_public, is_primary, created_at, origin_type, revision";
const DEFAULT_LIST_LIMIT = 10;
const MAX_LIST_LIMIT = 20;
const DEFAULT_READ_CHARS = 4_000;
const MIN_READ_CHARS = 500;
const MAX_READ_CHARS = 6_000;

const hasOwn = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

function optionalString(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function normalizeInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function normalizeDocumentKind(value: unknown) {
  const kind = optionalString(value)?.toLowerCase() ?? null;
  if (!kind) return null;
  if (kind !== "resume" && kind !== "document") {
    throw new Error("kind must be resume or document.");
  }
  return kind;
}

function toDocumentMetadata(
  document: TalentDocumentMetadataRow,
  hasExtractedText: boolean
) {
  return {
    createdAt: document.created_at,
    documentId: document.id,
    fileName: document.file_name,
    description: document.description ?? null,
    hasExtractedText,
    isPrimary: document.is_primary,
    isPublic: document.is_public,
    kind: document.kind,
    source: document.origin_type ?? "user_upload",
    ...(document.revision != null ? { revision: document.revision } : {}),
  };
}

export async function readTalentDocumentMetadataPage(args: {
  admin: TalentAdminClient;
  input: Record<string, unknown>;
  userId: string;
}) {
  const limit = normalizeInteger(
    args.input.limit,
    DEFAULT_LIST_LIMIT,
    1,
    MAX_LIST_LIMIT
  );
  const offset = normalizeInteger(args.input.offset, 0, 0, 100_000);
  const kind = normalizeDocumentKind(args.input.kind);

  let query = args.admin
    .from("talent_documents")
    .select(DOCUMENT_LIST_SELECT)
    .eq("talent_id", args.userId)
    .eq("is_deleted", false)
    .in("kind", ["resume", "document"]);
  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query
    .order("is_primary", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (error) {
    throw new Error(error.message ?? "Failed to list talent documents.");
  }

  const rows = (data ?? []) as TalentDocumentMetadataRow[];
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  return { rows: pageRows, hasMore, limit, offset, nextOffset: hasMore ? offset + pageRows.length : null };
}

export async function listTalentDocumentsForTool(args: {
  admin: TalentAdminClient;
  input: Record<string, unknown>;
  userId: string;
}) {
  const { rows: pageRows, hasMore, limit, offset, nextOffset } = await readTalentDocumentMetadataPage(args);
  const documentIdsWithExtractedText = new Set<string>();
  if (pageRows.length > 0) {
    const { data: textRows, error: textRowsError } = await args.admin
      .from("talent_documents")
      .select("id")
      .eq("talent_id", args.userId)
      .eq("is_deleted", false)
      .in(
        "id",
        pageRows.map((document) => document.id)
      )
      .neq("extracted_text", "");
    if (textRowsError) {
      throw new Error(
        textRowsError.message ?? "Failed to inspect talent document text."
      );
    }
    for (const row of textRows ?? []) {
      documentIdsWithExtractedText.add(row.id);
    }
  }
  const documents = pageRows.map((document) =>
    toDocumentMetadata(document, documentIdsWithExtractedText.has(document.id))
  );
  const pdfExports = await readPdfExportDiagnostics({
    ...args, documentIds: pageRows.filter(document => [GENERATED_RESUME_ORIGIN, "harper_authored_document"].includes(document.origin_type ?? "")).map(document => document.id),
  });
  return {
    documents: documents.map(document => pdfExports.has(document.documentId) ? { ...document, pdfExport: pdfExports.get(document.documentId) } : document),
    hasMore,
    limit,
    nextOffset,
    offset,
  };
}

type ReadDocumentArgs = {
  admin: TalentAdminClient;
  input: Record<string, unknown>;
  userId: string;
};

export function readTalentDocumentForTool(args: ReadDocumentArgs & {
  input: { document_id: string; document_ids?: never } & Record<string, unknown>;
}): ReturnType<typeof readSingleDocument>;
export function readTalentDocumentForTool(args: ReadDocumentArgs): Promise<
  Awaited<ReturnType<typeof readSingleDocument>> | { documents: Array<
    Awaited<ReturnType<typeof readSingleDocument>> | { documentId: string; error: string }
  > }
>;
export async function readTalentDocumentForTool(args: ReadDocumentArgs) {
  const ids = args.input.document_ids;
  if (ids === undefined) return readSingleDocument(args);
  if (args.input.document_id !== undefined || !Array.isArray(ids) || !ids.length) {
    throw new Error("Provide either document_id or a nonempty document_ids array.");
  }
  const documents = [];
  for (const id of ids) {
    const documentId = optionalString(id);
    if (!documentId) throw new Error("Each document_ids entry must be a document ID.");
    try {
      documents.push(await readSingleDocument({
        ...args, input: { ...args.input, document_id: documentId },
      }));
    } catch (error) {
      documents.push({ documentId, error: error instanceof Error ? error.message : "Document read failed." });
    }
  }
  return { documents };
}

async function readSingleDocument(args: ReadDocumentArgs): Promise<{
  document: ReturnType<typeof toDocumentMetadata>;
  revision?: number;
  structuredContent?: TalentDocumentRow["structured_content"];
  excerpt?: string;
  hasMore?: boolean;
  nextOffset?: number | null;
  offset?: number;
  textAvailable?: boolean;
  matchFound?: boolean;
  matchOffset?: number | null;
  pdfExport?: Record<string, unknown>;
}> {
  const documentId = optionalString(args.input.document_id);
  if (!documentId) throw new Error("document_id is required.");

  const document = await fetchTalentDocument({
    admin: args.admin,
    documentId,
    userId: args.userId,
  });
  if (!document) throw new Error("Document not found.");
  if (document.kind !== "resume" && document.kind !== "document") {
    throw new Error("Document not found.");
  }
  const pdfExports = await readPdfExportDiagnostics({
    ...args, documentIds: [GENERATED_RESUME_ORIGIN, "harper_authored_document"].includes(document.origin_type ?? "") ? [document.id] : [],
  });
  const pdfExport = pdfExports.get(document.id);

  if (args.input.format === "structured") {
    if (
      document.origin_type !== GENERATED_RESUME_ORIGIN ||
      !document.structured_content
    )
      throw new Error(
        "This document has no editable resume JSON. Read its text and create a new resume instead."
      );
    return {
      document: toDocumentMetadata(document, Boolean(document.extracted_text)),
      structuredContent: document.structured_content,
      revision: document.revision,
      ...(pdfExport ? { pdfExport } : {}),
    };
  }
  const content = document.extracted_text?.trim() ?? "";
  let offset = normalizeInteger(
    args.input.offset,
    0,
    0,
    Math.max(content.length, 0)
  );
  const maxChars = normalizeInteger(
    args.input.max_chars,
    DEFAULT_READ_CHARS,
    MIN_READ_CHARS,
    MAX_READ_CHARS
  );
  const query = optionalString(args.input.query);
  const matchOffset = query ? content.indexOf(query, offset) : null;
  if (matchOffset !== null && matchOffset >= 0)
    offset = Math.max(0, matchOffset - 200);
  const excerpt =
    matchOffset === -1 ? "" : content.slice(offset, offset + maxChars);
  const nextOffset = offset + excerpt.length;
  const hasMore = matchOffset !== -1 && nextOffset < content.length;

  return {
    document: toDocumentMetadata(document, content.length > 0),
    revision: document.revision,
    ...(pdfExport ? { pdfExport } : {}),
    ...(query ? { matchFound: matchOffset !== -1, matchOffset } : {}),
    excerpt,
    hasMore,
    nextOffset: hasMore ? nextOffset : null,
    offset,
    textAvailable: content.length > 0,
  };
}

export async function updateTalentDocumentForTool(args: {
  admin: TalentAdminClient;
  input: Record<string, unknown>;
  userId: string;
}) {
  const documentId = optionalString(args.input.document_id);
  if (!documentId) throw new Error("document_id is required.");

  const isRestoring = args.input.is_deleted === false;
  const document = await fetchTalentDocument({
    admin: args.admin,
    documentId,
    includeDeleted: isRestoring,
    userId: args.userId,
  });
  if (!document) throw new Error("Document not found.");
  if (document.kind !== "resume" && document.kind !== "document") {
    throw new Error("Document not found.");
  }

  const update = prepareTalentDocumentMetadataUpdate(document, args.input);
  if (Object.keys(update).length === 0)
    throw new Error("At least one document change is required.");
  if (args.input.expected_revision !== undefined && args.input.expected_revision !== document.revision)
    throw new Error("Document changed. Read the latest revision before editing.");
  const updated = await saveTalentDocumentUpdate({ ...args, document, update });
  return {
    document: toDocumentMetadata(updated, Boolean(updated.extracted_text?.trim())),
    isDeleted: updated.is_deleted,
    ok: true,
  };
}

/** Shared metadata policy for a single content + metadata write. */
export function prepareTalentDocumentMetadataUpdate(
  document: Pick<TalentDocumentRow, "kind" | "origin_type" | "origin_id" | "is_primary" | "is_deleted">,
  input: Record<string, unknown>
) {
  const update: Database["public"]["Tables"]["talent_documents"]["Update"] = {};
  if (hasOwn(input, "description")) {
    if (input.description !== null && typeof input.description !== "string")
      throw new Error("description must be text or null.");
    update.description = input.description as string | null;
  }
  const nextKind = hasOwn(input, "kind")
    ? normalizeDocumentKind(input.kind)
    : null;
  if (nextKind) update.kind = nextKind;

  for (const [inputKey, column] of [
    ["is_primary", "is_primary"],
    ["is_public", "is_public"],
    ["is_deleted", "is_deleted"],
  ] as const) {
    if (!hasOwn(input, inputKey)) continue;
    if (typeof input[inputKey] !== "boolean") {
      throw new Error(`${inputKey} must be boolean.`);
    }
    update[column] = input[inputKey];
  }

  if (
    document.origin_type === GENERATED_RESUME_ORIGIN &&
    (update.is_primary === true || (update.kind && update.kind !== "resume"))
  ) {
    throw new Error(
      "Harper-generated resumes cannot be selected as primary or changed to another kind."
    );
  }
  const effectiveKind = update.kind ?? document.kind;
  const willBeDeleted = update.is_deleted ?? document.is_deleted;
  const isGmailCareerHistory =
    document.origin_type === GMAIL_CAREER_HISTORY_ORIGIN_TYPE &&
    document.origin_id === GMAIL_CAREER_HISTORY_ORIGIN_ID;
  if (
    isGmailCareerHistory &&
    (effectiveKind !== "document" ||
      update.is_primary === true ||
      update.is_public === true)
  ) {
    throw new Error(
      "Generated Gmail history must remain a private, non-primary document."
    );
  }
  if (update.is_primary === true && effectiveKind !== "resume") {
    throw new Error("Only a resume can be selected as primary.");
  }
  if (effectiveKind !== "resume" && document.is_primary) {
    update.is_primary = false;
  }
  if (willBeDeleted) {
    update.is_primary = false;
    update.is_public = false;
  }
  if (update.is_primary === true) {
    update.is_public = true;
  }

  return update;
}

export async function saveTalentDocumentUpdate(args: {
  admin: TalentAdminClient;
  userId: string;
  input: Record<string, unknown>;
  document: TalentDocumentRow;
  update: Database["public"]["Tables"]["talent_documents"]["Update"];
}) {
  const { document, update } = args;
  let previousPrimaryId: string | null = null;
  if (update.is_primary === true) {
    const { data: previousPrimary, error: previousPrimaryError } =
      await args.admin
        .from("talent_documents")
        .select("id")
        .eq("talent_id", args.userId)
        .eq("kind", "resume")
        .eq("is_deleted", false)
        .eq("is_primary", true)
        .neq("id", document.id)
        .limit(1)
        .maybeSingle();
    if (previousPrimaryError) throw new Error(previousPrimaryError.message);
    previousPrimaryId = previousPrimary?.id ?? null;

    const { error: clearError } = await args.admin
      .from("talent_documents")
      .update({ is_primary: false, is_public: false })
      .eq("talent_id", args.userId)
      .eq("kind", "resume")
      .eq("is_deleted", false)
      .eq("is_primary", true)
      .neq("id", document.id);
    if (clearError) throw new Error(clearError.message);
  }

  const query = args.admin
    .from("talent_documents")
    .update(update)
    .eq("id", document.id)
    .eq("talent_id", args.userId)
    .eq("is_deleted", document.is_deleted)
    .eq("updated_at", document.updated_at);
  if (args.input.expected_revision !== undefined)
    query.eq("revision", args.input.expected_revision as number);
  const { data: updatedDocument, error: updateError } = await query.select("*").single();
  if (updateError || !updatedDocument) {
    if (previousPrimaryId) {
      await args.admin
        .from("talent_documents")
        .update({ is_primary: true, is_public: true })
        .eq("id", previousPrimaryId)
        .eq("talent_id", args.userId);
    }
    throw new Error(updateError?.message ?? "Failed to update document.");
  }

  const updated = updatedDocument as TalentDocumentRow;
  if (
    document.origin_type !== GENERATED_RESUME_ORIGIN &&
    ((hasOwn(args.input, "kind") && document.kind !== updated.kind) ||
      hasOwn(args.input, "is_primary") ||
      hasOwn(args.input, "is_deleted") ||
      (updated.kind === "resume" && update.extracted_text !== undefined))
  ) {
    await syncLegacyResumeFromDocuments({
      admin: args.admin,
      userId: args.userId,
    });
  }

  return updated;
}
