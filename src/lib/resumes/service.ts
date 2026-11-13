import { verifyDocumentSources } from "@/lib/documents/sources";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
import { prepareTalentDocumentMetadataUpdate } from "@/lib/talentOnboarding/documentTool";
import {
  formatCareerDocumentLink,
  getCareerDocumentHref,
} from "@/lib/career/documentLinks";
import {
  GENERATED_RESUME_ORIGIN,
  parseResumeInput,
  resumeFileName,
  structureResume,
  type StructuredResume,
} from "./schema";
import { resumePlainText } from "./template";

const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");

// Existing UUID primary key makes a retried create insert the same document.
// No filename, user-authored prose, or additional database column is involved.
export function resumeDocumentId(userId: string, requestKey: string) {
  const hex = hash(JSON.stringify(["harper-resume", userId, requestKey]));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function generateResume(args: {
  admin: TalentAdminClient;
  userId: string;
  userMessageId: string | number;
  requestId?: string;
  input: unknown;
  // The unified writer saves authorized metadata in the same content write.
  metadata?: Record<string, unknown>;
  // Application preparation supplies a canonical role name. Allocate its suffix
  // only after the idempotency read, so retries keep the already saved name.
  deduplicateName?: boolean;
}) {
  const started = Date.now();
  const input = parseResumeInput(args.input);
  const db = args.admin as unknown as SupabaseClient;
  const requestKey = hash(
    JSON.stringify(args.metadata !== undefined ? [
      "upsert_document", args.requestId ?? args.userMessageId, input.action,
      input.document_id ?? null, input.expected_revision ?? null,
      input.document_name ?? null, input.content ?? null, input.changes ?? null,
      input.target_role ?? null, input.source_document_ids ?? null, input.source_refs ?? null,
      args.metadata,
    ] : [
      args.requestId ?? args.userMessageId,
      input.action,
      input.document_id ?? null,
      input.action === "create"
        ? [
            input.target_role?.title ?? null,
            input.target_role?.company ?? null,
            input.content.language,
          ]
        : input.action === "copy"
          ? [input.document_id, input.expected_revision, input.document_name]
          : null,
    ])
  );
  const documentId =
    input.action !== "update"
      ? resumeDocumentId(args.userId, requestKey)
      : input.document_id!;
  const readCurrent = () =>
    fetchTalentDocument({
      admin: args.admin,
      userId: args.userId,
      documentId,
      includeDeleted: true,
    });
  const result = (document: TalentDocumentRow) => {
    if ((document.is_deleted && args.metadata?.is_deleted !== true) || document.origin_type !== GENERATED_RESUME_ORIGIN)
      throw new Error("The generated document is no longer available.");
    return {
      ok: true,
      documentId: document.id,
      fileName: document.file_name,
      revision: document.revision,
      ...(!document.is_deleted ? {
        href: getCareerDocumentHref(document.id),
        documentLink: formatCareerDocumentLink({ id: document.id, title: document.file_name }),
      } : {}),
      isPrivate: !document.is_public,
      ...(args.metadata ? { description: document.description ?? null, isDeleted: document.is_deleted, isPrimary: document.is_primary } : {}),
    };
  };
  const original = await readCurrent();
  if (input.action !== "update" && original) return result(original);
  const source =
    input.action === "copy"
      ? await fetchTalentDocument({
          admin: args.admin,
          userId: args.userId,
          documentId: input.document_id!,
        })
      : null;
  if (input.action === "copy") {
    if (!source || source.origin_type !== GENERATED_RESUME_ORIGIN)
      throw new Error("Generated resume to copy not found.");
    if (source.revision !== input.expected_revision)
      throw new Error(
        "Resume changed. Read its current JSON and revision before copying."
      );
  }
  if (input.action === "update") {
    if (original?.origin_type === GENERATED_RESUME_ORIGIN && original.origin_id === requestKey)
      return result(original);
    if (
      !original ||
      (original.is_deleted && args.metadata?.is_deleted !== false) ||
      original.origin_type !== GENERATED_RESUME_ORIGIN
    )
      throw new Error("Generated resume not found.");
    // Existing origin_id records the last committed edit, so a lost response can be retried.
    if (original.revision !== input.expected_revision)
      throw new Error(
        "Resume changed. Read its current JSON and revision before updating."
      );
  }
  const previous = (
    input.action === "copy"
      ? source?.structured_content
      : original?.structured_content
  ) as StructuredResume | null;
  if ((source || original) && !previous)
    throw new Error("Generated resume has no editable JSON.");
  if (previous && previous.schema_version !== 1)
    throw new Error("Unsupported resume schema version.");
  const structured = structureResume(input, previous ?? undefined);
  const metadata = prepareTalentDocumentMetadataUpdate(
    input.action === "update" ? original! : {
      kind: "resume", origin_type: GENERATED_RESUME_ORIGIN, origin_id: null,
      is_primary: false, is_deleted: false,
    },
    args.metadata ?? {},
  );
  let fileName = input.document_name
    ? resumeFileName(input.document_name)
    : original!.file_name;
  if (args.deduplicateName && input.action !== "update") {
    const base = fileName.slice(0, -4);
    for (let number = 2; ; number++) {
      const { data: existing, error } = await db
        .from("talent_documents")
        .select("id")
        .eq("talent_id", args.userId)
        .eq("is_deleted", false)
        .eq("file_name", fileName)
        .limit(1)
        .maybeSingle();
      if (error)
        throw new Error("Resume names could not be checked. Retry saving.");
      if (!existing) break;
      fileName = `${base} (${number}).pdf`;
    }
  }
  await verifyDocumentSources(args, structured);
  const discard = async (path: string) => {
    try {
      const { error } = await args.admin.storage
        .from("talent-resumes")
        .remove([path]);
      if (error)
        console.info("[ResumeGeneration]", { outcome: "file_cleanup_failed" });
    } catch {
      console.info("[ResumeGeneration]", { outcome: "file_cleanup_failed" });
    }
  };
  try {
    const fields = {
      ...(input.action === "copy" && source?.description != null ? { description: source.description } : {}),
      file_name: fileName,
      storage_path: null,
      content_type: null,
      size_bytes: null,
      content_sha256: null,
      structured_content: structured,
      extracted_text: resumePlainText(structured.content),
      origin_id: requestKey,
      is_public: input.action === "update" ? original!.is_public : false,
      is_primary: false,
      ...metadata,
    };
    // One SQL statement publishes every field. The existing primary key arbitrates creates;
    // revision + owner + deletion predicates arbitrate edits, including concurrent deletion.
    const query =
      input.action !== "update"
        ? db.from("talent_documents").insert({
            ...fields,
            id: documentId,
            talent_id: args.userId,
            kind: "resume",
            origin_type: GENERATED_RESUME_ORIGIN,
            revision: 1,
          })
        : db
            .from("talent_documents")
            .update(fields)
            .eq("id", documentId)
            .eq("talent_id", args.userId)
            .eq("origin_type", GENERATED_RESUME_ORIGIN)
            .eq("is_deleted", original!.is_deleted)
            .eq("revision", input.expected_revision!);
    const { data: saved, error: saveError } = await query
      .select("*")
      .maybeSingle();
    if (saveError || !saved) {
      const current = await readCurrent();
      if (
        current &&
        (!current.is_deleted || args.metadata?.is_deleted === true) &&
        current.origin_type === GENERATED_RESUME_ORIGIN &&
        (input.action !== "update" || current.origin_id === requestKey)
      ) {
        return result(current);
      }
      throw new Error(
        saveError
          ? "Resume could not be saved. Retry the same request to check its result."
          : "Resume changed or was deleted. Read the current document before updating.",
        saveError ? { cause: saveError } : undefined
      );
    }
    if (original?.storage_path) await discard(original.storage_path);
    console.info("[ResumeGeneration]", {
      outcome: "success",
      action: input.action,
      durationMs: Date.now() - started,
    });
    return result(saved as TalentDocumentRow);
  } catch (error) {
    // A lost response may still have committed; retry only reads this request's result.
    const current = await readCurrent().catch(() => null);
    if (
      current &&
      (!current.is_deleted || args.metadata?.is_deleted === true) &&
      current.origin_type === GENERATED_RESUME_ORIGIN &&
      current.origin_id === requestKey
    )
      return result(current);
    console.info("[ResumeGeneration]", {
      outcome: "failure",
      action: input.action,
      durationMs: Date.now() - started,
    });
    throw error;
  }
}
