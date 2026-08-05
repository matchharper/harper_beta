import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  TALENT_RESUME_BUCKET,
  getTalentSupabaseAdmin,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";
import { ingestTalentProfileFromLinkedin } from "@/lib/talentOnboarding/profileIngestion";
import type { Json } from "@/types/database.types";

export const runtime = "nodejs";
export const maxDuration = 240;
export const dynamic = "force-dynamic";

type UntypedAdmin = TalentAdminClient & {
  from: (table: string) => any;
};

type EmailAttachment = {
  contentType: string;
  downloadUrl: string;
  fileName: string;
  id?: string;
  size: number | null;
};

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 3;
const MAX_PARSED_ATTACHMENT_TEXT = 24_000;

function toUntypedAdmin(admin: TalentAdminClient): UntypedAdmin {
  return admin as unknown as UntypedAdmin;
}

function normalizeLinks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .slice(0, 20)
    )
  );
}

function normalizeAttachments(value: unknown): EmailAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const source =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      const fileName = String(
        source.fileName ?? source.filename ?? source.name ?? ""
      ).trim();
      const contentType = String(
        source.contentType ??
          source.content_type ??
          source.mimeType ??
          source.mime_type ??
          ""
      ).trim();
      const downloadUrl = String(
        source.downloadUrl ?? source.download_url ?? source.url ?? ""
      ).trim();
      const id = String(
        source.id ?? source.attachmentId ?? source.attachment_id ?? ""
      ).trim();
      const sizeNumber = Number(
        source.size ?? source.contentLength ?? source.content_length
      );
      return {
        contentType,
        downloadUrl,
        fileName,
        id: id || undefined,
        size: Number.isFinite(sizeNumber) && sizeNumber > 0 ? sizeNumber : null,
      };
    })
    .filter(
      (item) =>
        item.fileName.length > 0 &&
        item.downloadUrl.length > 0 &&
        /^https:\/\//i.test(item.downloadUrl)
    )
    .slice(0, MAX_ATTACHMENT_COUNT);
}

function isPdfAttachment(attachment: EmailAttachment) {
  return (
    attachment.contentType.toLowerCase().includes("pdf") ||
    attachment.fileName.toLowerCase().endsWith(".pdf")
  );
}

function isTextAttachment(attachment: EmailAttachment) {
  const fileName = attachment.fileName.toLowerCase();
  const contentType = attachment.contentType.toLowerCase();
  return (
    contentType.startsWith("text/") ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md")
  );
}

function isDocxAttachment(attachment: EmailAttachment) {
  const fileName = attachment.fileName.toLowerCase();
  const contentType = attachment.contentType.toLowerCase();
  return (
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".docx")
  );
}

function isSupportedProfileAttachment(attachment: EmailAttachment) {
  return (
    isPdfAttachment(attachment) ||
    isTextAttachment(attachment) ||
    isDocxAttachment(attachment)
  );
}

function sanitizeFileName(fileName: string) {
  return (
    fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "attachment"
  );
}

async function fetchAttachmentBuffer(attachment: EmailAttachment) {
  if (attachment.size && attachment.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment is too large: ${attachment.fileName}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(attachment.downloadUrl, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Attachment download failed: ${response.status}`);
    }
    const contentLength = Number(response.headers.get("content-length") ?? "");
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_ATTACHMENT_BYTES
    ) {
      throw new Error(`Attachment is too large: ${attachment.fileName}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment is too large: ${attachment.fileName}`);
    }
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadAttachmentToStorage(args: {
  admin: TalentAdminClient;
  attachment: EmailAttachment;
  buffer: Buffer;
  userId: string;
}) {
  const safeName = sanitizeFileName(args.attachment.fileName);
  const storagePath = `${args.userId}/email-inbound/${Date.now()}_${randomUUID()}_${safeName}`;
  const { error } = await args.admin.storage
    .from(TALENT_RESUME_BUCKET)
    .upload(storagePath, args.buffer, {
      contentType: args.attachment.contentType || "application/octet-stream",
      upsert: false,
    });
  if (error) {
    throw new Error(error.message ?? "Failed to upload email attachment");
  }
  return storagePath;
}

async function extractTextFromAttachmentBuffer(
  attachment: EmailAttachment,
  buffer: Buffer
) {
  if (!isSupportedProfileAttachment(attachment)) {
    return "";
  }
  if (isTextAttachment(attachment)) {
    return buffer.toString("utf8").trim();
  }
  if (isDocxAttachment(attachment)) {
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ buffer });
    return String(parsed.value ?? "").trim();
  }
  // @ts-ignore: pdf-parse-fork does not ship module declarations.
  const pdfModule = await import("pdf-parse-fork");
  const parsePdf = pdfModule.default;
  const parsed = await parsePdf(buffer, { max: 8 });
  return String(parsed.text ?? "").trim();
}

async function processEmailAttachments(args: {
  admin: TalentAdminClient;
  attachments: EmailAttachment[];
  userId: string;
}) {
  const warnings: string[] = [];
  const texts: string[] = [];
  let resumeFileName = "";
  let resumeStoragePath = "";
  const processed: Json[] = [];

  for (const attachment of args.attachments) {
    const normalized = {
      contentType: attachment.contentType,
      fileName: attachment.fileName,
      id: attachment.id ?? null,
      size: attachment.size,
    };
    try {
      if (!isSupportedProfileAttachment(attachment)) {
        processed.push({
          ...normalized,
          extractionStatus: "unsupported",
        });
        continue;
      }
      const buffer = await fetchAttachmentBuffer(attachment);
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const storagePath = await uploadAttachmentToStorage({
        admin: args.admin,
        attachment,
        buffer,
        userId: args.userId,
      });
      const text = await extractTextFromAttachmentBuffer(attachment, buffer);
      const isPrimaryResume = !resumeStoragePath;
      let previousPrimaryResumeId: string | null = null;
      if (isPrimaryResume) {
        const { data: previousPrimary, error: previousPrimaryError } =
          await args.admin
            .from("talent_documents")
            .select("id")
            .eq("talent_id", args.userId)
            .eq("kind", "resume")
            .eq("is_primary", true)
            .maybeSingle();
        if (previousPrimaryError) {
          await args.admin.storage
            .from(TALENT_RESUME_BUCKET)
            .remove([storagePath]);
          throw new Error(previousPrimaryError.message);
        }
        previousPrimaryResumeId = previousPrimary?.id ?? null;
        const { error: clearPrimaryError } = await args.admin
          .from("talent_documents")
          .update({ is_primary: false, is_public: false })
          .eq("talent_id", args.userId)
          .eq("kind", "resume")
          .eq("is_primary", true);
        if (clearPrimaryError) {
          await args.admin.storage
            .from(TALENT_RESUME_BUCKET)
            .remove([storagePath]);
          throw new Error(
            clearPrimaryError.message ?? "Failed to clear the primary resume"
          );
        }
      }
      const { error: documentError } = await args.admin
        .from("talent_documents")
        .insert({
          talent_id: args.userId,
          kind: isPrimaryResume ? "resume" : "document",
          file_name: attachment.fileName,
          storage_path: storagePath,
          content_type: attachment.contentType || null,
          size_bytes: buffer.byteLength,
          extracted_text: text || null,
          is_public: isPrimaryResume,
          is_primary: isPrimaryResume,
        });
      if (documentError) {
        if (previousPrimaryResumeId) {
          await args.admin
            .from("talent_documents")
            .update({ is_primary: true, is_public: true })
            .eq("id", previousPrimaryResumeId)
            .eq("talent_id", args.userId);
        }
        await args.admin.storage
          .from(TALENT_RESUME_BUCKET)
          .remove([storagePath]);
        throw new Error(
          documentError.message ?? "Failed to save email attachment document"
        );
      }
      if (!resumeStoragePath) {
        resumeStoragePath = storagePath;
        resumeFileName = attachment.fileName;
      }
      processed.push({
        ...normalized,
        extractedTextChars: text.length,
        extractionStatus: text ? "ok" : "empty",
        sha256,
        storageBucket: TALENT_RESUME_BUCKET,
        storagePath,
      });
      if (!text) continue;
      texts.push(
        [`[Attachment: ${attachment.fileName}]`, text]
          .filter(Boolean)
          .join("\n")
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${attachment.fileName}: ${message}`);
      processed.push({
        ...normalized,
        error: message,
        extractionStatus: "failed",
      });
    }
  }
  return {
    processed,
    resumeFileName,
    resumeStoragePath,
    text: texts.join("\n\n").slice(0, MAX_PARSED_ATTACHMENT_TEXT),
    warnings,
  };
}

async function updateInboundEventAttachments(args: {
  admin: UntypedAdmin;
  inboundEventId: string;
  attachments: Json[];
}): Promise<string | null> {
  if (!args.inboundEventId) return null;
  const { error } = await args.admin
    .from("email_inbound_events")
    .update({
      attachments: args.attachments,
    })
    .eq("id", args.inboundEventId);
  if (error) {
    return error.message ?? "Failed to update inbound attachments";
  }
  return null;
}

async function saveResumeFileReference(args: {
  admin: UntypedAdmin;
  links?: string[];
  resumeFileName?: string;
  resumeStoragePath?: string;
  resumeText?: string;
  userId: string;
}) {
  const links = Array.from(
    new Set(
      (args.links ?? [])
        .map((link) => String(link ?? "").trim())
        .filter(Boolean)
    )
  );
  const resumeFileName = String(args.resumeFileName ?? "").trim();
  const resumeStoragePath = String(args.resumeStoragePath ?? "").trim();
  const resumeText = String(args.resumeText ?? "").trim();
  if (!links.length && !resumeFileName && !resumeStoragePath && !resumeText) {
    return false;
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (links.length > 0) {
    payload.resume_links = links;
  }
  if (resumeFileName) {
    payload.resume_file_name = resumeFileName.slice(0, 240);
  }
  if (resumeStoragePath) {
    payload.resume_storage_path = resumeStoragePath.slice(0, 2000);
  }
  if (resumeText) {
    payload.resume_text = resumeText.slice(0, MAX_PARSED_ATTACHMENT_TEXT);
  }

  if (resumeStoragePath) {
    const { error: documentError } = await args.admin
      .from("talent_documents")
      .upsert(
        {
          talent_id: args.userId,
          kind: "resume",
          file_name: resumeFileName || "resume",
          storage_path: resumeStoragePath.slice(0, 2000),
          extracted_text: resumeText
            ? resumeText.slice(0, MAX_PARSED_ATTACHMENT_TEXT)
            : null,
          is_public: true,
          is_primary: true,
        },
        { onConflict: "storage_path" }
      );
    if (documentError) {
      throw new Error(
        documentError.message ?? "Failed to save resume document"
      );
    }
  }

  const { error } = await args.admin
    .from("talent_users")
    .update(payload)
    .eq("user_id", args.userId);
  if (error) {
    throw new Error(error.message ?? "Failed to save resume file reference");
  }
  return true;
}

export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);

    const body = (await req.json().catch(() => ({}))) as {
      attachments?: unknown;
      inboundEventId?: unknown;
      leadId?: unknown;
      links?: unknown;
      resumeFileName?: unknown;
      resumeStoragePath?: unknown;
      resumeText?: unknown;
      source?: unknown;
      userId?: unknown;
    };
    const leadId = String(body.leadId ?? "").trim();
    const inboundEventId = String(body.inboundEventId ?? "").trim();
    const userId = String(body.userId ?? "").trim();
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const untyped = toUntypedAdmin(admin);
    if (leadId) {
      const { data: lead, error: leadError } = await untyped
        .from("career_email_onboarding_leads")
        .select("id, talent_id")
        .eq("id", leadId)
        .maybeSingle();
      if (leadError || !lead?.id) {
        return NextResponse.json(
          { error: leadError?.message ?? "Email onboarding lead not found" },
          { status: 404 }
        );
      }
      if (String(lead.talent_id ?? "") !== userId) {
        return NextResponse.json(
          { error: "leadId does not match userId" },
          { status: 400 }
        );
      }
    }

    const links = normalizeLinks(body.links);
    const directResumeText =
      typeof body.resumeText === "string" ? body.resumeText.trim() : "";
    const attachmentExtraction = await processEmailAttachments({
      admin,
      attachments: normalizeAttachments(body.attachments),
      userId,
    });
    const inboundAttachmentUpdateError = inboundEventId
      ? await updateInboundEventAttachments({
          admin: untyped,
          attachments: attachmentExtraction.processed,
          inboundEventId,
        })
      : null;
    const warnings = [...attachmentExtraction.warnings];
    if (inboundAttachmentUpdateError) {
      warnings.push(
        `email_inbound_events.attachments update failed: ${inboundAttachmentUpdateError}`
      );
    }
    const resumeText = [directResumeText, attachmentExtraction.text]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, MAX_PARSED_ATTACHMENT_TEXT);
    const resumeFileName =
      (typeof body.resumeFileName === "string"
        ? body.resumeFileName.trim()
        : "") || attachmentExtraction.resumeFileName;
    const resumeStoragePath =
      (typeof body.resumeStoragePath === "string"
        ? body.resumeStoragePath.trim()
        : "") || attachmentExtraction.resumeStoragePath;
    const hasLinkedin = links.some((link) => /linkedin\.com\/in\//i.test(link));
    if (!hasLinkedin && !resumeText) {
      const savedResumeFile = await saveResumeFileReference({
        admin: untyped,
        links,
        resumeFileName,
        resumeStoragePath,
        userId,
      });
      if (leadId) {
        const now = new Date().toISOString();
        await untyped
          .from("career_email_onboarding_leads")
          .update({
            profile_ingested_at: now,
          })
          .eq("id", leadId);
        await untyped.from("career_email_onboarding_events").insert({
          event_type: "profile_ingestion_skipped",
          lead_id: leadId,
          metadata: {
            reason: "no_extractable_profile_text",
            savedResumeFile,
            warnings,
          },
        });
      }
      return NextResponse.json({
        ok: false,
        skipped: "no_extractable_profile_text",
        attachments: attachmentExtraction.processed,
        savedResumeFile,
        warnings,
      });
    }

    await saveResumeFileReference({
      admin: untyped,
      links,
      resumeFileName,
      resumeStoragePath,
      resumeText,
      userId,
    });

    const result = await ingestTalentProfileFromLinkedin({
      admin,
      links,
      resumeFileName: resumeFileName || undefined,
      resumeStoragePath: resumeStoragePath || undefined,
      resumeText,
      userId,
    });

    if (leadId) {
      const now = new Date().toISOString();
      await untyped
        .from("career_email_onboarding_leads")
        .update({
          profile_ingested_at: now,
        })
        .eq("id", leadId);
      await untyped.from("career_email_onboarding_events").insert({
        event_type: "profile_ingested",
        lead_id: leadId,
        metadata: {
          linkedinUrl: result.linkedinUrl ?? null,
          stats: result.stats,
          warnings: [...(result.warnings ?? []), ...warnings],
        },
      });
    }

    return NextResponse.json({
      ok: true,
      attachmentsProcessed: attachmentExtraction.text ? true : false,
      attachments: attachmentExtraction.processed,
      linkedinUrl: result.linkedinUrl,
      stats: result.stats,
      warnings: [...(result.warnings ?? []), ...warnings],
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to ingest email profile");
  }
}
