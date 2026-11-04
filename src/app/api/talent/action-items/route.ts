import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { listCareerActionItems } from "@/lib/career/actionItems.server";

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const items = await listCareerActionItems({
      admin: getTalentSupabaseAdmin(),
      userId: user.id,
    });
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load visible actions" },
      { status: 503 }
    );
  }
}
