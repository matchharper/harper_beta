import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  TALENT_RESUME_BUCKET,
  type TalentDocumentResponse,
  type TalentDocumentRow,
} from "@/lib/talentOnboarding/models";

const TALENT_DOCUMENT_SELECT =
  "id, talent_id, kind, file_name, storage_path, content_type, size_bytes, content_sha256, extracted_text, is_public, is_primary, created_at";

export async function fetchTalentDocuments(args: {
  admin: TalentAdminClient;
  userId: string;
  kind?: string;
}) {
  const { admin, userId, kind } = args;
  let query = admin
    .from("talent_documents")
    .select(TALENT_DOCUMENT_SELECT)
    .eq("talent_id", userId)
    .order("created_at", { ascending: false });

  if (kind) {
    query = query.eq("kind", kind);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to fetch talent documents");
  }

  return (data ?? []) as TalentDocumentRow[];
}

export async function fetchTalentDocument(args: {
  admin: TalentAdminClient;
  documentId: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_documents")
    .select(TALENT_DOCUMENT_SELECT)
    .eq("id", args.documentId)
    .eq("talent_id", args.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to fetch talent document");
  }

  return (data ?? null) as TalentDocumentRow | null;
}

export async function updateTalentDocumentExtractedText(args: {
  admin: TalentAdminClient;
  documentId: string;
  extractedText: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_documents")
    .update({ extracted_text: args.extractedText })
    .eq("id", args.documentId)
    .eq("talent_id", args.userId)
    .select(TALENT_DOCUMENT_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to update talent document text");
  }

  return (data ?? null) as TalentDocumentRow | null;
}

export async function serializeTalentDocuments(args: {
  admin: TalentAdminClient;
  documents: TalentDocumentRow[];
  expiresIn?: number;
}): Promise<TalentDocumentResponse[]> {
  const { admin, documents, expiresIn = 3600 } = args;

  return Promise.all(
    documents.map(async (document) => {
      const { data } = await admin.storage
        .from(TALENT_RESUME_BUCKET)
        .createSignedUrl(document.storage_path, expiresIn);

      return {
        id: document.id,
        kind: document.kind,
        fileName: document.file_name,
        storagePath: document.storage_path,
        contentType: document.content_type,
        sizeBytes: document.size_bytes,
        isPublic: document.is_public,
        isPrimary: document.is_primary,
        createdAt: document.created_at,
        downloadUrl: data?.signedUrl ?? null,
      };
    })
  );
}

export function pickLatestResumeDocument(documents: TalentDocumentRow[]) {
  return (
    documents.find(
      (document) => document.kind === "resume" && document.is_primary
    ) ??
    documents.find((document) => document.kind === "resume") ??
    null
  );
}

export async function syncLegacyResumeFromDocuments(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const documents = await fetchTalentDocuments({
    admin: args.admin,
    userId: args.userId,
    kind: "resume",
  });
  let primaryResume = pickLatestResumeDocument(documents);

  if (primaryResume && !primaryResume.is_primary) {
    const { data, error: primaryError } = await args.admin
      .from("talent_documents")
      .update({ is_primary: true, is_public: true })
      .eq("id", primaryResume.id)
      .eq("talent_id", args.userId)
      .select(TALENT_DOCUMENT_SELECT)
      .single();
    if (primaryError) {
      throw new Error(
        primaryError.message ?? "Failed to select primary resume"
      );
    }
    primaryResume = data as TalentDocumentRow;
  }

  const { error } = await args.admin
    .from("talent_users")
    .update({
      resume_file_name: primaryResume?.file_name ?? null,
      resume_storage_path: primaryResume?.storage_path ?? null,
      resume_text: primaryResume?.extracted_text ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", args.userId);

  if (error) {
    throw new Error(error.message ?? "Failed to sync latest legacy resume");
  }

  return primaryResume;
}
