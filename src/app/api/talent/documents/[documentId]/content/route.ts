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
    if (!document || !isEditableGmailCareerHistory(document)) {
      return noStoreJson({ error: "Document not found" }, { status: 404 });
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
