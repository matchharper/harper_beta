import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  isTalentAccountEmailAvailable,
  isValidTalentAccountEmail,
  normalizeTalentAccountEmail,
} from "@/lib/talentOnboarding/accountEmail";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const admin = getTalentSupabaseAdmin();
    const talentSetting = await fetchTalentSetting({ admin, userId: user.id });
    const responseLocale =
      talentSetting?.preferred_locale ??
      req.cookies.get("NEXT_LOCALE")?.value ??
      null;
    const email = normalizeTalentAccountEmail(body.email);
    if (!isValidTalentAccountEmail(email)) {
      return NextResponse.json(
        {
          error: careerT(
            responseLocale,
            "career.settings.email_change.invalid",
            "유효한 이메일을 입력해주세요."
          ),
        },
        { status: 400 }
      );
    }
    if (email === normalizeTalentAccountEmail(user.email)) {
      return NextResponse.json(
        {
          error: careerT(
            responseLocale,
            "career.settings.email_change.same_email",
            "현재 사용 중인 이메일과 같습니다."
          ),
        },
        { status: 400 }
      );
    }

    const available = await isTalentAccountEmailAvailable(admin, {
      email,
      userId: user.id,
    });
    if (!available) {
      return NextResponse.json(
        {
          code: "EMAIL_IN_USE",
          error: careerT(
            responseLocale,
            "career.settings.email_change.in_use",
            "해당 이메일로 진행할 수 없습니다. 사유: 인증이 차단된 이메일 혹은 이미 등록된 이메일"
          ),
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ available: true, ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to check email availability";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
