import { careerT } from "@/lib/career/translatedCareerMessage";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildVerificationEmail(args: {
  actionLink: string;
  locale?: string | null;
  requestCode: string;
}) {
  const safeActionLink = escapeHtml(args.actionLink);
  const heading = careerT(
    args.locale,
    "career.email_change.verification.heading",
    "Harper 이메일 변경 인증"
  );
  const requestCodeLine = careerT(
    args.locale,
    "career.email_change.verification.request_code",
    "요청 코드: {requestCode}",
    { values: { requestCode: args.requestCode } }
  );
  const instruction = careerT(
    args.locale,
    "career.email_change.verification.instruction",
    "아래 링크를 열어 새 이메일을 인증해주세요."
  );
  const resendNotice = careerT(
    args.locale,
    "career.email_change.verification.resend_notice",
    "인증 메일을 다시 발송하면 이전 링크는 사용할 수 없습니다."
  );
  const buttonLabel = careerT(
    args.locale,
    "career.email_change.verification.button",
    "새 이메일 인증하기"
  );

  return {
    subject: careerT(
      args.locale,
      "career.email_change.verification.subject",
      "[Harper] 이메일 변경 인증 · 요청 {requestCode}",
      { values: { requestCode: args.requestCode } }
    ),
    text: [
      heading,
      "",
      requestCodeLine,
      instruction,
      args.actionLink,
      "",
      resendNotice,
    ].join("\n"),
    html: [
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717;max-width:560px;margin:0 auto;padding:24px;">',
      `<h2 style="margin:0 0 16px;">${escapeHtml(heading)}</h2>`,
      `<p style="margin:0 0 16px;color:#525252;">${escapeHtml(requestCodeLine)}</p>`,
      `<p style="margin:0 0 20px;color:#525252;">${escapeHtml(instruction)}</p>`,
      `<p style="margin:0 0 20px;"><a href="${safeActionLink}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#171717;color:#fff;text-decoration:none;font-weight:600;">${escapeHtml(buttonLabel)}</a></p>`,
      `<p style="margin:0;color:#737373;font-size:13px;">${escapeHtml(resendNotice)}</p>`,
      "</div>",
    ].join(""),
  };
}
