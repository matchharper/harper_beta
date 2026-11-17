import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordGtmMailOpen } from "@/lib/gtmPlays/mailOpen.server";
import { getRequestUser } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

const body = z.object({ mailId: z.string().uuid() });

// Mail security scanners and link previews fetch the page; only a browser runs the page's script, and these
// still identify themselves (same rule as /api/share-links/event).
const BOT = /bot|crawler|spider|preview|scanner|curl|wget|python|headless|slackbot|facebookexternalhit/i;

/**
 * A Harper page opened from a GTM mail's button (/jobs/invite/<id>, /jobs/<slug>?gtm=<id>, /org?gtm=<id>) reports
 * that it was on screen for a second. No sign-in; a signed-in Harper staff viewer is not counted.
 */
export async function POST(request: NextRequest) {
  if (BOT.test(request.headers.get("user-agent") ?? "")) return NextResponse.json({ ok: false }, { headers: NO_STORE });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE });
  try {
    const viewer = await getRequestUser(request).catch(() => null);
    const ok = await recordGtmMailOpen({ mailId: parsed.data.mailId, viewer });
    return NextResponse.json({ ok }, { headers: NO_STORE });
  } catch (error) {
    console.error("[gtm/opened]", error);
    return NextResponse.json({ ok: false }, { headers: NO_STORE });
  }
}
