import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  getTalentSupabaseAdmin,
  markTalentUserLoggedIn,
} from "@/lib/talentOnboarding/server";
import { claimTalentNetworkInvite } from "@/lib/talentOnboarding/networkClaim";

type Body = {
  inviteToken?: string;
  mail?: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const inviteToken = String(body?.inviteToken ?? "").trim();
    const mail = String(body?.mail ?? "").trim();
    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({
      admin,
      user,
      mail: mail || null,
    });
    const claim =
      inviteToken.length > 0
        ? await claimTalentNetworkInvite({
            admin,
            inviteToken,
            user,
          })
        : null;
    await markTalentUserLoggedIn({
      admin,
      userId: user.id,
    });

    return NextResponse.json({
      claim,
      ok: true,
      userId: user.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to bootstrap talent user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
