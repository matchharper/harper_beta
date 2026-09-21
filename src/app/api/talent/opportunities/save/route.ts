import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { fetchTalentOpportunityHistoryByIds } from "@/lib/talentOpportunity";
import { isPostingRoleId } from "@/lib/career/postingLinks";
import { saveTalentPosting } from "@/lib/career/savePosting";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (typeof body.roleId !== "string" || !isPostingRoleId(body.roleId)) {
      return NextResponse.json({ error: "Invalid job" }, { status: 400 });
    }
    const admin = getTalentSupabaseAdmin();
    const recommendationId = await saveTalentPosting({
      admin,
      roleId: body.roleId,
      userId: user.id,
    });
    const [opportunity] = await fetchTalentOpportunityHistoryByIds({
      admin,
      ids: [recommendationId],
      locale: typeof body.locale === "string" ? body.locale : null,
      userId: user.id,
    });
    return NextResponse.json({ ok: true, opportunity });
  } catch (error) {
    if (error instanceof Error && error.message === "Job unavailable") {
      return NextResponse.json({ error: "Job unavailable" }, { status: 404 });
    }
    console.error("[career:save-job]", error);
    return NextResponse.json({ error: "Failed to save job" }, { status: 500 });
  }
}
