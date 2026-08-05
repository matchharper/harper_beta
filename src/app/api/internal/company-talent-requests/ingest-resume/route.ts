import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchActiveCompanyTalentRequest,
  finalizeRequestedResumeUpload,
} from "@/lib/companyTalentRequests/server";
import {
  TALENT_RESUME_BUCKET,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import {
  extractResumeTextContent,
  resolveTalentDocumentUpload,
  validateResumeFileContent,
} from "@/lib/talentOnboarding/documentUpload";

export const runtime = "nodejs";
export const maxDuration = 240;
export const dynamic = "force-dynamic";

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

type Attachment = {
  contentType: string;
  downloadUrl: string;
  fileName: string;
  size: number | null;
};

function normalizeAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item =
        raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const fileName = String(
        item.fileName ?? item.filename ?? item.name ?? ""
      ).trim();
      const contentType = String(
        item.contentType ?? item.content_type ?? item.mimeType ?? ""
      ).trim();
      const downloadUrl = String(
        item.downloadUrl ?? item.download_url ?? item.url ?? ""
      ).trim();
      const numericSize = Number(
        item.size ?? item.contentLength ?? item.content_length
      );
      return {
        contentType,
        downloadUrl,
        fileName,
        size:
          Number.isFinite(numericSize) && numericSize > 0 ? numericSize : null,
      };
    })
    .filter(
      (item) =>
        item.fileName.length > 0 &&
        /^https:\/\//i.test(item.downloadUrl) &&
        resolveTalentDocumentUpload({
          fileName: item.fileName,
          kind: "resume",
        }) !== null
    )
    .slice(0, 10);
}

function safeFileName(value: string) {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120) || "resume"
  );
}

async function downloadAttachment(attachment: Attachment) {
  if (attachment.size && attachment.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("resume_attachment_too_large");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(attachment.downloadUrl, {
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("resume_attachment_download_failed");
    const contentLength = Number(response.headers.get("content-length") ?? "");
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_ATTACHMENT_BYTES
    ) {
      throw new Error("resume_attachment_too_large");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Error("resume_attachment_too_large");
    }
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json()) as Record<string, unknown>;
    const requestId = String(body.requestId ?? "").trim();
    const talentId = String(body.talentId ?? "").trim();
    const requestedConversationId = String(body.conversationId ?? "").trim();
    if (!requestId || !talentId) {
      return NextResponse.json(
        { error: "requestId and talentId are required" },
        { status: 400 }
      );
    }

    const attachments = normalizeAttachments(body.attachments);
    if (attachments.length !== 1) {
      return NextResponse.json(
        {
          error:
            attachments.length === 0
              ? "supported_resume_attachment_not_found"
              : "ambiguous_resume_attachments",
          supportedAttachmentCount: attachments.length,
        },
        { status: 409 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const request = await fetchActiveCompanyTalentRequest({
      admin: admin as any,
      awaitingTalentOnly: true,
      requestId,
      talentId,
    });
    if (
      !request ||
      !request.expects_document ||
      request.workflow_status !== "awaiting_talent"
    ) {
      return NextResponse.json(
        { error: "active_resume_request_not_found" },
        { status: 409 }
      );
    }

    let conversationId = requestedConversationId || "";
    if (!conversationId) {
      const { data: existing, error: existingError } = await admin
        .from("talent_conversations")
        .select("id")
        .eq("user_id", talentId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      conversationId = existing?.id ?? "";
    }
    if (!conversationId) {
      const { data: created, error: createError } = await admin
        .from("talent_conversations")
        .insert({ user_id: talentId, stage: "chat" })
        .select("id")
        .single();
      if (createError || !created?.id) {
        throw createError ?? new Error("Failed to create conversation");
      }
      conversationId = created.id;
    }

    const attachment = attachments[0];
    const upload = resolveTalentDocumentUpload({
      fileName: attachment.fileName,
      kind: "resume",
    });
    if (!upload) {
      return NextResponse.json(
        { error: "unsupported_resume_attachment" },
        { status: 415 }
      );
    }
    const buffer = await downloadAttachment(attachment);
    if (
      !validateResumeFileContent({
        bytes: buffer,
        fileName: attachment.fileName,
        suppliedContentType: attachment.contentType,
      })
    ) {
      throw new Error("invalid_resume_attachment_signature");
    }
    const storagePath = `${talentId}/company-request/${requestId}/${randomUUID()}_${safeFileName(attachment.fileName)}`;
    const { error: uploadError } = await admin.storage
      .from(TALENT_RESUME_BUCKET)
      .upload(storagePath, buffer, {
        contentType: upload.contentType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    try {
      const result = await finalizeRequestedResumeUpload({
        admin: admin as any,
        contentType: upload.contentType,
        conversationId,
        extractedText: await extractResumeTextContent({
          bytes: buffer,
          fileName: attachment.fileName,
        }),
        fileName: attachment.fileName,
        requestId,
        sizeBytes: buffer.byteLength,
        storagePath,
        talentId,
      });
      if (result.idempotent) {
        await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
      }
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      await admin.storage.from(TALENT_RESUME_BUCKET).remove([storagePath]);
      throw error;
    }
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to ingest requested resume"
    );
  }
}
