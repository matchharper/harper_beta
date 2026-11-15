import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordShareLinkEvent } from "@/lib/shareLinks/server";
import { SHARE_LINK_CTAS } from "@/lib/shareLinks/shared";
import { getRequestUser } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

const body = z.object({
  token: z.string().min(1).max(64),
  event: z.enum(["open", "cta"]),
  cta: z.enum(SHARE_LINK_CTAS).nullish(),
});

// Mail security scanners and link previews fetch the page; only a browser runs the page's script, and these
// still identify themselves.
const BOT = /bot|crawler|spider|preview|scanner|curl|wget|python|headless|slackbot|facebookexternalhit/i;

/** /c/<token> reports that the company saw the page (open) or pressed a question button (cta). No sign-in. */
export async function POST(request: NextRequest) {
  if (BOT.test(request.headers.get("user-agent") ?? "")) return NextResponse.json({ ok: false }, { headers: NO_STORE });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const viewer = await getRequestUser(request).catch(() => null);
    const ok = await recordShareLinkEvent({ ...parsed.data, cta: parsed.data.cta ?? null, viewer });
    return NextResponse.json({ ok }, { headers: NO_STORE });
  } catch (error) {
    console.error("[share-links/event]", error);
    return NextResponse.json({ ok: false }, { headers: NO_STORE });
  }
}
