import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  fetchTalentOpportunityHistory,
  updateTalentOpportunityHistoryItem,
  type TalentOpportunityFeedback,
} from "@/lib/talentOpportunity";

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    const items = await fetchTalentOpportunityHistory({
      admin,
      userId: user.id,
    });

    return NextResponse.json({ items, ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load opportunities";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: "feedback" | "view" | "click";
      feedback?: TalentOpportunityFeedback | null;
      feedbackReason?: string | null;
      roleId?: string;
    };

    const action = body.action;
    if (action !== "feedback" && action !== "view" && action !== "click") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const roleId = String(body.roleId ?? "").trim();
    if (!roleId) {
      return NextResponse.json({ error: "roleId is required" }, { status: 400 });
    }

    if (
      action === "feedback" &&
      body.feedback !== "tracked" &&
      body.feedback !== "dont_know" &&
      body.feedback !== "not_for_me"
    ) {
      return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
    }

    const admin = getTalentSupabaseAdmin();
    const result = await updateTalentOpportunityHistoryItem({
      action,
      admin,
      feedback: body.feedback,
      feedbackReason: body.feedbackReason,
      roleId,
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update opportunity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
