import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentDocument,
  fetchTalentDocuments,
  getTalentSupabaseAdmin,
  serializeTalentDocuments,
  syncLegacyResumeFromDocuments,
} from "@/lib/talentOnboarding/server";
import { insertTalentProfileSourceErrorLog } from "@/lib/talentOnboarding/errorLogs";
import {
  GMAIL_CAREER_HISTORY_ORIGIN_ID,
  GMAIL_CAREER_HISTORY_ORIGIN_TYPE,
} from "@/lib/integrations/gmailCareerHistoryCore";

export const runtime = "nodejs";

async function listDocuments(userId: string) {
  const admin = getTalentSupabaseAdmin();
  const documents = await fetchTalentDocuments({ admin, userId });
  return serializeTalentDocuments({ admin, documents });
}

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      documents: await listDocuments(user.id),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch documents",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const admin = getTalentSupabaseAdmin();
  let userId: string | null = null;

  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    const body = (await req.json().catch(() => ({}))) as {
      documentId?: string;
      fileName?: string;
      isPrimary?: boolean;
      isPublic?: boolean;
    };
    const documentId = String(body.documentId ?? "").trim();
    if (!documentId) {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 }
      );
    }

    const document = await fetchTalentDocument({ admin, documentId, userId });
    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const update: {
      file_name?: string;
      is_primary?: boolean;
      is_public?: boolean;
    } = {};
    const isGmailCareerHistory =
      document.origin_type === GMAIL_CAREER_HISTORY_ORIGIN_TYPE &&
      document.origin_id === GMAIL_CAREER_HISTORY_ORIGIN_ID;

    if (body.fileName !== undefined) {
      const fileName = String(body.fileName).trim().slice(0, 255);
      if (!fileName) {
        return NextResponse.json(
          { error: "fileName cannot be empty" },
          { status: 400 }
        );
      }
      update.file_name = fileName;
    }

    if (body.isPublic !== undefined) {
      if (isGmailCareerHistory) {
        return NextResponse.json(
          { error: "Generated Gmail history must remain private" },
          { status: 400 }
        );
      }
      if (document.kind !== "document") {
        return NextResponse.json(
          { error: "Only general documents can change visibility" },
          { status: 400 }
        );
      }
      update.is_public = Boolean(body.isPublic);
    }

    let previousPrimaryId: string | null = null;
    if (body.isPrimary === true) {
      if (document.kind !== "resume") {
        return NextResponse.json(
          { error: "Only resumes can be selected as primary" },
          { status: 400 }
        );
      }
      const resumes = await fetchTalentDocuments({
        admin,
        userId,
        kind: "resume",
      });
      previousPrimaryId =
        resumes.find((resume) => resume.is_primary)?.id ?? null;
      const { error: clearError } = await admin
        .from("talent_documents")
        .update({ is_primary: false, is_public: false })
        .eq("talent_id", userId)
        .eq("kind", "resume")
        .eq("is_deleted", false)
        .eq("is_primary", true);
      if (clearError) throw new Error(clearError.message);
      update.is_primary = true;
      update.is_public = true;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No document changes were provided" },
        { status: 400 }
      );
    }

    const { error: updateError } = await admin
      .from("talent_documents")
      .update(update)
      .eq("id", document.id)
      .eq("talent_id", userId)
      .eq("is_deleted", false);
    if (updateError) {
      if (previousPrimaryId) {
        await admin
          .from("talent_documents")
          .update({ is_primary: true, is_public: true })
          .eq("id", previousPrimaryId)
          .eq("talent_id", userId);
      }
      throw new Error(updateError.message);
    }

    if (document.kind === "resume" && (body.isPrimary || body.fileName)) {
      await syncLegacyResumeFromDocuments({ admin, userId });
    }

    return NextResponse.json({
      ok: true,
      documents: await listDocuments(userId),
    });
  } catch (error) {
    if (userId) {
      await insertTalentProfileSourceErrorLog({
        admin,
        error,
        stage: "talent_document_update",
        userId,
      });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update document",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const admin = getTalentSupabaseAdmin();
  let userId: string | null = null;

  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    const body = (await req.json().catch(() => ({}))) as {
      documentId?: string;
    };
    const documentId = String(body.documentId ?? "").trim();
    if (!documentId) {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 }
      );
    }

    const document = await fetchTalentDocument({
      admin,
      documentId,
      userId,
    });
    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const { error: deleteError } = await admin
      .from("talent_documents")
      .update({
        is_deleted: true,
        is_primary: false,
        is_public: false,
      })
      .eq("id", document.id)
      .eq("talent_id", userId)
      .eq("is_deleted", false);
    if (deleteError) {
      throw new Error(deleteError.message ?? "Failed to delete document");
    }

    if (document.kind === "resume") {
      await syncLegacyResumeFromDocuments({ admin, userId });
    }

    return NextResponse.json({
      ok: true,
      documents: await listDocuments(userId),
    });
  } catch (error) {
    if (userId) {
      await insertTalentProfileSourceErrorLog({
        admin,
        error,
        stage: "talent_document_delete",
        userId,
      });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete document",
      },
      { status: 500 }
    );
  }
}
