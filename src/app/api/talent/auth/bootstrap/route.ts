import { NextRequest, NextResponse } from "next/server";
import {
  getSlackActivityDeviceLabel,
  notifySlackActivity,
} from "@/lib/slackActivity";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  getTalentSupabaseAdmin,
  markTalentUserLoggedIn,
  toTalentDisplayName,
} from "@/lib/talentOnboarding/server";
import { claimTalentNetworkInvite } from "@/lib/talentOnboarding/networkClaim";
import { parseCareerEmailOnboardingToken } from "@/lib/careerEmailOnboarding/token";

type Body = {
  emailOnboardingToken?: string;
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
    const emailOnboardingToken = String(
      body?.emailOnboardingToken ?? ""
    ).trim();
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

    let emailOnboardingClaim: {
      claimed: boolean;
      leadId: string;
      email: string;
    } | null = null;
    if (emailOnboardingToken) {
      let parsed: ReturnType<typeof parseCareerEmailOnboardingToken>;
      try {
        parsed = parseCareerEmailOnboardingToken(emailOnboardingToken, "login");
      } catch {
        return NextResponse.json(
          {
            error:
              "이메일 온보딩 링크가 만료되었거나 올바르지 않습니다. 랜딩페이지에서 다시 이메일을 남겨주세요.",
          },
          { status: 400 }
        );
      }
      const authEmail = String(user.email ?? "")
        .trim()
        .toLowerCase();
      if (!authEmail || authEmail !== parsed.email) {
        return NextResponse.json(
          {
            error:
              "이메일 온보딩 링크의 이메일과 로그인 계정의 이메일이 일치하지 않습니다.",
          },
          { status: 400 }
        );
      }

      const { data, error } = await (admin as any).rpc(
        "claim_career_email_onboarding_lead",
        {
          onboarding_lead_id: parsed.leadId,
          target_email: user.email ?? null,
          target_name: toTalentDisplayName(user),
          target_profile_picture: user.user_metadata?.avatar_url ?? null,
          target_user_id: user.id,
        }
      );
      if (error) {
        return NextResponse.json(
          {
            error:
              error.message ?? "Failed to claim career email onboarding lead",
          },
          { status: 500 }
        );
      }
      emailOnboardingClaim = {
        claimed: Boolean(data),
        email: parsed.email,
        leadId: parsed.leadId,
      };
    }

    await ensureTalentUserRecord({
      admin,
      user,
      mail: emailOnboardingClaim?.claimed ? null : mail || null,
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
            { label: "Device", value: getSlackActivityDeviceLabel(req) },
            ...(inviteToken ? [{ label: "Invite", value: "yes" }] : []),
            ...(emailOnboardingClaim?.claimed
              ? [
                  {
                    label: "Email onboarding",
                    value: emailOnboardingClaim.leadId,
                  },
                ]
              : []),
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
      emailOnboardingClaim,
      ok: true,
      userId: user.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to bootstrap talent user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
