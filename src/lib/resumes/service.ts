import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
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
}) {
  const started = Date.now();
  const input = parseResumeInput(args.input);
  const db = args.admin as unknown as SupabaseClient;
  const requestKey = hash(
    JSON.stringify([
      args.requestId ?? args.userMessageId,
      input.action,
      input.document_id ?? null,
      input.action === "create"
        ? [
            input.target_role?.title ?? null,
            input.target_role?.company ?? null,
            input.content.language,
          ]
        : null,
    ])
  );
  const documentId =
    input.action === "create"
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
    if (document.is_deleted || document.origin_type !== GENERATED_RESUME_ORIGIN)
      throw new Error("The generated document is no longer available.");
    return {
      ok: true,
      documentId: document.id,
      fileName: document.file_name,
      revision: document.revision,
      href: getCareerDocumentHref(document.id),
      documentLink: formatCareerDocumentLink({
        id: document.id,
        title: document.file_name,
      }),
      isPrivate: true,
    };
  };
  const original = await readCurrent();
  if (input.action === "create" && original) return result(original);
  if (input.action === "update") {
    if (
      !original ||
      original.is_deleted ||
      original.origin_type !== GENERATED_RESUME_ORIGIN
    )
      throw new Error("Generated resume not found.");
    // Existing origin_id records the last committed edit, so a lost response can be retried.
    if (original.origin_id === requestKey) return result(original);
    if (original.revision !== input.expected_revision)
      throw new Error(
        "Resume changed. Read its current JSON and revision before updating."
      );
  }
  const previous = original?.structured_content as StructuredResume | null;
  if (original && !previous)
    throw new Error("Generated resume has no editable JSON.");
  if (previous && previous.schema_version !== 1)
    throw new Error("Unsupported resume schema version.");
  const structured = structureResume(input, previous ?? undefined);
  const fileName = input.document_name
    ? resumeFileName(input.document_name)
    : original!.file_name;
  for (const documentId of structured.source_document_ids) {
    if (
      !(await fetchTalentDocument({
        admin: args.admin,
        userId: args.userId,
        documentId,
      }))
    )
      throw new Error("Reference document not found.");
  }
  // References contain identifiers only, and must belong to this authenticated user.
  for (const ref of structured.source_refs) {
    let table: string,
      owner = "talent_id",
      refId = ref.id;
    if (ref.kind === "document") table = "talent_documents";
    else if (ref.kind === "memory") table = "talent_contexts";
    else if (ref.kind === "message") {
      table = "talent_messages";
      owner = "user_id";
    } else {
      const [kind, id] = ref.id.split(":");
      const tables: Record<string, string> = {
        experience: "talent_experiences",
        education: "talent_educations",
        extra: "talent_extras",
        user: "talent_users",
      };
      table = tables[kind];
      refId = id;
      if (!table || !refId)
        throw new Error(
          "Profile reference must use experience:id, education:id, extra:id or user:id."
        );
      if (kind === "user") owner = "user_id";
    }
    const { data, error } = await db
      .from(table)
      .select(owner)
      .eq(
        table === "talent_users"
          ? "user_id"
          : ref.kind === "memory"
            ? "ref"
            : "id",
        refId
      )
      .eq(owner, args.userId)
      .maybeSingle();
    if (error || !data)
      throw new Error("Resume source reference is unavailable.");
  }
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
      file_name: fileName,
      storage_path: null,
      content_type: null,
      size_bytes: null,
      content_sha256: null,
      structured_content: structured,
      extracted_text: resumePlainText(structured.content),
      origin_id: requestKey,
      is_public: false,
      is_primary: false,
    };
    // One SQL statement publishes every field. The existing primary key arbitrates creates;
    // revision + owner + deletion predicates arbitrate edits, including concurrent deletion.
    const query =
      input.action === "create"
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
            .eq("is_deleted", false)
            .eq("revision", input.expected_revision!);
    const { data: saved, error: saveError } = await query
      .select("*")
      .maybeSingle();
    if (saveError || !saved) {
      const current = await readCurrent();
      if (
        current &&
        !current.is_deleted &&
        current.origin_type === GENERATED_RESUME_ORIGIN &&
        (input.action === "create" || current.origin_id === requestKey)
      ) {
        return result(current);
      }
      throw new Error(
        saveError
          ? "Resume could not be saved. Retry the same request to check its result."
          : "Resume changed or was deleted. Read the current document before updating."
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
      !current.is_deleted &&
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
