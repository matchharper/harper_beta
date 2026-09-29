import { RESUME_RENDER_VERSION } from "@/lib/resumes/template";
import {
  GENERATED_RESUME_ORIGIN,
  readResumeContent,
} from "@/lib/resumes/schema";
import { createHash } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import {
  GMAIL_CAREER_HISTORY_ORIGIN_ID,
  GMAIL_CAREER_HISTORY_ORIGIN_TYPE,
} from "@/lib/integrations/gmailCareerHistoryCore";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentDocument,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";

export const runtime = "nodejs";

const MAX_GMAIL_CAREER_HISTORY_CONTENT_CHARS = 50_000;

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

function isEditableGmailCareerHistory(document: {
  kind: string;
  origin_id: string | null;
  origin_type: string | null;
}) {
  return (
    document.kind === "document" &&
    document.origin_type === GMAIL_CAREER_HISTORY_ORIGIN_TYPE &&
    document.origin_id === GMAIL_CAREER_HISTORY_ORIGIN_ID
  );
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return noStoreJson({ error: "Unauthorized" }, { status: 401 });
    }

    const { documentId } = await context.params;
    const admin = getTalentSupabaseAdmin();
    const document = await fetchTalentDocument({
      admin,
      documentId: String(documentId ?? "").trim(),
      userId: user.id,
    });
    if (
      !document ||
      (document.kind !== "document" && document.kind !== "resume")
    ) {
      return noStoreJson({ error: "Document not found" }, { status: 404 });
    }

    if (document.origin_type === GENERATED_RESUME_ORIGIN) {
      try {
        const resume = readResumeContent(document.structured_content);
        console.info("[ResumeDocument]", { event: "open" });
        return noStoreJson({
          documentId: document.id,
          fileName: document.file_name,
          updatedAt: document.updated_at,
          revision: document.revision,
          format: "resume",
          resume,
          renderVersion: RESUME_RENDER_VERSION,
        });
      } catch {
        // Preserve read access to legacy documents with unavailable editable JSON.
        if (!document.storage_path)
          return noStoreJson(
            { error: "Resume content unavailable" },
            { status: 422 }
          );
      }
      if (!document.storage_path)
        return noStoreJson({ error: "PDF unavailable" }, { status: 404 });
      const [preview, download] = await Promise.all([
        admin.storage
          .from("talent-resumes")
          .createSignedUrl(document.storage_path, 900),
        admin.storage
          .from("talent-resumes")
          .createSignedUrl(document.storage_path, 900, {
            download: document.file_name,
          }),
      ]);
      if (preview.error || download.error)
        throw new Error("PDF URL unavailable");
      console.info("[ResumeDocument]", { event: "open" });
      return noStoreJson({
        documentId: document.id,
        fileName: document.file_name,
        updatedAt: document.updated_at,
        revision: document.revision,
        format: "pdf",
        previewUrl: preview.data.signedUrl,
        downloadUrl: download.data.signedUrl,
      });
    }
    return noStoreJson({
      content: document.extracted_text ?? "",
      documentId: document.id,
      fileName: document.file_name,
      updatedAt: document.updated_at,
    });
  } catch (error) {
    console.error("[TalentDocumentContent] failed to load", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return noStoreJson(
      { error: "Failed to load document content" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return noStoreJson({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      content?: unknown;
      expectedUpdatedAt?: unknown;
    };
    if (typeof body.content !== "string") {
      return noStoreJson({ error: "content is required" }, { status: 400 });
    }
    if (!body.content.trim()) {
      return noStoreJson(
        { error: "Document content cannot be empty" },
        { status: 400 }
      );
    }
    if (body.content.length > MAX_GMAIL_CAREER_HISTORY_CONTENT_CHARS) {
      return noStoreJson(
        {
          error: `Document content must be ${MAX_GMAIL_CAREER_HISTORY_CONTENT_CHARS} characters or fewer`,
        },
        { status: 400 }
      );
    }
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string"
        ? body.expectedUpdatedAt.trim()
        : "";
    if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) {
      return noStoreJson(
        { error: "expectedUpdatedAt is required" },
        { status: 400 }
      );
    }

    const { documentId } = await context.params;
    const admin = getTalentSupabaseAdmin();
    const document = await fetchTalentDocument({
      admin,
      documentId: String(documentId ?? "").trim(),
      userId: user.id,
    });
    if (!document || !isEditableGmailCareerHistory(document)) {
      return noStoreJson({ error: "Document not found" }, { status: 404 });
    }

    const bytes = Buffer.from(body.content, "utf8");
    const contentSha256 = createHash("sha256").update(bytes).digest("hex");
    const updatedAt = new Date().toISOString();
    const { data: updatedDocument, error: updateError } = await admin
      .from("talent_documents")
      .update({
        content_sha256: contentSha256,
        content_type: "text/markdown",
        extracted_text: body.content,
        is_primary: false,
        is_public: false,
        kind: "document",
        size_bytes: bytes.byteLength,
        storage_path: null,
        updated_at: updatedAt,
      })
      .eq("id", document.id)
      .eq("talent_id", user.id)
      .eq("origin_type", GMAIL_CAREER_HISTORY_ORIGIN_TYPE)
      .eq("origin_id", GMAIL_CAREER_HISTORY_ORIGIN_ID)
      .eq("is_deleted", false)
      .eq("updated_at", expectedUpdatedAt)
      .select("id,updated_at")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updatedDocument) {
      return noStoreJson(
        {
          error:
            "This document changed after you opened it. Reload it before saving.",
        },
        { status: 409 }
      );
    }

    return noStoreJson({
      documentId: updatedDocument.id,
      ok: true,
      updatedAt: updatedDocument.updated_at,
    });
  } catch (error) {
    console.error("[TalentDocumentContent] failed to update", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return noStoreJson(
      { error: "Failed to update document content" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const user = await getRequestUser(req);
  if (!user) return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  const { documentId } = await context.params;
  const document = await fetchTalentDocument({
    admin: getTalentSupabaseAdmin(),
    userId: user.id,
    documentId,
  });
  if (!document || document.origin_type !== GENERATED_RESUME_ORIGIN)
    return noStoreJson({ error: "Document not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (
    body?.event !== "preview" ||
    !Number.isSafeInteger(body.pageCount) ||
    body.pageCount < 1 ||
    body.pageCount > 1000 ||
    !Number.isFinite(body.durationMs) ||
    body.durationMs < 0 ||
    body.durationMs > 120_000
  )
    return noStoreJson({ error: "Invalid preview event" }, { status: 400 });
  console.info("[ResumeDocument]", {
    event: "preview",
    pageCount: body.pageCount,
    durationMs: Math.round(body.durationMs),
  });
  return noStoreJson({ ok: true });
}
