import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  claimGtmCompanyInvite,
  readGtmCompanyInviteTeaser,
  syncGtmCompanyInvite,
} from "@/lib/gtmPlays/companyInvite.server";
import { getRequestUser } from "@/lib/supabaseServer";

export const runtime = "nodejs";
// Claim drafts the Role's request (one LLM call); sync may write the candidate cards (one call per person).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim"), mailId: z.string().uuid(), workspaceId: z.string().uuid() }),
  z.object({ action: z.literal("sync"), mailId: z.string().uuid(), workspaceId: z.string().uuid() }),
]);

/** Before sign-in: which posting and how many people the mail showed (for the /org sign-in screen). */
export async function GET(request: NextRequest) {
  const mailId = request.nextUrl.searchParams.get("m") ?? "";
  try {
    const teaser = await readGtmCompanyInviteTeaser(mailId);
    return NextResponse.json({ teaser }, { headers: NO_STORE });
  } catch (error) {
    console.error("[org/gtm-invite] teaser", error);
    return NextResponse.json({ teaser: null }, { headers: NO_STORE });
  }
}

/**
 * The signed-in company person opened /org from a #2 회사 메일 (/org?gtm=<mail id>).
 * claim: make the Role from the mail's posting in their workspace and queue the mail's people for it.
 * sync: progress, and once evaluated, put those people in the Role's "연결을 요청할 후보".
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const input = parsed.data;
  try {
    if (input.action === "claim") {
      return NextResponse.json(await claimGtmCompanyInvite({ user, mailId: input.mailId, workspaceId: input.workspaceId }), { headers: NO_STORE });
    }
    const state = await syncGtmCompanyInvite({ user, mailId: input.mailId, workspaceId: input.workspaceId });
    return NextResponse.json({ state }, { headers: NO_STORE });
  } catch (error) {
    console.error(`[org/gtm-invite] ${input.action} failed`, error);
    return NextResponse.json({ error: "Could not prepare the Role" }, { status: 500 });
  }
}
