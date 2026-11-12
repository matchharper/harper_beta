import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { fetchTalentOpportunitySearchItems } from "@/lib/talentOpportunity";

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const items = await fetchTalentOpportunitySearchItems({
      admin: getTalentSupabaseAdmin(),
      userId: user.id,
      locale: req.nextUrl.searchParams.get("locale") ?? req.cookies.get("NEXT_LOCALE")?.value,
      scope: req.nextUrl.searchParams.get("scope") === "new" ? "new" : "mine",
    });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[career:opportunity-search]", error);
    return NextResponse.json({ error: "Failed to search opportunities" }, { status: 500 });
  }
}
