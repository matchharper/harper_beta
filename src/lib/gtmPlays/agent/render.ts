/**
 * #5 mail: the words around the 2-3 postings and the mail in Harper's mail layout (as #4's candidate mail: greeting,
 * body, buttons, closing, opt-out line). Pure: the composer, the sender, the Ops preview and tests share it.
 */
import { renderReplyEmail } from "@/lib/email/runtime/format";
import { gtmCandidateOpening } from "../personalLine";
import { gtmOptOutMarkdown } from "../shared";
import { mailPersonName, mailPlainText, withoutLinks } from "./mailRules";
import { postingBulletMarkdown } from "./postingFrame";
import type { AgentPosting } from "./types";

export type AgentMailLanguage = "ko" | "en";

/**
 * The words code adds around the writer's opening and the roles, in a headhunter's voice (Shaun 11/17): one plain
 * link instead of buttons, one easy ask (reply with what caught their eye, or their timing), a one-line note on what
 * Harper does, and a personal sign-off.
 */
const COPY = {
  ko: {
    open: (count: number) => `${count > 1 ? `${count}곳` : "공고"} 자세히 보기`,
    ask: "자세한 내용은 아래 링크에서 보실 수 있어요. 마음이 가는 곳이 있거나, 이직 시기나 원하시는 조건이 따로 있으면 이 메일에 편하게 답장 주세요. 거기에 맞춰 더 찾아 드릴게요.",
    harper: "Harper는 지원하시는 분과 회사를 직접 이어 드리는 채용 서비스예요. 가입하시면 이 공고들이 '내 기회'에 담기고, 지원과 연결까지 제가 같이 챙겨 드려요.",
    signOff: (name: string) => `${name} 드림\nHarper 커리어 매니저`,
    subject: "경력에 맞을 만한 기회 몇 곳",
  },
  en: {
    open: (count: number) => (count > 1 ? `See all ${count} roles` : "See the role"),
    ask: "You can read more about each one at the link below. If one of them catches your eye, or if you have a timing or a must-have in mind, just reply to this email and I'll look further.",
    harper: "Harper connects people with companies directly. Sign up and these roles will be waiting for you, and I'll help with the application and the introduction.",
    signOff: (name: string) => `${name}\nCareer manager, Harper`,
    subject: "A few roles that fit your background",
  },
} as const;

/**
 * The first mail's subject (Shaun 11/17: decided from Harper's own mails, the glossary and Chris's "human, not AI"
 * note). Harper's mails title a first contact plainly in 해요체 ("Harper에서 먼저 인사드려요") and call roles 기회
 * (내 기회). A headhunter's subject names the person and the one thing this mail is about:
 * - someone who applied to Harper's posting: "<이름>님, <직무> 지원 건으로 연락드려요" (they know what this is about);
 * - someone found by their own post or profile: "<이름>님께 맞을 만한 <직무> 기회 <N>곳".
 * No brackets, emoji, "추천" or hype; the name is left out when unknown. The 직무 word comes from the writer.
 */
export function agentSubject(args: {
  language: AgentMailLanguage; name: string | null; roleWord: string | null | undefined; count: number; applicant: boolean;
}): string {
  const role = mailPlainText(args.roleWord, 30).replace(/\s+/g, " ").trim();
  if (args.language === "en") {
    const first = args.name?.trim().split(/\s+/)[0] ?? "";
    if (args.applicant) return role ? `${first ? `${first}, about` : "About"} your ${role} application` : COPY.en.subject;
    return role ? `${first ? `${first}, ` : ""}${args.count > 1 ? `${args.count} ` : ""}${role} roles that fit your background` : COPY.en.subject;
  }
  const to = args.name?.trim() ? `${args.name.trim()}님` : "";
  if (args.applicant) return role ? `${to ? `${to}, ` : ""}${role} 지원 건으로 연락드려요` : COPY.ko.subject;
  return role ? `${to ? `${to}께 ` : ""}맞을 만한 ${role} 기회${args.count > 1 ? ` ${args.count}곳` : ""}` : COPY.ko.subject;
}

/** The subject when the writer's is empty (or nothing plain was left of it). */
export function defaultAgentSubject(language: AgentMailLanguage): string {
  return COPY[language].subject;
}

/** A subject as plain words on one line (no links, addresses or markup: mailRules.ts mailPlainText). */
export function agentMailSubject(value: string | null | undefined, language: AgentMailLanguage): string {
  return mailPlainText(value, 120).replace(/\s+/g, " ").trim() || defaultAgentSubject(language);
}

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_[\]<>#|~]/g, "\\$&");
}

/** A company, title or place as list text: on one line, without links or addresses, markdown escaped. */
const listText = (value: string) => escapeMarkdown(withoutLinks(value).replace(/\s+/g, " ").trim());

/**
 * The why as the candidate reads it in a cold mail and Ops reads it on the log: the fit itself, without the reviewer's
 * caveat that production's picker often adds ("다만 …", "However …"). Not needed for GTM (Shaun 11/17).
 */
export function mailWhy(why: string): string {
  const text = why.trim();
  const cut = text.search(/(?:^|[.!?。]\s+|\s)(?:다만|단,|하지만|However|But)[\s,]/);
  const kept = (cut > 0 ? text.slice(0, cut + 1) : text).trim();
  return kept.length >= 10 ? kept : text;
}

/**
 * One posting as a list item: "**Company** · Title (Location)" and its why on the next line. The why is model-written
 * (from the person's page too), so it goes in as plain words: no links, addresses or markup.
 */
export function agentPostingLine(posting: AgentPosting): string {
  const where = posting.location?.trim() ? ` (${listText(posting.location)})` : "";
  const head = `- **${listText(posting.companyName)}** · ${listText(posting.title)}${where}`;
  const why = mailPlainText(mailWhy(posting.why), 300).replace(/\s+/g, " ");
  // A hard line break: the why reads as its own line under the company and title, not run into it.
  return why ? `${head}  \n  ${escapeMarkdown(why)}` : head;
}

/** The postings as a markdown list (the composer puts it in the body; the renderer adds it when the body lost it). */
export function agentPostingList(postings: readonly AgentPosting[]): string {
  return postings.map(agentPostingLine).join("\n");
}

/** Whether every posting's title is already in the body (an edited body may have dropped the list). */
export function bodyListsPostings(body: string, postings: readonly AgentPosting[]): boolean {
  return postings.every((posting) => body.includes(listText(posting.title)) || body.includes(posting.title.trim()));
}

/** The lines under the link: what Harper is and the sign-off. */
export function agentMailClosing(language: AgentMailLanguage, senderName: string): string {
  const copy = COPY[language];
  return `${copy.harper}\n\n${copy.signOff(senderName)}`;
}

/** The body without a greeting at its very start ("안녕하세요, ", "안녕하세요. ", "Hi, ", "Hello! "). */
export function dropLeadingGreeting(body: string): string {
  return body.replace(/^(?:안녕하세요|안녕하십니까|hi|hello)\s*[,.!]?\s*/i, "").trim();
}

/**
 * A stored body as the mail shows it: the postings list's items keep their markdown (links taken out), every other
 * line (the writer's opening, each why) goes as plain words. Drafts written before the composer did this get it here.
 */
function plainBody(body: string): string {
  return body.split("\n").map((line) => {
    if (/^\s*- /.test(line)) return withoutLinks(line);
    if (/^\s{2,}\S/.test(line)) return `  ${mailPlainText(line, 2_000)}`;
    return mailPlainText(line, 2_000);
  }).join("\n");
}

const MAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Noto Sans KR',sans-serif";

/** The body without its postings list (the "- **Company** · Title" items and their indented why lines). */
export function withoutPostingList(body: string): string {
  const lines = body.split("\n");
  const kept: string[] = [];
  let inItem = false;
  for (const line of lines) {
    if (/^\s*- /.test(line)) { inItem = true; continue; }
    if (inItem && /^\s{2,}\S/.test(line)) continue;
    inItem = false;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The #5 mail, as a capable headhunter writes it (Shaun 11/17): greeting, the writer's opening, the roles as a plain
 * bulleted list, one easy ask, one plain link to the roles on Harper (no buttons: a normal mail), a line on what
 * Harper does, the sign-off and the opt-out line. Only the link and the opt-out line are links (item 6 of the 11/17
 * review): the subject goes as plain words, the name as a greeting may use it (else no
 * name), and the body without links, addresses, HTML or markdown outside the postings list (the composer already
 * wrote it so; this also covers drafts written before that).
 */
export function renderAgentMail(input: {
  language: AgentMailLanguage; subject: string; body: string; name: string | null; harperUrl: string;
  postings: readonly AgentPosting[]; senderName: string; senderEmail: string; unsubscribeUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const copy = COPY[input.language];
  const subject = agentMailSubject(input.subject, input.language);
  // The greeting is added per person: drop one the writer put at the start anyway ("안녕하세요, …").
  const body = dropLeadingGreeting(plainBody(input.body).trim());
  // The postings as an ordinary bulleted list: company · title · place, then a sentence or two on why.
  const withList = input.postings.length
    ? `${withoutPostingList(body)}\n\n${input.postings.map(postingBulletMarkdown).join("\n")}`
    : body;
  const markdown = [
    ...gtmCandidateOpening(input.language, mailPersonName(input.name)).map(escapeMarkdown),
    withList,
    escapeMarkdown(copy.ask),
    `[${escapeMarkdown(copy.open(input.postings.length))}](${input.harperUrl})`,
    escapeMarkdown(agentMailClosing(input.language, input.senderName)),
    gtmOptOutMarkdown(input.language, input.unsubscribeUrl),
  ].filter(Boolean).join("\n\n");
  const rendered = renderReplyEmail(markdown, { audience: "talent" });
  // The same sans font as the 후보자 링크 mail (Shaun 11/17: keep this font), whatever the reader's default is.
  const html = rendered.html
    .replace('data-harper-email-body-container="true" style="', `data-harper-email-body-container="true" style="font-family:${MAIL_FONT};`);
  return { subject, html, text: rendered.text };
}
