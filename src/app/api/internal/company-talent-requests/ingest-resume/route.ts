import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { finalizeEmailedCompanyTalentResumeRelay } from "@/lib/companyTalentRequests/server";
import {
  TALENT_RESUME_BUCKET,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import {
  extractResumeTextContentBestEffort,
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
    const relayContent = String(body.relayContent ?? "").trim();
    const sourceMessageId = Number(body.sourceMessageId);
    if (!requestId || !talentId || !Number.isSafeInteger(sourceMessageId)) {
      return NextResponse.json(
        { error: "requestId, talentId, and sourceMessageId are required" },
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
    const { data: request, error: requestError } = await (
      admin.from("company_talent_requests" as any) as any
    )
      .select(
        "id,contact_kind,expects_document,deliveries:contact_queue(type,status,sent_at)"
      )
      .eq("id", requestId)
      .eq("talent_id", talentId)
      .maybeSingle();
    if (requestError) throw requestError;
    const candidateContactWasSent = Array.isArray(request?.deliveries)
      ? request.deliveries.some(
          (delivery: Record<string, unknown>) =>
            delivery.type === "company_request_candidate_delivery" &&
            delivery.status === "sent" &&
            Boolean(delivery.sent_at)
        )
      : false;
    if (
      !request ||
      request.contact_kind !== "resume" ||
      request.expects_document !== true ||
      !candidateContactWasSent
    ) {
      return NextResponse.json(
        { error: "relayable_resume_contact_not_found" },
        { status: 409 }
      );
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
      const result = await finalizeEmailedCompanyTalentResumeRelay({
        admin: admin as any,
        contentType: upload.contentType,
        extractedText: await extractResumeTextContentBestEffort({
          bytes: buffer,
          fileName: attachment.fileName,
          onError: (error) => {
            console.warn(
              "[company-talent-resume] text extraction failed; preserving valid upload",
              {
                error: error instanceof Error ? error.message : String(error),
                requestId,
                talentId,
              }
            );
          },
        }),
        fileName: attachment.fileName,
        relayContent,
        requestId,
        sizeBytes: buffer.byteLength,
        sourceMessageId,
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
