import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  TALENT_RESUME_BUCKET,
  ensureTalentUserRecord,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { insertTalentProfileSourceErrorLog } from "@/lib/talentOnboarding/errorLogs";
import {
  MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES,
  extractTalentDocumentTextContentBestEffort,
  extractResumeTextContent,
  inferTalentDocumentKindFromFileName,
  resolveTalentDocumentUpload,
  validateTalentDocumentFileContent,
  validateResumeFileContent,
} from "@/lib/talentOnboarding/documentUpload";
import {
  syncLegacyResumeFromDocuments,
  updateTalentDocumentExtractedText,
} from "@/lib/talentOnboarding/documentStore";
import {
  fetchActiveCompanyTalentRequest,
  finalizeRequestedResumeUpload,
  verifyCompanyTalentResumeUploadToken,
} from "@/lib/companyTalentRequests/server";

function sanitizeFileName(fileName: string) {
  return (
    fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120) || "document"
  );
}

type DocumentUpsertResult = {
  created?: boolean;
  document?: TalentDocumentRow | null;
};

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let admin: ReturnType<typeof getTalentSupabaseAdmin> | null = null;
  let userId: string | null = null;
  let cleanupStoragePath: string | null = null;
  let storageClaimed = false;

  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const originalName = file.name?.trim().slice(0, 255) || "document";
    const requestedKind = String(formData.get("kind") ?? "resume").trim();
    const isChatUpload =
      String(formData.get("source") ?? "").trim() === "chat";
    const resumeRequestToken = String(
      formData.get("resumeRequestToken") ?? ""
    ).trim();
    const suppliedContentType = file.type;
    const fileSize = file.size;

    const requestToken = resumeRequestToken
      ? verifyCompanyTalentResumeUploadToken(resumeRequestToken)
      : null;
    const kind = isChatUpload
      ? inferTalentDocumentKindFromFileName(originalName)
      : requestedKind === "document"
        ? "document"
        : "resume";
    if (
      resumeRequestToken &&
      (!requestToken || requestToken.talentId !== user.id || kind !== "resume")
    ) {
      return NextResponse.json(
        { error: "Invalid or expired resume request link" },
        { status: 400 }
      );
    }
    const uploadConfig = resolveTalentDocumentUpload({
      fileName: originalName,
      kind: isChatUpload ? "document" : kind,
    });
    if (!uploadConfig) {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 }
      );
    }
    if (fileSize > MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File size must not exceed 4 MB" },
        { status: 413 }
      );
    }
    const safeName = sanitizeFileName(originalName);
    const storagePath = `${user.id}/${Date.now()}_${randomUUID()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentSha256 = createHash("sha256").update(buffer).digest("hex");
    const validFileContent =
      isChatUpload || kind === "document"
        ? validateTalentDocumentFileContent({
            bytes: buffer,
            fileName: originalName,
            suppliedContentType,
          })
        : validateResumeFileContent({
            bytes: buffer,
            fileName: originalName,
            suppliedContentType,
          });
    if (!validFileContent) {
      return NextResponse.json(
        { error: "File content does not match a supported document format" },
        { status: 400 }
      );
    }

    admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const { error: uploadError } = await admin.storage
      .from(TALENT_RESUME_BUCKET)
      .upload(storagePath, buffer, {
        upsert: false,
        contentType: uploadConfig.contentType,
      });

    if (uploadError) {
      await insertTalentProfileSourceErrorLog({
        admin,
        error: uploadError,
        stage: "talent_document_upload",
        userId,
        metadata: {
          bucket: TALENT_RESUME_BUCKET,
          contentType: uploadConfig.contentType,
          fileName: originalName,
          fileSize,
        },
      });
      return NextResponse.json(
        { error: uploadError.message ?? "Failed to upload document" },
        { status: 500 }
      );
    }
    cleanupStoragePath = storagePath;

    if (requestToken) {
      const activeRequest = await fetchActiveCompanyTalentRequest({
        admin: admin as any,
        awaitingTalentOnly: true,
        requestId: requestToken.requestId,
        talentId: user.id,
      });
      if (!activeRequest || !activeRequest.expects_document) {
        await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
        cleanupStoragePath = null;
        return NextResponse.json(
          { error: "This resume request is no longer active" },
          { status: 409 }
        );
      }
      let conversationId = "";
      const { data: existingConversation, error: conversationError } =
        await admin
          .from("talent_conversations")
          .select("id")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
      if (conversationError) {
        await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
        throw conversationError;
      }
      if (existingConversation?.id) {
        conversationId = existingConversation.id;
      } else {
        const { data: createdConversation, error: createConversationError } =
          await admin
            .from("talent_conversations")
            .insert({ user_id: user.id, stage: "chat" })
            .select("id")
            .single();
        if (createConversationError || !createdConversation?.id) {
          await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
          throw new Error(
            createConversationError?.message ??
              "Failed to create talent conversation"
          );
        }
        conversationId = createdConversation.id;
      }
      let finalized;
      try {
        const extractedText = await extractResumeTextContent({
          bytes: buffer,
          fileName: originalName,
        });
        finalized = await finalizeRequestedResumeUpload({
          admin: admin as any,
          contentType: uploadConfig.contentType,
          conversationId,
          extractedText,
          fileName: originalName,
          requestId: activeRequest.id,
          sizeBytes: fileSize,
          storagePath,
          talentId: user.id,
        });
      } catch (error) {
        await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
        throw error;
      }
      if (finalized.idempotent) {
        await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
        cleanupStoragePath = null;
      } else {
        storageClaimed = true;
        cleanupStoragePath = null;
      }
      const { data: requestDocument, error: requestDocumentError } = await admin
        .from("talent_documents")
        .select(
          "id, kind, file_name, storage_path, content_type, size_bytes, extracted_text, is_public, is_primary, created_at"
        )
        .eq("id", finalized.documentId)
        .eq("talent_id", user.id)
        .single();
      if (requestDocumentError || !requestDocument) {
        throw new Error(
          requestDocumentError?.message ?? "Saved resume was not found"
        );
      }
      const downloadUrl = await getTalentResumeSignedUrl({
        admin,
        storagePath: requestDocument.storage_path,
      });
      return NextResponse.json({
        ok: true,
        requestCompleted: true,
        resumeFileName: requestDocument.file_name,
        resumeStoragePath: requestDocument.storage_path,
        resumeDownloadUrl: downloadUrl,
        resumeText: requestDocument.extracted_text ?? "",
        bucket: TALENT_RESUME_BUCKET,
        document: {
          id: requestDocument.id,
          kind: requestDocument.kind,
          fileName: requestDocument.file_name,
          storagePath: requestDocument.storage_path,
          contentType: requestDocument.content_type,
          sizeBytes: requestDocument.size_bytes,
          isPublic: requestDocument.is_public,
          isPrimary: requestDocument.is_primary,
          createdAt: requestDocument.created_at,
          downloadUrl,
        },
      });
    }

    let upsertResult: DocumentUpsertResult | null = null;
    let documentError: { message?: string | null } | null = null;

    if (isChatUpload) {
      const { data: existingDocument, error: existingDocumentError } =
        await admin
          .from("talent_documents")
          .select("*")
          .eq("talent_id", user.id)
          .eq("content_sha256", contentSha256)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
      if (existingDocumentError) {
        documentError = existingDocumentError;
      } else if (existingDocument) {
        upsertResult = { created: false, document: existingDocument };
      } else {
        const { data: insertedDocument, error: insertDocumentError } =
          await admin
            .from("talent_documents")
            .insert({
              content_sha256: contentSha256,
              content_type: uploadConfig.contentType,
              file_name: originalName,
              is_deleted: false,
              is_primary: false,
              is_public: false,
              kind,
              size_bytes: fileSize,
              storage_path: storagePath,
              talent_id: user.id,
            })
            .select("*")
            .single();
        documentError = insertDocumentError;
        upsertResult = insertedDocument
          ? { created: true, document: insertedDocument }
          : null;
      }
    } else {
      const { data: upsertData, error: upsertError } = await admin.rpc(
        "upsert_talent_document_by_hash_v1",
        {
          p_content_sha256: contentSha256,
          p_content_type: uploadConfig.contentType,
          p_file_name: originalName,
          p_kind: kind,
          p_size_bytes: fileSize,
          p_storage_path: storagePath,
          p_talent_id: user.id,
        }
      );
      documentError = upsertError;
      upsertResult = upsertData as DocumentUpsertResult | null;
    }

    let document = upsertResult?.document ?? null;

    if (documentError || !document?.id) {
      await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
      cleanupStoragePath = null;
      await insertTalentProfileSourceErrorLog({
        admin,
        error: documentError ?? new Error("Document row was not returned"),
        stage: "talent_document_insert",
        userId,
        metadata: { storagePath },
      });
      return NextResponse.json(
        {
          error:
            documentError?.message ?? "Failed to save uploaded document record",
        },
        { status: 500 }
      );
    }

    if (upsertResult?.created === false) {
      await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
      cleanupStoragePath = null;
    } else {
      storageClaimed = true;
      cleanupStoragePath = null;
    }

    let extractionError: unknown = null;
    const extractedText = await extractTalentDocumentTextContentBestEffort({
      bytes: buffer,
      fileName: originalName,
      maxChars: isChatUpload || kind === "document" ? 120_000 : 24_000,
      maxPdfPages: isChatUpload || kind === "document" ? 40 : 8,
      onError: (error) => {
        extractionError = error;
      },
    });
    if (extractedText) {
      const updatedDocument = await updateTalentDocumentExtractedText({
        admin,
        documentId: document.id,
        extractedText,
        userId: user.id,
      });
      if (updatedDocument) document = updatedDocument;
      if (kind === "resume" && !isChatUpload) {
        await syncLegacyResumeFromDocuments({ admin, userId: user.id });
      }
    } else if (extractionError) {
      await insertTalentProfileSourceErrorLog({
        admin,
        error: extractionError,
        stage: "talent_document_text_extraction",
        userId,
        metadata: {
          contentType: uploadConfig.contentType,
          documentId: document.id,
          fileName: originalName,
        },
      });
    }

    if (kind === "resume" && upsertResult?.created !== false) {
      const { error: activityError } = await admin
        .from("talent_activity_events")
        .insert({
          talent_id: user.id,
          source: "profile",
          event_type: "resume_uploaded",
          summary: isChatUpload
            ? "채팅에서 이력서로 분류된 파일을 업로드했습니다."
            : "프로필에서 이력서를 업로드했습니다.",
          impact_level: "medium",
          changed_domains: ["profile", "resume"],
        });
      if (activityError) {
        await insertTalentProfileSourceErrorLog({
          admin,
          error: activityError,
          stage: "resume_upload_activity_insert",
          userId,
          metadata: { documentId: document.id },
        });
      }
    }

    const documentDownloadUrl = await getTalentResumeSignedUrl({
      admin,
      storagePath: document.storage_path,
    });

    return NextResponse.json({
      ok: true,
      resumeFileName: kind === "resume" ? document.file_name : null,
      resumeStoragePath: kind === "resume" ? document.storage_path : null,
      resumeDownloadUrl: kind === "resume" ? documentDownloadUrl : null,
      resumeText: kind === "resume" ? document.extracted_text ?? "" : null,
      bucket: TALENT_RESUME_BUCKET,
      document: {
        id: document.id,
        kind: document.kind,
        fileName: document.file_name,
        storagePath: document.storage_path,
        contentType: document.content_type,
        sizeBytes: document.size_bytes,
        isPublic: document.is_public,
        isPrimary: document.is_primary,
        createdAt: document.created_at,
        downloadUrl: documentDownloadUrl,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload document";
    if (admin && cleanupStoragePath && !storageClaimed) {
      await admin.storage
        .from(TALENT_RESUME_BUCKET)
        .remove([cleanupStoragePath])
        .catch(() => undefined);
    }
    if (admin && userId) {
      await insertTalentProfileSourceErrorLog({
        admin,
        error,
        stage: "talent_document_upload_unhandled",
        userId,
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
