/**
 * #5 mail: one fixed form for every first mail (Shaun 11/18, as Chris asked: no personalized subject or opening; the
 * name, the one kind of work the teams look for and the postings are the only parts that change), in Harper's mail
 * layout. Pure: the composer, the sender, the Ops preview and tests share it.
 */
import { renderReplyEmail } from "@/lib/email/runtime/format";
import { gtmOptOutMarkdown } from "../shared";
import { mailPersonName, mailPlainText, withoutLinks } from "./mailRules";
import type { AgentOffer } from "./channels";
import { postingBulletMarkdown } from "./postingFrame";
import type { AgentOfferEvent, AgentPosting } from "./types";

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
    ask: ["보시고 궁금한 점 있으면 이 메일에 편하게 물어봐 주세요.", "지금은 생각이 없으시면 그냥 넘기셔도 괜찮아요."],
    thanks: "감사합니다.",
    signOff: (sender: string) => [`${sender ? `${sender} 드림` : ""}`, "Talent Partner, Harper · matchharper.com"],
  },
  en: {
    subject: (name: string | null, count: number) => `${name ? `${name}, ` : ""}${count > 1 ? "a few teams" : "a team"} I'd like to introduce you to`,
    greeting: (name: string | null) => (name ? `Hi ${name},` : "Hi there,"),
    // Each line says what Chris's Korean line says (Shaun 11/19), in plain English.
    intro: (sender: string) => `I'm ${firstName(sender) ?? sender} from Harper, where I help companies with their hiring.`,
    lead: (focus: string) => `A few teams are currently looking for someone with hands-on ownership of ${focus}.`,
    // 이 (세) 팀 → "this one" / "these three" after the lead (a few teams, the ones listed below); without it, "this team".
    why: (_name: string | null, count: number, lead?: boolean) => {
      const teams = lead
        ? count > 1 ? `these ${EN_COUNT[count] ?? count}` : "this one"
        : count > 1 ? `these ${EN_COUNT[count] ?? count} teams` : "this team";
      return `Looking at your background, I thought ${teams} would be a good fit for you, so I wanted to reach out.`;
    },
    gathered: (count: number) => (count > 2 ? `I've put the details for all ${EN_COUNT[count] ?? count} in one place.`
      : count === 2 ? "I've put the details for both in one place." : "I've put all the details here."),
    open: (count: number) => (count > 2 ? `See all ${count} roles` : count === 2 ? "See both roles" : "See the details"),
    ask: [
      "Once you've had a look, feel free to reply with any questions.",
      "And if you're not thinking about a move right now, it's totally fine to let this one pass.",
    ],
    thanks: "Thanks,",
    signOff: (sender: string) => [sender, "Talent Partner, Harper · matchharper.com"],
  },
} as const;

/**
 * The other two first mails (Shaun 11/23, the offer the person's intent picks: agent/channels.ts offerOf), in the same
 * layout, greeting, sign-off and opt-out as the posting mail:
 *   상담 (career or résumé help asked for; no postings): what they seem to be working on, what Harper does for it, one
 *   link to start;
 *   일반 (the purchased DB, event-seeking posts): up to 2 fitting postings and up to 2 upcoming events (events first for
 *   someone who asked for events), what joining gets them (postings that keep coming, 대신 지원), one link.
 */
const OFFER_COPY = {
  ko: {
    coaching: {
      subject: (name: string | null) => `${name ? `${name}님, ` : ""}커리어 고민 같이 봐 드릴 수 있어요`,
      intro: (sender: string) => `Harper에서 커리어와 이직을 돕고 있는 ${sender}입니다.`,
      lead: (focus: string) => (focus ? `${focus}${objectParticle(focus)} 고민하고 계신 것 같아 연락드려요.` : "커리어 고민이 있으신 것 같아 연락드려요."),
      offer: [
        "Harper에 이력서나 LinkedIn 프로필을 올려 주시면 바로 첨삭과 다음 방향 상담을 받아 보실 수 있어요.",
        "상담은 무료이고, 원하실 때 맞는 공고도 같이 찾아 드려요.",
      ],
      open: "상담 받아 보기",
      ask: ["궁금한 점 있으면 이 메일에 편하게 물어봐 주세요.", "지금은 괜찮으시면 그냥 넘기셔도 돼요."],
    },
    general: {
      subject: (name: string | null) => `${name ? `${name}님께 ` : ""}맞을 만한 기회를 몇 가지 모아 봤어요`,
      lead: (name: string | null) => `${name ? `${name}님 ` : ""}이력을 보고 요즘 맞을 만한 기회를 몇 가지 골라 봤어요.`,
      postings: "지금 사람을 찾는 팀",
      events: "다가오는 행사",
      join: "Harper에 가입하시면 맞는 공고를 계속 받아 보실 수 있고, 원하시면 지원도 대신 해 드려요.",
      gathered: "자세한 내용은 여기에 모아뒀어요.",
      open: "자세히 보기",
    },
    online: "온라인",
  },
  en: {
    coaching: {
      subject: (name: string | null) => `${name ? `${name}, ` : ""}happy to help with your next career step`,
      intro: (sender: string) => `I'm ${firstName(sender) ?? sender} from Harper, where I help people with their careers and job moves.`,
      lead: (focus: string) => (focus ? `It sounded like you're working on ${focus}, so I wanted to reach out.`
        : "It sounded like you're thinking about your next career step, so I wanted to reach out."),
      offer: [
        "If you add your résumé or LinkedIn profile on Harper, you can get feedback on it and talk through your next step right away.",
        "It's free, and we can also look for roles that fit whenever you want.",
      ],
      open: "Get started",
      ask: ["Feel free to reply with any questions.", "And if now isn't a good time, it's totally fine to let this one pass."],
    },
    general: {
      subject: (name: string | null) => `${name ? `${name}, ` : ""}a few opportunities that might fit you`,
      lead: (_name: string | null) => "Looking at your background, I picked out a few opportunities that might fit you right now.",
      postings: "Teams hiring now",
      events: "Upcoming events",
      join: "If you join Harper, you'll keep getting roles that fit you, and we can apply on your behalf whenever you want.",
      gathered: "I've put all the details here.",
      open: "See the details",
    },
    online: "Online",
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
export function agentSubject(args: { language: AgentMailLanguage; name: string | null; count: number; offer?: AgentOffer }): string {
  const name = greetingName(args.language, args.name);
  if (args.offer === "coaching" || args.offer === "general") {
    const subject = OFFER_COPY[args.language][args.offer].subject(name);
    return args.language === "en" ? capitalize(subject) : subject;
  }
  return args.language === "en" ? capitalize(COPY.en.subject(name, args.count)) : COPY.ko.subject(name);
}

/** A coaching mail's lead sentence from what the writer read they are working on ("이력서 정리"; none: the general one). */
export function agentCoachingLead(language: AgentMailLanguage, focus: string | null | undefined): string {
  return OFFER_COPY[language].coaching.lead(cleanFocus(focus));
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

/**
 * English leads that drafts written before 11/19 15:00 carry ("…who has owned <focus> hands-on.", "…with hands-on
 * experience in <focus>."): shown in today's words. A first mail's stored text is its lead alone.
 */
const OLD_EN_LEAD = /^A few teams are looking for someone (?:who has owned (.+) hands-on|with hands-on experience in (.+))\.$/;

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
 * The #5 first mail in its one form (Shaun 11/18): greeting and who writes; the lead sentence (the stored body, without
 * its list) and why these teams; the postings as a plain bulleted list; where their details are and one plain link; the
 * ask; thanks, the sign-off and the opt-out line. The count words follow the postings shown (one that closed since is
 * not counted). Only the link and the opt-out line are links: the subject, the name and the stored body go as plain
 * words (the body's postings list is shown from the postings). The follow-up is fixed copy (followup.ts).
 */
export function renderAgentMail(input: {
  language: AgentMailLanguage; subject: string; body: string; name: string | null; harperUrl: string;
  postings: readonly AgentPosting[]; senderName: string; senderEmail: string; unsubscribeUrl?: string | null;
  /** The offer (agent/channels.ts; none: a posting mail) and a general mail's events (events first: they asked for them). */
  offer?: AgentOffer; events?: readonly AgentOfferEvent[]; eventsFirst?: boolean;
}): { subject: string; html: string; text: string } {
  const copy = COPY[input.language];
  const sender = input.senderName.trim();
  const name = greetingName(input.language, input.name);
  const postings = input.language === "en" ? input.postings.map(withCompanyCase) : input.postings;
  const count = postings.length;
  const subject = agentMailSubject(input.subject, input.language);
  // The stored body: the lead sentence, then the postings list, shown below from the postings.
  const stored = escapeMarkdown(dropLeadingGreeting(withoutPostingList(plainBody(input.body)))).replace(/\n+/g, " ").trim();
  const written = input.language === "en" ? stored.replace(OLD_EN_LEAD, (_all, owned?: string, experience?: string) => COPY.en.lead(owned ?? experience ?? "")) : stored;
  const close = [
    escapeMarkdown(copy.thanks), paragraph(...copy.signOff(sender).map(escapeMarkdown)), gtmOptOutMarkdown(input.language, input.unsubscribeUrl),
  ];
  if (input.offer === "coaching") {
    const coaching = OFFER_COPY[input.language].coaching;
    const markdown = [
      paragraph(escapeMarkdown(copy.greeting(name)), sender ? escapeMarkdown(coaching.intro(sender)) : ""),
      written || escapeMarkdown(coaching.lead("")),
      paragraph(...coaching.offer.map(escapeMarkdown)),
      `[${escapeMarkdown(coaching.open)}](${input.harperUrl})`,
      paragraph(...coaching.ask.map(escapeMarkdown)),
      ...close,
    ].filter(Boolean).join("\n\n");
    return { subject, ...agentMailHtml(markdown) };
  }
  if (input.offer === "general") {
    const general = OFFER_COPY[input.language].general;
    const postingBlock = count ? [escapeMarkdown(general.postings), postings.map(postingBulletMarkdown).join("\n\n")].join("\n\n") : "";
    const events = input.events ?? [];
    const eventBlock = events.length
      ? [escapeMarkdown(general.events), events.map((event) => eventBulletMarkdown(event, input.language)).join("\n\n")].join("\n\n") : "";
    const markdown = [
      paragraph(escapeMarkdown(copy.greeting(name)), sender ? escapeMarkdown(copy.intro(sender)) : ""),
      escapeMarkdown(general.lead(name)),
      ...(input.eventsFirst ? [eventBlock, postingBlock] : [postingBlock, eventBlock]),
      escapeMarkdown(general.join),
      paragraph(escapeMarkdown(general.gathered), `[${escapeMarkdown(general.open)}](${input.harperUrl})`),
      paragraph(...copy.ask.map(escapeMarkdown)),
      ...close,
    ].filter(Boolean).join("\n\n");
    return { subject, ...agentMailHtml(markdown) };
  }
  const opening = [written, copy.why(name, count, Boolean(written))].filter(Boolean).join(" ");
  const markdown = [
    paragraph(escapeMarkdown(copy.greeting(name)), sender ? escapeMarkdown(copy.intro(sender)) : ""),
    opening,
    // A loose list (a blank line between items), so each item's two lines show as two lines with space between items.
    postings.map(postingBulletMarkdown).join("\n\n"),
    paragraph(escapeMarkdown(copy.gathered(count)), `[${escapeMarkdown(copy.open(count))}](${input.harperUrl})`),
    paragraph(...copy.ask.map(escapeMarkdown)),
    escapeMarkdown(copy.thanks),
    paragraph(...copy.signOff(sender).map(escapeMarkdown)),
    gtmOptOutMarkdown(input.language, input.unsubscribeUrl),
  ].filter(Boolean).join("\n\n");
  return { subject, ...agentMailHtml(markdown) };
}

const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** An event's day as written where it happens (the date part of startsAt): "12월 3일(수)", "Wed, Dec 3". */
export function eventDay(startsAt: string | null | undefined, language: AgentMailLanguage): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(startsAt ?? ""));
  if (!match) return "";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return language === "ko" ? `${month}월 ${day}일(${KO_WEEKDAYS[weekday]})` : `${EN_WEEKDAYS[weekday]}, ${EN_MONTHS[month - 1]} ${day}`;
}

/** One event as a list item: "- Title · day · place (or online)", why it fits under it. Plain words, no links. */
export function eventBulletMarkdown(event: AgentOfferEvent, language: AgentMailLanguage): string {
  const place = event.online ? OFFER_COPY[language].online : mailPlainText(event.place, 60);
  const head = [mailPlainText(event.title, 120), eventDay(event.startsAt, language), place].filter(Boolean).map(escapeMarkdown).join(" · ");
  const why = mailPlainText(event.why, 200);
  return why ? `- ${head}\n  ${escapeMarkdown(why)}` : `- ${head}`;
}

/** A #5 mail's markdown as HTML in Harper's mail layout and as text. */
export function agentMailHtml(markdown: string): { html: string; text: string } {
  const rendered = renderReplyEmail(markdown, { audience: "talent" });
  // The same sans font as the 후보자 링크 mail (Shaun 11/17: keep this font), whatever the reader's default is.
  const html = rendered.html
    .replace('data-harper-email-body-container="true" style="', `data-harper-email-body-container="true" style="font-family:${MAIL_FONT};`)
    // A list of one posting is a tight list (no <p> inside): its item keeps the line break between head and summary too.
    .replace(/<li style="margin:4px 0">(?!\s*<p)/g, '<li style="margin:4px 0;white-space:pre-line">');
  return { html, text: rendered.text };
}

/**
 * What the follow-up (followup.ts) shares with the first mail, so both read the same: the greeting and its name, the
 * count words, the link's label and the "gathered" line, thanks and the sign-off.
 */
export {
  OFFER_COPY as AGENT_OFFER_COPY,
  COPY as AGENT_MAIL_COPY, KO_COUNT as AGENT_KO_COUNT, EN_COUNT as AGENT_EN_COUNT, escapeMarkdown, greetingName as agentGreetingName,
  withCompanyCase as agentCompanyCase,
};
