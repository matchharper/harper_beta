import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  TALENT_RESUME_BUCKET,
  ensureTalentUserRecord,
  fetchTalentDocuments,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
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
    const storagePath = `${user.id}/${Date.now()}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
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

    const previousResumes =
      kind === "resume"
        ? await fetchTalentDocuments({
            admin,
            userId: user.id,
            kind: "resume",
          })
        : [];
    const previousPrimaryResume =
      previousResumes.find((document) => document.is_primary) ??
      previousResumes[0] ??
      null;

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
            await admin.storage
              .from(TALENT_RESUME_BUCKET)
              .remove([storagePath]);
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

    const createdAt = new Date().toISOString();
    if (kind === "resume") {
      const { error: clearPrimaryError } = await admin
        .from("talent_documents")
        .update({ is_primary: false, is_public: false })
        .eq("talent_id", user.id)
        .eq("kind", "resume")
        .eq("is_primary", true);
      if (clearPrimaryError) {
        await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
        throw new Error(
          clearPrimaryError.message ?? "Failed to update primary resume"
        );
      }
    }

    const { data: document, error: documentError } = await admin
      .from("talent_documents")
      .insert({
        talent_id: user.id,
        kind,
        file_name: originalName,
        storage_path: storagePath,
        content_type: uploadConfig.contentType,
        size_bytes: file.size,
        is_public: kind === "resume",
        is_primary: kind === "resume",
        created_at: createdAt,
      })
      .select(
        "id, kind, file_name, storage_path, content_type, size_bytes, is_public, is_primary, created_at"
      )
      .single();

    if (documentError || !document) {
      if (previousPrimaryResume) {
        await admin
          .from("talent_documents")
          .update({ is_primary: true, is_public: true })
          .eq("id", previousPrimaryResume.id)
          .eq("talent_id", user.id);
      }
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

    // Only the representative resume is mirrored for legacy readers.
    const { error: legacyUpdateError } =
      kind === "resume"
        ? await admin
            .from("talent_users")
            .update({
              resume_file_name: originalName,
              resume_storage_path: storagePath,
              resume_text: null,
              updated_at: createdAt,
            })
            .eq("user_id", user.id)
        : { error: null };

    if (legacyUpdateError) {
      await admin.from("talent_documents").delete().eq("id", document.id);
      if (previousPrimaryResume) {
        await admin
          .from("talent_documents")
          .update({ is_primary: true, is_public: true })
          .eq("id", previousPrimaryResume.id)
          .eq("talent_id", user.id);
      }
      await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
      await insertTalentProfileSourceErrorLog({
        admin,
        error: legacyUpdateError,
        stage: "resume_legacy_mirror_update",
        userId,
        metadata: { documentId: document.id, storagePath },
      });
      return NextResponse.json(
        {
          error: legacyUpdateError.message ?? "Failed to update latest resume",
        },
        { status: 500 }
      );
    }

    if (kind === "resume") {
      const { error: activityError } = await admin
        .from("talent_activity_events")
        .insert({
          talent_id: user.id,
          source: "profile",
          event_type: "resume_uploaded",
          summary: "프로필에서 이력서를 업로드했습니다.",
          impact_level: "normal",
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
      storagePath,
    });

    return NextResponse.json({
      ok: true,
      resumeFileName: kind === "resume" ? originalName : null,
      resumeStoragePath: kind === "resume" ? storagePath : null,
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
