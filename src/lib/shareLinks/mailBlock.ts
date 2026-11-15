import type { ShareLinkSnapshot } from "./shared";

/**
 * The box a candidate's mail to a company ends with: why Harper sent this person and the profile link. Code
 * appends it (the link and its words are exact content the candidate approved, not model output).
 */

const COPY = {
  ko: {
    title: (name: string) => `Harper가 ${name}님을 보내는 이유`,
    open: (name: string) => `${name}님 프로필 보기`,
    note: "가입 없이 열려요. 궁금한 점은 Harper에게 바로 물어볼 수 있어요.",
  },
  en: {
    title: (name: string) => `Why Harper sent you ${name}`,
    open: (name: string) => `See ${name}'s profile`,
    note: "Opens without an account. Ask Harper anything about the candidate there.",
  },
} as const;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] as string);

function firstName(snapshot: Pick<ShareLinkSnapshot, "name">) {
  return snapshot.name.trim() || "the candidate";
}

export function shareLinkMailText(args: { snapshot: ShareLinkSnapshot; url: string; language: "ko" | "en" }) {
  const copy = COPY[args.language];
  const name = firstName(args.snapshot);
  return [
    "",
    "—",
    copy.title(name),
    ...args.snapshot.fit.map((line) => `✓ ${line}`),
    `${copy.open(name)}: ${args.url}`,
  ].join("\n");
}

export function shareLinkMailHtml(args: { snapshot: ShareLinkSnapshot; url: string; language: "ko" | "en" }) {
  const copy = COPY[args.language];
  const name = firstName(args.snapshot);
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Noto Sans KR',sans-serif";
  const items = args.snapshot.fit.map((line) => `
        <tr><td style="padding:4px 0;font:400 14px/1.5 ${font};color:#111827;">
          <span style="color:#16a34a;font-weight:700;">✓</span>&nbsp; ${escapeHtml(line)}
        </td></tr>`).join("");
  return `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;max-width:520px;width:100%;border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;">
  <tr><td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;background:#f9fafb;border-radius:12px 12px 0 0;font:600 13px/1.4 ${font};color:#374151;">
    ${escapeHtml(copy.title(name))}
  </td></tr>
  <tr><td style="padding:14px 20px 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${items}
    </table>
    <a href="${escapeHtml(args.url)}" style="display:inline-block;margin-top:14px;padding:10px 16px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font:600 14px/1 ${font};">${escapeHtml(copy.open(name))}</a>
    <div style="margin-top:10px;font:400 12px/1.5 ${font};color:#6b7280;">${escapeHtml(copy.note)}</div>
  </td></tr>
</table>`.trim();
}
