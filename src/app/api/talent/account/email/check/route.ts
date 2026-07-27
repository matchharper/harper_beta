import { NextRequest, NextResponse } from "next/server";
import { TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE } from "@/lib/career/accountEmailErrors";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
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
    const email = normalizeTalentAccountEmail(body.email);
    if (!isValidTalentAccountEmail(email)) {
      return NextResponse.json(
        { error: "유효한 이메일을 입력해주세요." },
        { status: 400 }
      );
    }
    if (email === normalizeTalentAccountEmail(user.email)) {
      return NextResponse.json(
        { error: "현재 사용 중인 이메일과 같습니다." },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const available = await isTalentAccountEmailAvailable(admin, {
      email,
      userId: user.id,
    });
    if (!available) {
      return NextResponse.json(
        {
          code: "EMAIL_IN_USE",
          error: TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE,
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
