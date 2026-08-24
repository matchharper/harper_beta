import type { Database } from "@/types/database.types";
import type { TalentAdminClient } from "./admin";
import {
  fetchTalentDocument,
  syncLegacyResumeFromDocuments,
} from "./documentStore";
import type { TalentDocumentRow } from "./models";

type TalentDocumentMetadataRow = Pick<
  TalentDocumentRow,
  "created_at" | "file_name" | "id" | "is_primary" | "is_public" | "kind"
>;

const DOCUMENT_LIST_SELECT =
  "id, kind, file_name, is_public, is_primary, created_at";
const DOCUMENT_UPDATE_SELECT = `${DOCUMENT_LIST_SELECT}, is_deleted`;
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
    hasExtractedText,
    isPrimary: document.is_primary,
    isPublic: document.is_public,
    kind: document.kind,
  };
}

export async function listTalentDocumentsForTool(args: {
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
    .eq("is_deleted", false);
  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);
  if (error) {
    throw new Error(error.message ?? "Failed to list talent documents.");
  }

  const rows = (data ?? []) as TalentDocumentMetadataRow[];
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
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
    toDocumentMetadata(
      document,
      documentIdsWithExtractedText.has(document.id)
    )
  );
  return {
    documents,
    hasMore,
    limit,
    nextOffset: hasMore ? offset + documents.length : null,
    offset,
  };
}

export async function readTalentDocumentForTool(args: {
  admin: TalentAdminClient;
  input: Record<string, unknown>;
  userId: string;
}) {
  const documentId = optionalString(args.input.document_id);
  if (!documentId) throw new Error("document_id is required.");

  const document = await fetchTalentDocument({
    admin: args.admin,
    documentId,
    userId: args.userId,
  });
  if (!document) throw new Error("Document not found.");

  const content = document.extracted_text?.trim() ?? "";
  const offset = normalizeInteger(
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
  const excerpt = content.slice(offset, offset + maxChars);
  const nextOffset = offset + excerpt.length;
  const hasMore = nextOffset < content.length;

  return {
    document: toDocumentMetadata(document, content.length > 0),
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

  const update: Database["public"]["Tables"]["talent_documents"]["Update"] = {};
  const nextKind = hasOwn(args.input, "kind")
    ? normalizeDocumentKind(args.input.kind)
    : null;
  if (nextKind) update.kind = nextKind;

  for (const [inputKey, column] of [
    ["is_primary", "is_primary"],
    ["is_public", "is_public"],
    ["is_deleted", "is_deleted"],
  ] as const) {
    if (!hasOwn(args.input, inputKey)) continue;
    if (typeof args.input[inputKey] !== "boolean") {
      throw new Error(`${inputKey} must be boolean.`);
    }
    update[column] = args.input[inputKey];
  }

  if (Object.keys(update).length === 0) {
    throw new Error("At least one document change is required.");
  }

  const effectiveKind = update.kind ?? document.kind;
  const willBeDeleted = update.is_deleted ?? document.is_deleted;
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

  const { data: updatedDocument, error: updateError } = await args.admin
    .from("talent_documents")
    .update(update)
    .eq("id", document.id)
    .eq("talent_id", args.userId)
    .select(DOCUMENT_UPDATE_SELECT)
    .single();
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

  const updated = updatedDocument as TalentDocumentMetadataRow &
    Pick<TalentDocumentRow, "is_deleted">;
  if (
    document.kind === "resume" ||
    updated.kind === "resume" ||
    hasOwn(args.input, "is_primary") ||
    hasOwn(args.input, "is_deleted")
  ) {
    await syncLegacyResumeFromDocuments({
      admin: args.admin,
      userId: args.userId,
    });
  }

  return {
    document: toDocumentMetadata(
      updated,
      Boolean(document.extracted_text?.trim())
    ),
    isDeleted: updated.is_deleted,
    ok: true,
  };
}
