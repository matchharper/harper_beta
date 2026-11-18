/**
 * #5: why each proposed posting fits, in the same frame as the 후보자 링크 mail to companies (Shaun 11/17): what the
 * company needs now → the person's own experience that meets it → so the two fit. One summary sentence and up to
 * three "필요 → 경험" lines per posting, shown in the mail as an ordinary bulleted list (Shaun 11/17: like a normal
 * mail, not boxes) and on the invite page.
 * Pure: cleaning the model's words and rendering them.
 */
import { mailPlainText } from "./mailRules";
import type { AgentPosting } from "./types";

export type PostingFrame = { summary: string; fit: string[] };

const MAX_SUMMARY = 220;
const MAX_LINE = 90;
const MAX_LINES = 3;

/**
 * Model words as plain text: no links, markdown, HTML or emphasis (a scraped page must never put a link into a mail),
 * one line, cut to `max`.
 */
export function plainFrameText(value: unknown, max: number): string {
  const text = String(value ?? "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
    .replace(/\b[a-z0-9.-]+\.(?:com|net|org|io|ai|co|kr|dev|app|me)(?:\/\S*)?\b/gi, " ")
    .replace(/[*_`#>|~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("요"), cut.lastIndexOf(" "));
  return `${(stop > max * 0.6 ? cut.slice(0, stop + 1) : cut).trim()}…`;
}

/** A written frame, cleaned: the summary falls back to the picker's why; fit lines keep the "A → B" shape. */
export function cleanPostingFrame(raw: { summary?: unknown; fit?: unknown } | null | undefined, fallback: string): PostingFrame {
  const summary = plainFrameText(raw?.summary, MAX_SUMMARY) || plainFrameText(fallback, MAX_SUMMARY);
  const fit = (Array.isArray(raw?.fit) ? raw.fit : [])
    .map((line) => plainFrameText(String(line ?? "").replace(/->|=>|⇒/g, "→"), MAX_LINE).replace(/\s*→\s*/g, " → "))
    .filter((line) => / → /.test(line) && line.split(" → ").every((side) => side.trim().length >= 2))
    .slice(0, MAX_LINES);
  return { summary, fit };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] as string);

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Noto Sans KR',sans-serif";

// Every word in the box is plain text, whatever was stored (a page's or the model's links never reach the mail).
/** The separator in a role line: a full-height line (U+2502) reads clearer than "|" in mail fonts (Shaun 11/17). */
const SEP = "\u2502";

const METRO = new Set(["서울", "부산", "인천", "대구", "광주", "대전", "울산", "세종"]);
const PROVINCE = new Set(["경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]);

/**
 * A place as one short word (Shaun 11/17: "회사 | 직함 | 서울"): a metropolitan city as itself ("서울 강남구" →
 * "서울"), a city in a province by its name ("경기 성남시" → "성남"), an English place by its first part.
 */
export function shortPlace(location: string | null | undefined): string {
  const text = plainFrameText(location, 80);
  if (!text) return "";
  const words = text.split(/[\s,/]+/).filter(Boolean);
  const first = words[0]?.replace(/(?:특별시|광역시|특별자치시|특별자치도|도)$/, "") ?? "";
  if (METRO.has(first)) return first;
  if (PROVINCE.has(first) && words[1]) return words[1].replace(/(?:시|군)$/, "") || words[1];
  if (/[가-힣]/.test(text)) return words[0];
  return text.split(",")[0].trim();
}

type Named = Pick<AgentPosting, "companyName" | "title"> & Partial<Pick<AgentPosting, "mailCompany" | "mailTitle">>;

/** The company and title the mail shows: the English names an English mail's writer gave, else as written. */
export const mailNames = (posting: Named) => ({
  company: posting.mailCompany?.trim() || posting.companyName,
  title: posting.mailTitle?.trim() || posting.title,
});

const headOf = (posting: Named & Pick<AgentPosting, "location">) => {
  const names = mailNames(posting);
  return [plainFrameText(names.company, 120), plainFrameText(names.title, 160), shortPlace(posting.location)].filter(Boolean).join(` ${SEP} `);
};
const summaryOf = (posting: Pick<AgentPosting, "why" | "summary">) =>
  plainFrameText(posting.summary, MAX_SUMMARY) || plainFrameText(posting.why, MAX_SUMMARY);
const fitOf = (posting: Pick<AgentPosting, "fit">) =>
  (posting.fit ?? []).map((line) => plainFrameText(line, MAX_LINE)).filter(Boolean).slice(0, MAX_LINES);

/** One posting as the 후보자 링크 box: a gray header (company · title (place)), the summary, then ✓ need → experience. */
export function postingBoxHtml(posting: Pick<AgentPosting, "companyName" | "title" | "location" | "why" | "summary" | "fit">): string {
  const summary = summaryOf(posting);
  const items = fitOf(posting).map((line) => `
        <tr><td style="padding:3px 0;font:400 14px/1.5 ${FONT};color:#111827;">
          <span style="color:#16a34a;font-weight:700;">✓</span>&nbsp; ${escapeHtml(line)}
        </td></tr>`).join("");
  return `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;max-width:560px;width:100%;border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;">
  <tr><td style="padding:12px 18px;border-bottom:1px solid #e5e7eb;background:#f9fafb;border-radius:12px 12px 0 0;font:600 14px/1.4 ${FONT};color:#111827;">
    ${escapeHtml(headOf(posting))}
  </td></tr>
  <tr><td style="padding:12px 18px 14px;">${summary ? `
    <div style="margin:0 0 6px;font:400 14px/1.6 ${FONT};color:#111827;">${escapeHtml(summary)}</div>` : ""}${items ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${items}
    </table>` : ""}
  </td></tr>
</table>`.trim();
}

/** The same in plain text, for the text part of the mail. */
export function postingBoxText(posting: Pick<AgentPosting, "companyName" | "title" | "location" | "why" | "summary" | "fit">): string {
  return [`■ ${headOf(posting)}`, summaryOf(posting), ...fitOf(posting).map((line) => `✓ ${line}`)].filter(Boolean).join("\n");
}

/**
 * One posting as a bullet in an ordinary mail (Shaun 11/17: plain mail format, the words of the frame kept):
 * "**Company** · Title (Place)", then the summary and the ✓ need → experience lines, each on its own line.
 * Markdown for the mail renderer; every word plain (no links or markup from the model or a page).
 */
export function postingBulletMarkdown(posting: Named & Pick<AgentPosting, "location" | "why" | "summary" | "fit">): string {
  const md = (value: string) => value.replace(/[\\`*_[\]<>#|~]/g, "\\$&");
  const place = shortPlace(posting.location);
  const names = mailNames(posting);
  const head = `- **${md(plainFrameText(names.company, 120))}** ${SEP} ${md(plainFrameText(names.title, 160))}${place ? ` ${SEP} ${md(place)}` : ""}`;
  // The reason only, as plain sentences (Chris and Shaun 11/17: no check marks or arrows, written like a person);
  // the need → experience lines stay on the log.
  const summary = summaryOf(posting);
  return summary ? `${head}  \n  ${md(summary)}` : head;
}

/** The same in plain text: "• Company · Title (Place)" and its lines indented under it. */
export function postingBulletText(posting: Named & Pick<AgentPosting, "location" | "why" | "summary" | "fit">): string {
  return [`• ${headOf(posting)}`, summaryOf(posting)].filter(Boolean).map((line, index) => (index ? `  ${line}` : line)).join("\n");
}

const HANGUL = /[\u3131-\u318e\uac00-\ud7a3]/;

/**
 * The postings with the English names an English mail shows (mailCompany, mailTitle): only where the original has
 * Korean letters and the writer gave a name without any; elsewhere as they were. Korean mails keep them as written.
 */
export function withMailNames(
  postings: readonly AgentPosting[], roles: ReadonlyArray<{ company?: string; title?: string }> | undefined, language: "ko" | "en",
): AgentPosting[] {
  if (language !== "en") return postings.map(({ mailCompany: _company, mailTitle: _title, ...posting }) => posting);
  const clean = (value: string | undefined, max: number) => mailPlainText(value, max).replace(/\s+/g, " ").trim();
  return postings.map((posting, index) => {
    const role = roles?.[index];
    const company = clean(role?.company, 120);
    const title = clean(role?.title, 160);
    const next: AgentPosting = { ...posting };
    if (HANGUL.test(posting.companyName) && company && !HANGUL.test(company)) next.mailCompany = company;
    if (HANGUL.test(posting.title) && title && !HANGUL.test(title)) next.mailTitle = title;
    return next;
  });
}
