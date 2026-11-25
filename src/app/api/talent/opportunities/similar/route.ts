import { NextRequest, NextResponse } from "next/server";
import { isPostingRoleId } from "@/lib/career/postingLinks";
import { fetchSimilarOpportunities } from "@/lib/career/similarOpportunities.server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const params = req.nextUrl.searchParams;
    const targetId = params.get("id") ?? "";
    const targetKind = params.get("kind") === "company" ? "company" : "role";
    if (!isPostingRoleId(targetId))
      return NextResponse.json({ error: "Invalid opportunity" }, { status: 400 });
    const items = await fetchSimilarOpportunities({
      admin: getTalentSupabaseAdmin(),
      locale:
        params.get("locale") ?? req.cookies.get("NEXT_LOCALE")?.value ?? null,
      targetId,
      targetKind,
      userId: user.id,
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[career:similar-opportunities]", error);
    return NextResponse.json(
      { error: "Failed to load similar opportunities" },
      { status: 500 }
    );
  }
}
