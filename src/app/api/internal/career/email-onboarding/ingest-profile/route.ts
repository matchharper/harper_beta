import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  getTalentSupabaseAdmin,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";
import { ingestTalentProfileFromLinkedin } from "@/lib/talentOnboarding/profileIngestion";

export const runtime = "nodejs";
export const maxDuration = 240;

type UntypedAdmin = TalentAdminClient & {
  from: (table: string) => any;
};

type EmailAttachment = {
  contentType: string;
  downloadUrl: string;
  fileName: string;
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
      const sizeNumber = Number(
        source.size ?? source.contentLength ?? source.content_length
      );
      return {
        contentType,
        downloadUrl,
        fileName,
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

async function extractTextFromAttachment(attachment: EmailAttachment) {
  if (!isPdfAttachment(attachment) && !isTextAttachment(attachment)) {
    return "";
  }
  const buffer = await fetchAttachmentBuffer(attachment);
  if (isTextAttachment(attachment)) {
    return buffer.toString("utf8").trim();
  }
  // @ts-ignore: pdf-parse-fork does not ship module declarations.
  const pdfModule = await import("pdf-parse-fork");
  const parsePdf = pdfModule.default;
  const parsed = await parsePdf(buffer, { max: 8 });
  return String(parsed.text ?? "").trim();
}

async function extractResumeTextFromAttachments(
  attachments: EmailAttachment[]
) {
  const warnings: string[] = [];
  const texts: string[] = [];
  let resumeFileName = "";
  for (const attachment of attachments) {
    try {
      const text = await extractTextFromAttachment(attachment);
      if (!text) continue;
      if (!resumeFileName) {
        resumeFileName = attachment.fileName;
      }
      texts.push(
        [`[Attachment: ${attachment.fileName}]`, text]
          .filter(Boolean)
          .join("\n")
      );
    } catch (error) {
      warnings.push(
        `${attachment.fileName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  return {
    resumeFileName,
    text: texts.join("\n\n").slice(0, MAX_PARSED_ATTACHMENT_TEXT),
    warnings,
  };
}

export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);

    const body = (await req.json().catch(() => ({}))) as {
      attachments?: unknown;
      leadId?: unknown;
      links?: unknown;
      resumeFileName?: unknown;
      resumeStoragePath?: unknown;
      resumeText?: unknown;
      userId?: unknown;
    };
    const leadId = String(body.leadId ?? "").trim();
    const userId = String(body.userId ?? "").trim();
    if (!leadId || !userId) {
      return NextResponse.json(
        { error: "leadId and userId are required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const untyped = toUntypedAdmin(admin);
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

    const links = normalizeLinks(body.links);
    const directResumeText =
      typeof body.resumeText === "string" ? body.resumeText.trim() : "";
    const attachmentExtraction = await extractResumeTextFromAttachments(
      normalizeAttachments(body.attachments)
    );
    const resumeText = [directResumeText, attachmentExtraction.text]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, MAX_PARSED_ATTACHMENT_TEXT);
    const hasLinkedin = links.some((link) => /linkedin\.com\/in\//i.test(link));
    if (!hasLinkedin && !resumeText) {
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
          warnings: attachmentExtraction.warnings,
        },
      });
      return NextResponse.json({
        ok: false,
        skipped: "no_extractable_profile_text",
        warnings: attachmentExtraction.warnings,
      });
    }

    const result = await ingestTalentProfileFromLinkedin({
      admin,
      links,
      resumeFileName:
        (typeof body.resumeFileName === "string"
          ? body.resumeFileName.trim()
          : "") ||
        attachmentExtraction.resumeFileName ||
        undefined,
      resumeStoragePath:
        typeof body.resumeStoragePath === "string"
          ? body.resumeStoragePath.trim()
          : undefined,
      resumeText,
      userId,
    });

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
        warnings: [
          ...(result.warnings ?? []),
          ...attachmentExtraction.warnings,
        ],
      },
    });

    return NextResponse.json({
      ok: true,
      attachmentsProcessed: attachmentExtraction.text ? true : false,
      linkedinUrl: result.linkedinUrl,
      stats: result.stats,
      warnings: [...(result.warnings ?? []), ...attachmentExtraction.warnings],
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to ingest email profile");
  }
}
