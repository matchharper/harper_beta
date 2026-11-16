import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { claimShareLink, readShareLinkTeaser } from "@/lib/shareLinks/server";
import { SHARE_LINK_CTAS } from "@/lib/shareLinks/shared";
import { getRequestUser } from "@/lib/supabaseServer";

export const runtime = "nodejs";
// A new Role's request and criteria are drafted from the posting (one model call).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

const body = z.object({
  token: z.string().min(1).max(64),
  workspaceId: z.string().uuid(),
  cta: z.enum(SHARE_LINK_CTAS).nullish(),
});

/** Before sign-in: whose profile and which posting the link is about (for the /org sign-in screen). */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  try {
    return NextResponse.json({ teaser: await readShareLinkTeaser(token) }, { headers: NO_STORE });
  } catch (error) {
    console.error("[org/share-link] teaser", error);
    return NextResponse.json({ teaser: null }, { headers: NO_STORE });
  }
}

/**
 * The signed-in company person opened /org from a 후보자 링크 (/org?share=<token>): the posting's Role in
 * their workspace with the candidate on it.
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const result = await claimShareLink({ user, ...parsed.data, cta: parsed.data.cta ?? null });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    console.error("[org/share-link] claim failed", error);
    return NextResponse.json({ error: "Could not prepare the Role" }, { status: 500 });
  }
}
