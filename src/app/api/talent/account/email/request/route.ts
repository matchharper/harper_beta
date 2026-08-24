import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isTalentAccountEmailUnavailableError } from "@/lib/career/accountEmailErrors";
import { sendResendEmail } from "@/lib/email/send";
import { getFreshRequestUser } from "@/lib/supabaseServer";
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
import { buildVerificationEmail } from "./verificationEmail";

const EMAIL_SEND_COOLDOWN_MS = 60_000;
const DEFAULT_RETURN_PATH =
  "/career/profile?panel=settings&settingsTab=account&tab=profile";

function sanitizeReturnPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/career")) {
    return DEFAULT_RETURN_PATH;
  }

  try {
    const baseUrl = new URL("https://return-path.invalid");
    const parsed = new URL(value, baseUrl);
    const isCareerPath =
      parsed.pathname === "/career" || parsed.pathname.startsWith("/career/");
    if (parsed.origin !== baseUrl.origin || !isCareerPath) {
      return DEFAULT_RETURN_PATH;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getFreshRequestUser(req);
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      resend?: boolean;
      returnPath?: string;
    };
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

    const pendingEmail = normalizeTalentAccountEmail(user.new_email);
    if (body.resend && pendingEmail !== email) {
      return NextResponse.json(
        {
          code: "EMAIL_CHANGE_REQUEST_MISSING",
          error: careerT(
            responseLocale,
            "career.api.email_change.request_missing",
            "재발송할 이메일 변경 요청을 찾지 못했습니다. 이메일을 다시 입력해주세요."
          ),
        },
        { status: 409 }
      );
    }

    const lastSentAt = user.email_change_sent_at
      ? new Date(user.email_change_sent_at).getTime()
      : Number.NaN;
    const retryAfterMs = Number.isFinite(lastSentAt)
      ? EMAIL_SEND_COOLDOWN_MS - (Date.now() - lastSentAt)
      : 0;
    if (retryAfterMs > 0) {
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      return NextResponse.json(
        {
          code: "EMAIL_RATE_LIMIT",
          error: careerT(
            responseLocale,
            "career.api.email_change.rate_limit",
            "{retryAfterSeconds}초 후에 인증 메일을 다시 요청해주세요.",
            { values: { retryAfterSeconds } }
          ),
          retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds) },
        }
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

    const callbackUrl = new URL("/auths/callback", req.nextUrl.origin);
    callbackUrl.searchParams.set("flow", "career_email_change");
    callbackUrl.searchParams.set("next", sanitizeReturnPath(body.returnPath));

    const { data, error: generateError } = await admin.auth.admin.generateLink({
      type: "email_change_new",
      email: normalizeTalentAccountEmail(user.email),
      newEmail: email,
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });
    if (generateError || !data.properties?.action_link) {
      if (isTalentAccountEmailUnavailableError(generateError)) {
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
      throw generateError ?? new Error("Failed to generate verification link");
    }

    const requestCode = randomBytes(4).toString("hex").toUpperCase();
    const emailContent = buildVerificationEmail({
      actionLink: data.properties.action_link,
      locale: responseLocale,
      requestCode,
    });
    await sendResendEmail({
      to: email,
      ...emailContent,
      idempotencyKey: `career-email-change-${user.id}-${requestCode}`,
    });

    return NextResponse.json({
      ok: true,
      pendingEmail: email,
      requestCode,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to send email verification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
