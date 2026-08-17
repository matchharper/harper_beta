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
  extractResumeTextContent,
  resolveTalentDocumentUpload,
  validateResumeFileContent,
} from "@/lib/talentOnboarding/documentUpload";
import {
  fetchActiveCompanyTalentRequest,
  finalizeRequestedResumeUpload,
  verifyCompanyTalentResumeUploadToken,
} from "@/lib/companyTalentRequests/server";

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

type DocumentUpsertResult = {
  created?: boolean;
  document?: TalentDocumentRow | null;
};

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let admin: ReturnType<typeof getTalentSupabaseAdmin> | null = null;
  let userId: string | null = null;

  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const requestedKind = String(formData.get("kind") ?? "resume").trim();
    const kind = requestedKind === "document" ? "document" : "resume";
    const resumeRequestToken = String(
      formData.get("resumeRequestToken") ?? ""
    ).trim();
    const requestToken = resumeRequestToken
      ? verifyCompanyTalentResumeUploadToken(resumeRequestToken)
      : null;
    if (
      resumeRequestToken &&
      (!requestToken || requestToken.talentId !== user.id || kind !== "resume")
    ) {
      return NextResponse.json(
        { error: "Invalid or expired resume request link" },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const originalName =
      file.name?.trim() || (kind === "resume" ? "resume" : "document");
    const uploadConfig = resolveTalentDocumentUpload({
      fileName: originalName,
      kind,
    });
    if (!uploadConfig) {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 }
      );
    }
    if (file.size > MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File size must not exceed 20 MB" },
        { status: 413 }
      );
    }
    const safeName = sanitizeFileName(originalName);
    const storagePath = `${user.id}/${Date.now()}_${randomUUID()}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentSha256 = createHash("sha256").update(buffer).digest("hex");
    if (
      kind === "resume" &&
      !validateResumeFileContent({
        bytes: buffer,
        fileName: originalName,
        suppliedContentType: file.type,
      })
    ) {
      return NextResponse.json(
        { error: "File content does not match a supported resume format" },
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
          fileSize: file.size,
        },
      });
      return NextResponse.json(
        { error: uploadError.message ?? "Failed to upload document" },
        { status: 500 }
      );
    }

    if (requestToken) {
      const activeRequest = await fetchActiveCompanyTalentRequest({
        admin: admin as any,
        awaitingTalentOnly: true,
        requestId: requestToken.requestId,
        talentId: user.id,
      });
      if (!activeRequest || !activeRequest.expects_document) {
        await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
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
          sizeBytes: file.size,
          storagePath,
          talentId: user.id,
        });
      } catch (error) {
        await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
        throw error;
      }
      if (finalized.idempotent) {
        await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
      }
      const { data: requestDocument, error: requestDocumentError } = await admin
        .from("talent_documents")
        .select(
          "id, kind, file_name, storage_path, content_type, size_bytes, is_public, is_primary, created_at"
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

    const { data: upsertData, error: documentError } = await admin.rpc(
      "upsert_talent_document_by_hash_v1",
      {
        p_content_sha256: contentSha256,
        p_content_type: uploadConfig.contentType,
        p_file_name: originalName,
        p_kind: kind,
        p_size_bytes: file.size,
        p_storage_path: storagePath,
        p_talent_id: user.id,
      }
    );
    const upsertResult = upsertData as DocumentUpsertResult | null;
    const document = upsertResult?.document ?? null;

    if (documentError || !document?.id) {
      await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
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
    }

    if (kind === "resume" && upsertResult?.created !== false) {
      const { error: activityError } = await admin
        .from("talent_activity_events")
        .insert({
          talent_id: user.id,
          source: "profile",
          event_type: "resume_uploaded",
          summary: "프로필에서 이력서를 업로드했습니다.",
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
