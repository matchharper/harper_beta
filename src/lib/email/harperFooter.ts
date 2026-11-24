import { renderEmailBodyHtml } from "@/lib/email/bodyFormat";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

/** Every footer opens with a way back to Harper, above the divider, styled like a body link. */
const HARPER_CAREER_URL = new URL("/career", getConfiguredPublicSiteUrl()).href;
const HARPER_LINK_LABEL = "Harper로 이동";

export const HARPER_EMAIL_FOOTER_TEXT = `${HARPER_LINK_LABEL}: ${HARPER_CAREER_URL}

If you have any issues, feedback or want to talk to a human email chris@matchharper.com. Keep in mind that Harper is still learning, can make mistakes, and "hallucinate".

If you would like to change how often Harper emails you or stop receiving emails from him entirely, just let him know via email.`;

const HARPER_EMAIL_FOOTER_MARKER =
  "If you have any issues, feedback or want to talk to a human email";

export function buildHarperEmailFooterHtml() {
  return [
    `<p style="margin:16px 0 0 0;"><a href="${HARPER_CAREER_URL}" style="color:#2563eb;text-decoration:underline;">${HARPER_LINK_LABEL}</a></p>`,
    '<div class="harper-email-footer" style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280;">',
    '<p>If you have any issues, feedback or want to talk to a human email <a href="mailto:chris@matchharper.com" style="color:#6b7280;">chris@matchharper.com</a>. Keep in mind that Harper is still learning, can make mistakes, and &quot;hallucinate&quot;.</p>',
    "<p>If you would like to change how often Harper emails you or stop receiving emails from him entirely, just let him know via email.</p>",
    "</div>",
  ].join("");
}

export function appendHarperEmailFooterText(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return HARPER_EMAIL_FOOTER_TEXT;
  if (trimmed.includes(HARPER_EMAIL_FOOTER_MARKER)) return trimmed;
  return `${trimmed}\n\n\n${HARPER_EMAIL_FOOTER_TEXT}`;
}

export function renderEmailBodyHtmlWithHarperFooter(content: string) {
  const trimmed = content.trim();
  if (trimmed.includes(HARPER_EMAIL_FOOTER_MARKER)) {
    return renderEmailBodyHtml(trimmed);
  }

  const bodyHtml = trimmed ? renderEmailBodyHtml(trimmed) : "";
  return `${bodyHtml}${buildHarperEmailFooterHtml()}`;
}
