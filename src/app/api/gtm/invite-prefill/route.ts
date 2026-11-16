import { NextRequest, NextResponse } from "next/server";
import { readGtmInvitePrefill } from "@/lib/gtmPlays/invitePrefill.server";
import { getRequestUser } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Signed-in only: the LinkedIn profile the person's #4 후보 메일 was sent from, to fill onboarding's 프로필 연결
 * (null when there is none, or the mail is someone else's).
 */
export async function GET(request: NextRequest) {
  const viewer = await getRequestUser(request).catch(() => null);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  try {
    const prefill = await readGtmInvitePrefill({ mailId: request.nextUrl.searchParams.get("m") ?? "", viewer });
    return NextResponse.json(prefill, { headers: NO_STORE });
  } catch (error) {
    console.error("[gtm/invite-prefill]", error);
    return NextResponse.json({ linkedinUrl: null }, { headers: NO_STORE });
  }
}
