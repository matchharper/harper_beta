import { NextRequest, NextResponse } from "next/server";
import { notifySlackActivity } from "@/lib/slackActivity";
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

const CAREER_SIGNUP_EVENT_TYPE = "career_signup_completed";

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

    const { data: existingTalentUser, error: existingTalentUserError } =
      await admin
        .from("talent_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (existingTalentUserError) {
      return NextResponse.json(
        {
          error:
            existingTalentUserError.message ??
            "Failed to read talent user profile",
        },
        { status: 500 }
      );
    }

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

    if (!existingTalentUser) {
      const { error: logInsertError } = await admin.from("logs").insert({
        type: CAREER_SIGNUP_EVENT_TYPE,
        user_id: user.id,
      });
      if (logInsertError) {
        console.error(
          "[talent/auth/bootstrap] signup log insert error:",
          logInsertError
        );
      }

      try {
        await notifySlackActivity({
          action: "회원가입 완료",
          details: [
            { label: "Flow", value: "Career" },
            ...(inviteToken ? [{ label: "Invite", value: "yes" }] : []),
            ...(mail ? [{ label: "Mail alias", value: mail }] : []),
          ],
          user,
        });
      } catch (slackError) {
        console.error(
          "[talent/auth/bootstrap] signup slack notify error:",
          slackError
        );
      }
    }

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
