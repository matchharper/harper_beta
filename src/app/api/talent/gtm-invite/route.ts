import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { claimGtmCandidateMail } from "@/lib/gtmPlays/candidateMail.server";
import { parseSignupNext } from "@/lib/gtmPlays/agent/signupMove";
import { runGtmSignupMove } from "@/lib/gtmPlays/agent/signupMove.server";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({
  mailId: z.string().uuid(), locale: z.enum(["ko", "en"]).default("ko"),
  // An Ashley link's next step (#5 sign-up move); parsed and capped by parseSignupNext.
  next: z.string().max(40).optional(), posting: z.string().max(2_000).optional(), question: z.string().max(2_000).optional(),
});

/**
 * The signed-in person opened Harper from a GTM candidate mail (/career?gtm=<mail id>): the mail's posting goes
 * into their inbox. Ops /ops/gtm-plays #4 sends these mails.
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const admin = getTalentSupabaseAdmin();
    const result = await claimGtmCandidateMail({
      admin, userId: user.id, mailId: parsed.data.mailId, locale: parsed.data.locale,
      internal: isInternalDomainEmail(user.email),
    });
    await runGtmSignupMove({ admin, userId: user.id, mailId: parsed.data.mailId, next: parseSignupNext(parsed.data), locale: parsed.data.locale });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[gtm-invite] claim failed", error);
    return NextResponse.json({ error: "Could not add the posting" }, { status: 500 });
  }
}
