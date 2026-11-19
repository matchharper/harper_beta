/**
 * #5 mail: one fixed form for every first mail (Shaun 11/18, as Chris asked: no personalized subject or opening; the
 * name, the one kind of work the teams look for and the postings are the only parts that change), in Harper's mail
 * layout. Pure: the composer, the sender, the Ops preview and tests share it.
 */
import { renderReplyEmail } from "@/lib/email/runtime/format";
import { gtmOptOutMarkdown } from "../shared";
import { mailPersonName, mailPlainText, withoutLinks } from "./mailRules";
import { postingBulletMarkdown } from "./postingFrame";
import type { AgentPosting } from "./types";

export type AgentMailLanguage = "ko" | "en";

const KO_COUNT = ["", "한", "두", "세", "네", "다섯"];
const EN_COUNT = ["", "one", "two", "three", "four", "five"];

/**
 * The words of the mail (Shaun 11/18). Korean:
 *   제목: 유나님께 소개드리고 싶은 팀이 있어 연락드려요
 *   안녕하세요, 유나님. / Harper에서 회사 채용을 돕고 있는 Ashly입니다.
 *   디자인 시스템을 직접 맡아 오신 분을 찾는 팀이 요즘 몇 곳 있어요. 유나님 이력을 보고 이 세 팀이 잘 맞겠다 싶어서 메일 드립니다.
 *   (the postings) / 세 곳 내용은 여기에 모아뒀어요. [3곳 자세히 보기] / the ask / 감사합니다. / sign-off / opt-out
 * A name left out when unknown; the count words follow the postings the mail shows.
 */
const COPY = {
  ko: {
    subject: (name: string | null) => `${name ? `${name}님께 ` : ""}소개드리고 싶은 팀이 있어 연락드려요`,
    greeting: (name: string | null) => (name ? `안녕하세요, ${name}님.` : "안녕하세요."),
    intro: (sender: string) => `Harper에서 회사 채용을 돕고 있는 ${sender}입니다.`,
    lead: (focus: string) => `${focus}${objectParticle(focus)} 직접 맡아 오신 분을 찾는 팀이 요즘 몇 곳 있어요.`,
    why: (name: string | null, count: number, _lead?: boolean) =>
      `${name ? `${name}님 ` : ""}이력을 보고 이 ${count > 1 ? `${KO_COUNT[count] ?? count} ` : ""}팀이 잘 맞겠다 싶어서 메일 드립니다.`,
    gathered: (count: number) => `${count > 1 ? `${KO_COUNT[count] ?? count} 곳` : "자세한"} 내용은 여기에 모아뒀어요.`,
    open: (count: number) => `${count > 1 ? `${count}곳 ` : ""}자세히 보기`,
    ask: ["보시고 궁금한 점 있으면 뭐든 물어봐 주세요. 팀 분위기든 처우든, 제가 확인해서 알려드리겠습니다.", "지금은 생각이 없으시면 그냥 넘기셔도 괜찮아요."],
    thanks: "감사합니다.",
    signOff: (sender: string) => [`${sender ? `${sender} 드림` : ""}`, "Talent Partner, Harper · matchharper.com"],
  },
  en: {
    subject: (name: string | null, count: number) => `${name ? `${name}, ` : ""}${count > 1 ? "a few teams" : "a team"} I'd like to introduce you to`,
    greeting: (name: string | null) => (name ? `Hi ${name},` : "Hi there,"),
    intro: (sender: string) => `I'm ${firstName(sender) ?? sender} from Harper. I help companies find the right people for their teams.`,
    lead: (focus: string) => `A few teams are looking for someone with hands-on experience in ${focus}.`,
    // After the lead the teams are "one of them" (the lead speaks of a few); without it, "this team".
    why: (_name: string | null, count: number, lead?: boolean) => {
      const teams = lead
        ? `${count > 1 ? EN_COUNT[count] ?? count : "one"} of them`
        : count > 1 ? `these ${EN_COUNT[count] ?? count} teams` : "this team";
      return `Based on your background, I think ${teams} could be a good fit for you, so I wanted to reach out.`;
    },
    gathered: (count: number) => (count > 2 ? `You can find more about all ${EN_COUNT[count] ?? count} roles here:`
      : count === 2 ? "You can find more about both roles here:" : "You can find more about the role here:"),
    open: (count: number) => (count > 2 ? `See all ${count} roles` : count === 2 ? "See both roles" : "See the role"),
    ask: ["If you have any questions about the team, the culture, or the pay, just reply and I'll find out for you.", "And if now isn't the right time, no worries at all."],
    thanks: "Thanks,",
    signOff: (sender: string) => [sender, "Talent Partner, Harper · matchharper.com"],
  },
} as const;

/** "을" after a final consonant (or a Latin word read with one: l, m, n, ng), "를" otherwise. */
function objectParticle(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code >= 0 && code < 11172) return code % 28 !== 0 ? "을" : "를";
  return /(?:[lmn]|ng)$/i.test(word.trim()) ? "을" : "를";
}

/** The first name an English mail greets ("Jane Doe" → "Jane"). */
const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || null;

/** The mail's name for the person, as the subject and the greeting use it (mailRules.ts mailPersonName). */
function greetingName(language: AgentMailLanguage, name: string | null | undefined): string | null {
  const clean = mailPersonName(name ?? null);
  return language === "en" ? firstName(clean) : clean;
}

/** The first mail's subject: one form for everyone, the name when known. */
export function agentSubject(args: { language: AgentMailLanguage; name: string | null; count: number }): string {
  const name = greetingName(args.language, args.name);
  return args.language === "en" ? capitalize(COPY.en.subject(name, args.count)) : COPY.ko.subject(name);
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The kind of work the teams look for, as the writer named it ("디자인 시스템"), on one line without links or markup;
 * "경험" and the like left off (the sentence says it). Empty when the writer gave none.
 */
export function cleanFocus(focus: string | null | undefined): string {
  return mailPlainText(focus, 40).replace(/\s+/g, " ").trim()
    .replace(/\s*(?:경험|경력|업무)$/, "").replace(/\s+(?:experience|work)$/i, "").trim();
}

/** The first mail's lead sentence from the writer's focus ("" when there is none: the mail goes on without it). */
export function agentLeadLine(language: AgentMailLanguage, focus: string | null | undefined): string {
  const clean = cleanFocus(focus);
  return clean ? COPY[language].lead(clean) : "";
}

/** The subject when there is none (or nothing plain was left of it). */
export function defaultAgentSubject(language: AgentMailLanguage): string {
  return agentSubject({ language, name: null, count: 2 });
}

/** A subject as plain words on one line (no links, addresses or markup: mailRules.ts mailPlainText). */
export function agentMailSubject(value: string | null | undefined, language: AgentMailLanguage): string {
  return mailPlainText(value, 120).replace(/\s+/g, " ").trim() || defaultAgentSubject(language);
}

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_[\]<>#|~]/g, "\\$&");
}

/**
 * The why as the candidate reads it in a cold mail and Ops reads it on the log (and the invite page shows): the fit
 * itself, without the reviewer's caveat that production's picker often adds ("다만 …", "However …"). Not needed for
 * GTM (Shaun 11/17). A caveat word cuts only where it opens a sentence: "…맞아요, 하지만 그보다 …" inside a sentence stays.
 */
export function mailWhy(why: string): string {
  const text = why.trim();
  const cut = text.search(/[.!?。]\s+(?:다만|단,|하지만|However|But)[\s,]/);
  const head = (cut > 0 ? text.slice(0, cut + 1) : text).trim();
  // Sentences that hedge without a "다만" (확인이 필요, 차이가 있을 수, unclear, though, a stretch …) go too. A sentence
  // ends at . ! ? followed by a space, so "Node.js" or "3.5" is not an end.
  const sentences = head.split(/(?<=[.!?。])\s+/);
  const kept = sentences.filter((sentence) => !CAVEAT.test(sentence)).join(" ").trim();
  return kept.length >= 10 ? kept : head.length >= 10 ? head : text;
}

/** Hedges in a sentence ("부족" is not one: "인력이 부족한 팀이라 …" is a reason the person fits). */
const CAVEAT = new RegExp([
  "확인이 필요", "확인해 ?볼 만", "확인해 ?보시", "경험이 없다면", "없다면 ", "확인해 ?(?:봐야|보셔야)", "차이가 있을 수",
  "다를 수 있", "아쉬", "불확실", "맞지 않을 수", "낮을 수",
  "unclear", "may differ", "might not", "not sure", "needs? (?:to be )?(?:confirmed|checked)",
  "\\b(?:al)?though\\b", "rather than", "\\ban?(?: [a-z-]+)? stretch\\b", "not a direct", "less experience", "less direct(?:ly)?\\b",
].join("|"), "i");

/** One posting as a list item, as the mail shows it (postingFrame.ts postingBulletMarkdown). */
export function agentPostingLine(posting: AgentPosting): string {
  return postingBulletMarkdown(posting);
}

/** The postings as a markdown list (the composer puts it in the stored body, for the log and the closed-posting check). */
export function agentPostingList(postings: readonly AgentPosting[]): string {
  return postings.map(agentPostingLine).join("\n");
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

/** The English lead drafts carried before 11/19 ("…who has owned <focus> hands-on."): shown in today's words. */
const OLD_EN_LEAD = /^A few teams are looking for someone who has owned (.+?) hands-on\./;

/**
 * An English mail shows a company named by a job board's lowercase id ("acmedata", "bluewave") with a capital
 * ("Acmedata") when the writer gave no name of its own (postingFrame.ts withMailNames takes the writer's "AcmeData").
 */
function withCompanyCase(posting: AgentPosting): AgentPosting {
  const name = posting.mailCompany?.trim() || posting.companyName;
  if (!/^[a-z][a-z0-9.-]*(?: [a-z0-9.-]+)*$/.test(name)) return posting;
  return { ...posting, mailCompany: name.split(" ").map(capitalize).join(" ") };
}

const MAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Noto Sans KR',sans-serif";

/** The body without its postings list (the "- Company · Title" items and their indented lines). */
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
 * Lines of one paragraph, each on its own line: the mail's paragraphs keep their line breaks (white-space: pre-line),
 * so a plain line break shows as one, in the HTML and the text part alike (a markdown hard break would show two).
 */
const paragraph = (...parts: string[]) => parts.filter(Boolean).join("\n");

/**
 * The #5 mail in its one form (Shaun 11/18): greeting and who writes; the lead sentence (the stored body, without its
 * list) and why these teams; the postings as a plain bulleted list; where their details are and one plain link; the
 * ask; thanks, the sign-off and the opt-out line. A follow-up keeps its written sentences in place of the lead and does
 * not introduce the sender again. The count words follow the postings shown (one that closed since is not counted).
 * Only the link and the opt-out line are links: the subject, the name and the stored body go as plain words (the body's
 * postings list is shown from the postings).
 */
export function renderAgentMail(input: {
  language: AgentMailLanguage; subject: string; body: string; name: string | null; harperUrl: string;
  postings: readonly AgentPosting[]; senderName: string; senderEmail: string; unsubscribeUrl?: string | null;
  /** A follow-up does not introduce the sender again. */
  followup?: boolean;
}): { subject: string; html: string; text: string } {
  const copy = COPY[input.language];
  const sender = input.senderName.trim();
  const name = greetingName(input.language, input.name);
  const postings = input.language === "en" ? input.postings.map(withCompanyCase) : input.postings;
  const count = postings.length;
  const subject = agentMailSubject(input.subject, input.language);
  // The stored body: the lead sentence (a follow-up: its sentences), then the postings list, shown below from the postings.
  const stored = escapeMarkdown(dropLeadingGreeting(withoutPostingList(plainBody(input.body)))).replace(/\n+/g, " ").trim();
  const written = input.language === "en" && !input.followup ? stored.replace(OLD_EN_LEAD, (_all, focus: string) => COPY.en.lead(focus)) : stored;
  const opening = input.followup ? written : [written, copy.why(name, count, Boolean(written))].filter(Boolean).join(" ");
  const markdown = [
    paragraph(escapeMarkdown(copy.greeting(name)), !input.followup && sender ? escapeMarkdown(copy.intro(sender)) : ""),
    opening,
    // A loose list (a blank line between items), so each item's two lines show as two lines with space between items.
    postings.map(postingBulletMarkdown).join("\n\n"),
    paragraph(escapeMarkdown(copy.gathered(count)), `[${escapeMarkdown(copy.open(count))}](${input.harperUrl})`),
    paragraph(...copy.ask.map(escapeMarkdown)),
    escapeMarkdown(copy.thanks),
    paragraph(...copy.signOff(sender).map(escapeMarkdown)),
    gtmOptOutMarkdown(input.language, input.unsubscribeUrl),
  ].filter(Boolean).join("\n\n");
  const rendered = renderReplyEmail(markdown, { audience: "talent" });
  // The same sans font as the 후보자 링크 mail (Shaun 11/17: keep this font), whatever the reader's default is.
  const html = rendered.html
    .replace('data-harper-email-body-container="true" style="', `data-harper-email-body-container="true" style="font-family:${MAIL_FONT};`);
  return { subject, html, text: rendered.text };
}
