import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { fetchActiveTalentGmailIntegration } from "@/lib/integrations/gmail";
import { scheduleGmailCareerHistoryAnalysis } from "@/lib/integrations/gmailCareerHistoryQueue";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = getTalentSupabaseAdmin();
    const integration = await fetchActiveTalentGmailIntegration({
      admin,
      talentId: user.id,
    });
    if (!integration) {
      return NextResponse.json(
        { error: "An active Gmail connection is required" },
        { status: 409 }
      );
    }
    await scheduleGmailCareerHistoryAnalysis({
      admin,
      idempotencyKeySuffix: randomUUID(),
      integrationUpdatedAt: integration.updated_at,
      talentId: user.id,
    });
    return NextResponse.json({ ok: true, status: "queued" });
  } catch (error) {
    console.error("[GmailCareerHistory] enqueue failed", {
      message: error instanceof Error ? error.message : "Unknown queue error",
    });
    return NextResponse.json(
      { error: "Failed to start Gmail career history analysis" },
      { status: 500 }
    );
  }
}
