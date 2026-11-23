import { NextRequest, NextResponse } from "next/server";
import { readGtmInviteStart } from "@/lib/gtmPlays/inviteFirstScreen.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The posting a #4 후보 메일 was about, for the first screen after sign-up (null when there is none), and where the
 * short onboarding ends (landing: "chat" for an agent's coaching mail, "opportunities" otherwise).
 */
export async function GET(request: NextRequest) {
  try {
    const { posting, landing } = await readGtmInviteStart(request.nextUrl.searchParams.get("m") ?? "");
    return NextResponse.json({ posting, landing }, { headers: NO_STORE });
  } catch (error) {
    console.error("[gtm/invite-posting]", error);
    return NextResponse.json({ posting: null, landing: "opportunities" }, { headers: NO_STORE });
  }
}
