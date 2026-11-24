import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Records that a loaded Career page is open, or that the tab or browser closed it. */
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { pageId?: unknown; closed?: unknown } | null;
  const pageId = typeof body?.pageId === "string" ? body.pageId.trim() : "";
  if (!UUID.test(pageId)) return NextResponse.json({ error: "pageId (uuid) is required" }, { status: 400 });
  const { error } = await (getTalentSupabaseAdmin().rpc as any)("mark_career_page_presence_v1", {
    p_user: user.id, p_page: pageId, p_closed: body?.closed === true,
  });
  if (error) {
    console.error("[career-presence] could not record", { pageId, error: error.message });
    return NextResponse.json({ error: "Could not record" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
