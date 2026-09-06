import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  fetchTalentCallNoteDocument,
  parseTalentCallNote,
} from "@/lib/talentOnboarding/callNote";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { documentId } = await context.params;
    const document = await fetchTalentCallNoteDocument({
      admin: getTalentSupabaseAdmin(),
      documentId,
      userId: user.id,
    });
    if (!document) {
      return NextResponse.json(
        { error: "Call note not found" },
        { status: 404 }
      );
    }

    const callNote = parseTalentCallNote(document.extracted_text);
    if (!callNote) {
      return NextResponse.json(
        { error: "Call note data is invalid" },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      document: {
        id: document.id,
        fileName: document.file_name,
        createdAt: document.created_at,
        callNote,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load call note",
      },
      { status: 500 }
    );
  }
}
