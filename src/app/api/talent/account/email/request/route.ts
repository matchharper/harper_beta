import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  isTalentAccountEmailUnavailableError,
  TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE,
} from "@/lib/career/accountEmailErrors";
import { sendResendEmail } from "@/lib/email/send";
import { getFreshRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  isTalentAccountEmailAvailable,
  isValidTalentAccountEmail,
  normalizeTalentAccountEmail,
} from "@/lib/talentOnboarding/accountEmail";

const EMAIL_SEND_COOLDOWN_MS = 60_000;
const DEFAULT_RETURN_PATH =
  "/career/profile?panel=settings&settingsTab=account&tab=profile";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function buildVerificationEmail(args: {
  actionLink: string;
  requestCode: string;
}) {
  const safeActionLink = escapeHtml(args.actionLink);
  const safeRequestCode = escapeHtml(args.requestCode);

  return {
    subject: `[Harper] 이메일 변경 인증 · 요청 ${args.requestCode}`,
    text: [
      "Harper 이메일 변경 인증",
      "",
      `요청 코드: ${args.requestCode}`,
      "아래 링크를 열어 새 이메일을 인증해주세요.",
      args.actionLink,
      "",
      "인증 메일을 다시 발송하면 이전 링크는 사용할 수 없습니다.",
    ].join("\n"),
    html: [
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717;max-width:560px;margin:0 auto;padding:24px;">',
      '<h2 style="margin:0 0 16px;">Harper 이메일 변경 인증</h2>',
      `<p style="margin:0 0 16px;color:#525252;">요청 코드: <strong>${safeRequestCode}</strong></p>`,
      '<p style="margin:0 0 20px;color:#525252;">아래 버튼을 눌러 새 이메일을 인증해주세요.</p>',
      `<p style="margin:0 0 20px;"><a href="${safeActionLink}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#171717;color:#fff;text-decoration:none;font-weight:600;">새 이메일 인증하기</a></p>`,
      '<p style="margin:0;color:#737373;font-size:13px;">인증 메일을 다시 발송하면 이전 링크는 사용할 수 없습니다.</p>',
      "</div>",
    ].join(""),
  };
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

    const pendingEmail = normalizeTalentAccountEmail(user.new_email);
    if (body.resend && pendingEmail !== email) {
      return NextResponse.json(
        {
          code: "EMAIL_CHANGE_REQUEST_MISSING",
          error:
            "재발송할 이메일 변경 요청을 찾지 못했습니다. 이메일을 다시 입력해주세요.",
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
          error: `${retryAfterSeconds}초 후에 인증 메일을 다시 요청해주세요.`,
          retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds) },
        }
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
            error: TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE,
          },
          { status: 409 }
        );
      }
      throw generateError ?? new Error("Failed to generate verification link");
    }

    const requestCode = randomBytes(4).toString("hex").toUpperCase();
    const emailContent = buildVerificationEmail({
      actionLink: data.properties.action_link,
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
