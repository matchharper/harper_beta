import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { createTalentOpportunityQuestion } from "@/lib/talentOpportunity";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      opportunityId?: string;
      question?: string;
    };

    const opportunityId = String(body.opportunityId ?? "").trim();
    if (!opportunityId) {
      return NextResponse.json(
        { error: "opportunityId is required" },
        { status: 400 }
      );
    }

    const question = String(body.question ?? "").trim();
    if (!question) {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const result = await createTalentOpportunityQuestion({
      admin,
      opportunityId,
      question,
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send question";
    const status = message === "Opportunity not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
