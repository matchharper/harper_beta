function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The one screen's sign-up code mail: the code first, the link as the other way in. */
export function buildOfficialJobsOneScreenCodeEmail(args: {
  code: string;
  actionLink: string;
  locale: "ko" | "en";
}) {
  const en = args.locale === "en";
  const subject = en
    ? `[Harper] Your code: ${args.code}`
    : `[Harper] 인증 코드 ${args.code}`;
  const intro = en
    ? "Enter this code on the Harper page to finish signing up."
    : "Harper 화면에 아래 코드를 넣으면 가입이 끝나요.";
  const linkLine = en
    ? "Or open this link in the same browser:"
    : "또는 같은 브라우저에서 이 링크를 열어 주세요.";
  const button = en ? "Confirm my email" : "이메일 확인하기";
  const ignore = en
    ? "If you didn't ask for this, you can ignore this mail."
    : "요청하지 않으셨다면 이 메일은 무시해 주세요.";
  const link = escapeHtml(args.actionLink);
  return {
    subject,
    text: [intro, "", args.code, "", linkLine, args.actionLink, "", ignore].join("\n"),
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f1f1f;line-height:1.6;max-width:480px">
<p>${escapeHtml(intro)}</p>
<p style="font-size:28px;font-weight:600;letter-spacing:6px;margin:16px 0">${escapeHtml(args.code)}</p>
<p style="color:#6b6b6b;font-size:13px">${escapeHtml(linkLine)}</p>
<p><a href="${link}" style="display:inline-block;padding:10px 16px;border:1px solid #d4d4d4;border-radius:6px;color:#1f1f1f;text-decoration:none">${escapeHtml(button)}</a></p>
<p style="color:#8a8a8a;font-size:12px">${escapeHtml(ignore)}</p>
</div>`,
  };
}
