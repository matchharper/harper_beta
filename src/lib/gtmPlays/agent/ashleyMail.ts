/**
 * #5 Ashley's reply mails (design 3장 "가입 링크", 5장): the parts code adds around what Ashley writes, and the fixed
 * short mails of the company branches. Pure, so tests pin the rendering; sending is ashleyReply.server.ts.
 *
 * A reply is: Ashley's text, one text link line only when there is a next step (like the first mail's "자세히 보기"),
 * the first mail's two signature lines, the opt-out line, then the other side's mail quoted like a mail app.
 * Subject "Re: <their subject>" (never "Re: Re:"), In-Reply-To / References to their mail so it threads, and the
 * List-Unsubscribe header as on the first mail.
 */
import { renderReplyEmail } from "@/lib/email/runtime/format";
import { gtmOptOutMarkdown } from "../shared";
import { SIGNUP_QUESTION_MAX, SIGNUP_STEPS, type SignupStep } from "./signupMove";

export type AshleyLanguage = "ko" | "en";

/** What the person wants next, carried in the signup link (signupMove.ts reads it on sign-up). */
export const ASHLEY_NEXT_STEPS = SIGNUP_STEPS;
export type AshleyNextStep = SignupStep;

/** Query parameters of the signup link (signupMove.ts parseSignupNext): the next step, the posting's URL, the question. */
export const SIGNUP_NEXT_PARAM = "next";
export const SIGNUP_POSTING_PARAM = "posting";
export const SIGNUP_QUESTION_PARAM = "question";

export function isNextStep(value: unknown): value is AshleyNextStep {
  return typeof value === "string" && (ASHLEY_NEXT_STEPS as readonly string[]).includes(value);
}

/**
 * The signup link: the first mail's link (/jobs/invite/<first mail id>, read by invitePage.server.ts, claimed on
 * sign-up) plus ?next=<step>&posting=<http(s) URL>&question=<one line>, the form signupMove.ts parseSignupNext reads.
 * A posting without a URL (a customer's or GTM Role) is not named: the step alone goes.
 */
export function ashleySignupLink(args: {
  origin: string; rootMailId: string; next: AshleyNextStep; posting?: { url: string | null } | null; question?: string | null;
}): string {
  const url = new URL(`/jobs/invite/${encodeURIComponent(args.rootMailId)}`, args.origin);
  url.searchParams.set(SIGNUP_NEXT_PARAM, args.next);
  const posting = args.posting?.url?.trim();
  if (posting && /^https?:\/\//i.test(posting)) url.searchParams.set(SIGNUP_POSTING_PARAM, posting);
  const question = args.question?.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (question) {
    url.searchParams.set(SIGNUP_QUESTION_PARAM, question.length > SIGNUP_QUESTION_MAX ? `${question.slice(0, SIGNUP_QUESTION_MAX - 1).trimEnd()}…` : question);
  }
  return url.toString();
}

/** A company mail's landing (/org?gtm=<company mail id>, companyInvite.server.ts). */
export function companyLandingLink(origin: string, companyMailId: string): string {
  const url = new URL("/org", origin);
  url.searchParams.set("gtm", companyMailId);
  return url.toString();
}

/** Opens the thread in Ashley's Gmail (search by the mail's RFC Message-ID); null without one. */
export function gmailThreadSearchLink(mailbox: string | null | undefined, rfcMessageId: string | null | undefined): string | null {
  const id = String(rfcMessageId ?? "").trim().replace(/^<+|>+$/g, "");
  if (!id || !/@/.test(id)) return null;
  const user = String(mailbox ?? "").trim().toLowerCase();
  return `https://mail.google.com/mail/${user ? `?authuser=${encodeURIComponent(user)}` : "u/0/"}#search/${encodeURIComponent(`rfc822msgid:${id}`)}`;
}

/** "Re:", "RE:", "Aw:", "회신:", "답장:", "回复：" … at the start, any number of times. */
const REPLY_PREFIX = /^\s*(?:(?:re|aw|sv|antw|回复|答复|회신|답장)\s*(?:\[\d+\])?\s*[:：]\s*)+/i;

/** "Re: <their subject>" without a second "Re:"; their subject empty → ours (the thread's first subject). */
export function replySubject(theirs: string | null | undefined, fallback: string | null | undefined): string {
  const clean = (value: string | null | undefined) => String(value ?? "").replace(/\s+/g, " ").replace(REPLY_PREFIX, "").trim();
  const base = clean(theirs) || clean(fallback);
  return base ? `Re: ${base}` : "Re:";
}

const MESSAGE_ID = /<[^<>\s]+@[^<>\s]+>/g;

/** A Message-ID as a header carries it ("<id@host>"), or null. */
export function headerMessageId(value: string | null | undefined): string | null {
  const id = String(value ?? "").trim().replace(/^<+|>+$/g, "").trim();
  return /^[^<>\s]+@[^<>\s]+$/.test(id) ? `<${id}>` : null;
}

/**
 * The thread headers of a reply to their mail (email/runtime/transport.ts replyHeaders): In-Reply-To = their
 * Message-ID, References = their References + their Message-ID (no repeats, the last 50).
 */
export function replyThreadHeaders(their: { rfcMessageId: string | null; references: string | null }): Record<string, string> {
  const id = headerMessageId(their.rfcMessageId);
  const references = [...new Set([...(their.references?.match(MESSAGE_ID) ?? []), ...(id ? [id] : [])])].slice(-50).join(" ");
  return { ...(id ? { "In-Reply-To": id } : {}), ...(references ? { References: references } : {}) };
}

/** The first mail's opt-out headers (send.server.ts callProvider): the one-click page and the mailto. */
export function listUnsubscribeHeaders(unsubscribeUrl: string | null, fromEmail: string): Record<string, string> {
  const mailto = `<mailto:${fromEmail.trim().toLowerCase()}?subject=unsubscribe>`;
  return unsubscribeUrl
    ? { "List-Unsubscribe": `<${unsubscribeUrl}>, ${mailto}`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : { "List-Unsubscribe": mailto };
}

/** The link line's words, named by the next step ("이 공고 지원 맡기기", design 3장). */
export function signupLinkLabel(language: AshleyLanguage, step: AshleyNextStep, companyName?: string | null): string {
  const company = companyName?.trim() || null;
  if (language === "en") {
    return {
      apply_on_behalf: "Let Harper apply for you",
      connect_request: company ? `Get introduced to ${company}` : "Get introduced",
      opportunities_first: "See the roles",
      onboarding: "Get started with Harper",
    }[step];
  }
  return {
    apply_on_behalf: "이 공고 지원 맡기기",
    connect_request: company ? `${company}에 소개 요청하기` : "소개 요청하기",
    opportunities_first: "찾은 공고 보기",
    onboarding: "Harper 시작하기",
  }[step];
}

/**
 * The fixed words of the company branches (design 5장 "회사가 답장하면", "메일 중계는 한 쌍에 한 번"). Kept here so a
 * wording change is one place. A relay carries the company's words only, in quotes, with nothing added.
 */
export const ASHLEY_COPY = {
  ko: {
    greeting: (name: string | null) => (name ? `안녕하세요, ${name}님.` : "안녕하세요."),
    companyGreeting: (company: string | null) => (company ? `안녕하세요, ${company} 채용 담당자님.` : "안녕하세요."),
    relay: (company: string) => [`${company}에서 물어보신 것에 답이 왔어요. 회사가 쓴 그대로 옮겨 드려요.`],
    // No "바로": the company is not on Harper yet. After the sign-up Ashley tells the company (companyJoined, its link)
    // and the company asks to connect on Harper (Shaun 11/22 16:08: no person in between).
    relayAfter: ["회사와 이어서 이야기하시려면 Harper에 가입해 주세요. 가입하시면 제가 회사와 이어드릴게요."],
    // No particle right after a company name (mail copy rule: English names make 와/과 guesses wrong).
    relayLabel: (company: string) => `${company} 담당자와 이어서 이야기하기`,
    wantsToTalk: (company: string) => [`${company}에서 이야기를 나눠 보고 싶어 해요.`, "Harper에 가입하시면 제가 회사와 이어드릴게요."],
    companyAfterRelay: ["답장 주셔서 감사합니다.", "후보가 Harper에 가입하면 이어드릴게요."],
    companyLink: ["답장 주셔서 감사합니다.", "맞는 분들은 여기에서 바로 보실 수 있어요."],
    // The candidate the company asked about (or wanted to talk with) joined Harper (Shaun 11/22 16:08): one mail in the
    // company's thread with its link (companyLandingLink, label companyLinkLabel). Its own mail, one purpose (16:15).
    companyJoined: ["물어보셨던 후보가 하퍼에 가입했어요.", "여기에서 바로 연결을 요청하실 수 있어요."],
    companyLinkLabel: "후보 자세히 보기",
    // A company's answer for a member, in their Harper chat (memberAnswerContent): the lead line, then its words.
    memberAnswer: (company: string, title: string | null) => (title
      ? `${company}에서 ${title} 공고에 대해 물어보신 질문에 답했어요:` : `${company}에서 물어보신 질문에 답했어요:`),
    // A member's mail to Ashley is answered by Harper in their chat (Shaun 11/23 12:48): one mail in the same thread.
    memberRedirect: ["답장 주셔서 감사합니다.", "보내 주신 메일에 Harper가 Harper 대화창에서 답했어요. 이어서 이야기는 Harper에서 나눠 주세요."],
    memberRedirectLabel: "Harper에서 답 보기",
  },
  en: {
    greeting: (name: string | null) => (name ? `Hi ${name},` : "Hi there,"),
    companyGreeting: (company: string | null) => (company ? `Hi ${company} team,` : "Hi there,"),
    relay: (company: string) => [`${company} got back to me on your question. Here is their answer, word for word:`],
    relayAfter: ["If you'd like to keep talking with them, join Harper and I'll connect you."],
    relayLabel: (company: string) => `Continue with ${company}`,
    wantsToTalk: (company: string) => [`${company} would like to talk with you.`, "Join Harper and I'll connect you."],
    companyAfterRelay: ["Thanks for getting back to me.", "I'll connect you once the candidate joins Harper."],
    companyLink: ["Thanks for getting back to me.", "You can see the people who fit here."],
    companyJoined: ["The candidate you asked about has just joined Harper.", "You can ask to be connected here."],
    companyLinkLabel: "See the candidates",
    memberAnswer: (company: string, title: string | null) => (title
      ? `${company} answered the question you asked about ${title}:` : `${company} answered the question you asked:`),
    memberRedirect: ["Thanks for your reply.", "Harper has answered it in your Harper chat. Let's keep the conversation going there."],
    memberRedirectLabel: "See Harper's answer",
  },
} as const;

/** A member's Harper chat (the latest conversation, where a routed mail goes: email/runtime/store.ts ensureEmailConversation). */
export function harperChatLink(origin: string): string {
  return new URL("/career", origin).toString();
}

/** Ashley's mail that told a member, as their Harper chat keeps it (a third party's words, marked as such). */
export function memberRedirectChatContent(text: string): string {
  return `[Ashley's email in the same thread, sent after Harper's answer]\n${text.trim()}`;
}

/**
 * A company's answer to a member's question, as it goes into their Harper chat (Shaun 11/22 16:10: a member hears it
 * inside Harper, not by mail): one fixed lead line, then the company's words in quotes, word for word, nothing added.
 */
export function memberAnswerContent(args: { language: AshleyLanguage; companyName: string | null; postingTitle: string | null; words: string }): string {
  const company = args.companyName?.trim() || (args.language === "ko" ? "회사" : "The company");
  return `${ASHLEY_COPY[args.language].memberAnswer(company, args.postingTitle?.trim() || null)}\n\n"${args.words.trim()}"`;
}

/** The first mail's two signature lines (render.ts COPY signOff). */
export function signatureLines(language: AshleyLanguage, senderName: string): [string, string] {
  const sender = senderName.trim();
  return language === "en"
    ? [sender, "Talent Partner, Harper · matchharper.com"]
    : [sender ? `${sender} 드림` : "", "Talent Partner, Harper · matchharper.com"];
}

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The line above a quoted mail, as a mail app writes it, in Korea time. */
export function quoteHeader(language: AshleyLanguage, fromEmail: string, at: string): string {
  const time = Date.parse(at);
  const who = `<${fromEmail.trim().toLowerCase()}>`;
  if (!Number.isFinite(time)) return language === "en" ? `${who} wrote:` : `${who}님이 작성:`;
  const kst = new Date(time + 9 * 3_600_000);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return language === "en"
    ? `On ${EN_MONTHS[kst.getUTCMonth()]} ${kst.getUTCDate()}, ${kst.getUTCFullYear()} at ${hh}:${mm}, ${who} wrote:`
    : `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${hh}:${mm}, ${who}님이 작성:`;
}

/** Quoted mail text at most (a long thread's quote is its own earlier quotes). */
const QUOTE_MAX_CHARS = 8_000;

const escapeMarkdown = (value: string) => value.replace(/[\\`*_[\]<>#|~]/g, "\\$&");
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Paragraphs as the mail shows them: each line of a paragraph on its own line, plain words (no markup). */
function paragraphs(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/)
    .map((block) => block.split("\n").map((line) => escapeMarkdown(line.trim())).filter(Boolean).join("\n"))
    .filter(Boolean);
}

export type AshleyMailInput = {
  language: AshleyLanguage;
  /** What Ashley wrote (or the fixed copy): plain text, paragraphs split by blank lines. */
  body: string;
  /** The one link line, only when there is a next step. */
  link: { label: string; url: string } | null;
  senderName: string;
  unsubscribeUrl: string | null;
  /** The mail answered, quoted below like a mail app (none for a relay, which answers no mail of theirs). */
  quote: { fromEmail: string; at: string; text: string } | null;
};

/** One Ashley mail, HTML and text, in the first mail's layout (email/runtime/format.ts renderReplyEmail). */
export function renderAshleyMail(input: AshleyMailInput): { html: string; text: string } {
  const markdown = [
    ...paragraphs(input.body),
    input.link ? `[${escapeMarkdown(input.link.label)}](${input.link.url})` : "",
    signatureLines(input.language, input.senderName).filter(Boolean).map(escapeMarkdown).join("\n"),
    gtmOptOutMarkdown(input.language, input.unsubscribeUrl),
  ].filter(Boolean).join("\n\n");
  const rendered = renderReplyEmail(markdown, { audience: "talent" });
  if (!input.quote) return rendered;
  const header = quoteHeader(input.language, input.quote.fromEmail, input.quote.at);
  const quoted = input.quote.text.replace(/\r\n?/g, "\n").trim().slice(0, QUOTE_MAX_CHARS);
  const text = `${rendered.text}\n\n${header}\n${quoted.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n")}`;
  // Gmail's own quote markup, so the mail app folds it as it folds its own quotes.
  const quoteHtml = `<div class="gmail_quote"><div class="gmail_attr">${escapeHtml(header)}<br></div>`
    + `<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">`
    + `${escapeHtml(quoted).replace(/\n/g, "<br>")}</blockquote></div>`;
  const end = rendered.html.lastIndexOf("</div></div></body>");
  const html = end >= 0
    ? `${rendered.html.slice(0, end)}${quoteHtml}${rendered.html.slice(end)}`
    : rendered.html.replace("</body>", `${quoteHtml}</body>`);
  return { html, text };
}

/** Slack's own escapes, so a name or a mail never becomes a link or a mention. */
export const slackText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const ASHLEY_SLACK_TITLE = "[gtm agent · Ashley]";

/**
 * A hand-off in the reply alert's thread (design 5장): the @mention, the reason line, the /ops conversation, the
 * thread in Ashley's Gmail, and the person's signup link (pasted into a human answer, sign-up starts at that step).
 */
export function handoffSlackText(args: {
  mentionUserId: string | null; reason: string; who: string; opsUrl: string; gmailUrl: string | null; signupUrl: string | null;
}): string {
  const mention = args.mentionUserId && /^[UW][A-Z0-9]{2,}$/.test(args.mentionUserId) ? `<@${args.mentionUserId}> ` : "";
  const links = [
    `<${args.opsUrl}|/ops에서 대화 보기>`,
    args.gmailUrl ? `<${args.gmailUrl}|Ashley Gmail에서 스레드 열기>` : "",
    args.signupUrl ? `가입 링크: ${args.signupUrl}` : "",
  ].filter(Boolean).join(" · ");
  return [
    `${mention}*${ASHLEY_SLACK_TITLE} 사람이 답해 주세요*`,
    `이유: ${slackText(args.reason)}`,
    slackText(args.who),
    links,
  ].filter(Boolean).join("\n");
}

/** A sent Ashley mail as a comment in the reply alert's thread. */
export function sentReplySlackText(args: { who: string; text: string; link: { label: string; url: string } | null }): string {
  const quoted = args.text.trim().split("\n").map((line) => `> ${slackText(line)}`).join("\n");
  return [
    `*${ASHLEY_SLACK_TITLE} 답장 보냄* · ${slackText(args.who)}`,
    quoted,
    args.link ? `링크: ${slackText(args.link.label)} (${args.link.url})` : "",
  ].filter(Boolean).join("\n");
}

/** A line in the thread without a mention (a reply held because a person answered meanwhile). */
export function noteSlackText(who: string, note: string): string {
  return `*${ASHLEY_SLACK_TITLE}* ${slackText(note)} · ${slackText(who)}`;
}
