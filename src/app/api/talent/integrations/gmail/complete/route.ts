import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  getComposioAccountStatus,
  getComposioConnectedAccount,
  isOwnedComposioGmailAccount,
} from "@/lib/integrations/composio";
import { upsertTalentGmailIntegration } from "@/lib/integrations/gmail";
import { scheduleGmailCareerHistoryAnalysis } from "@/lib/integrations/gmailCareerHistoryQueue";

export const runtime = "nodejs";
export const maxDuration = 300;

type CompleteBody = {
  connectedAccountId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as CompleteBody;
    const connectedAccountId = String(body.connectedAccountId ?? "").trim();
    if (!connectedAccountId) {
      return NextResponse.json(
        { error: "connectedAccountId is required" },
        { status: 400 }
      );
    }

    const account = await getComposioConnectedAccount(connectedAccountId);
    if (!isOwnedComposioGmailAccount(account, user.id)) {
      return NextResponse.json(
        { error: "Gmail connection could not be verified" },
        { status: 403 }
      );
    }
    if (getComposioAccountStatus(account) !== "ACTIVE") {
      return NextResponse.json(
        { error: "Gmail connection is not active" },
        { status: 409 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const integration = await upsertTalentGmailIntegration({
      admin,
      connectedAccountId,
      talentId: user.id,
    });

    let analysis: "queued" | "enqueue_failed" = "queued";
    try {
      await scheduleGmailCareerHistoryAnalysis({
        admin,
        integrationUpdatedAt: integration.updated_at,
        talentId: user.id,
      });
    } catch (error) {
      analysis = "enqueue_failed";
      console.error("[GmailConnect] career history enqueue failed", {
        message: error instanceof Error ? error.message : "Unknown queue error",
      });
    }

    return NextResponse.json({
      analysis,
      connected: true,
      ok: true,
      status: "active",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to complete Gmail connection" },
      { status: 500 }
    );
  }
}
