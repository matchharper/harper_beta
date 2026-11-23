/**
 * #5 candidate follow-up (Shaun 11/20; words: GTM 메일 검토 rev 4 with the lead's copy review): one only, followupDays
 * after the first mail, in its thread ("Re: <first subject>"), fixed copy (no AI sentences) in one of three forms:
 *   A  nothing new found, an earlier posting still open: "still hiring" (never for someone who opened the link)
 *   B  1-2 new postings and earlier ones still open: "still hiring, and these came up since"
 *   C  every earlier posting closed and 1-2 new: "closed since, these came up instead"
 * Nothing new with every earlier posting closed, or nothing new for someone who opened the link: no follow-up.
 * The other offers (Shaun 11/23 16:50, agent/channels.ts):
 *   D  a coaching mail: one more offer of the same help, no postings (never for someone who opened the link)
 *   E  a general mail: its postings follow A/B/C, and an events block goes with them (events already past dropped,
 *      0-2 new ones within EVENT_MAX_DAYS first); with no posting form, E alone: new postings and/or new events, or,
 *      for an events-only mail not opened, a reminder that its events are still ahead.
 * New postings come from the first mail's matcher and grader (the same bar), never one already sent to the person nor
 * one at a company already named, at most FOLLOWUP_NEW_MAX. The mail's link page shows every posting it names.
 * Company names take no Korean particle (a Latin name makes 와/과 a guess): "A, B 두 곳은", "A 자리는", "A, B까지".
 * Pure: the run (run.server.ts followUps), its I/O (followup.server.ts) and the tests share it.
 */
import { gtmOptOutMarkdown } from "../shared";
import { companyKey } from "./match";
import { mailNames, plainFrameText, postingBulletMarkdown } from "./postingFrame";
import {
  AGENT_EN_COUNT, AGENT_KO_COUNT, AGENT_MAIL_COPY, AGENT_OFFER_COPY, agentCompanyCase, agentGreetingName, agentMailHtml, agentMailSubject,
  agentSubject, escapeMarkdown, eventBulletMarkdown, type AgentMailLanguage,
} from "./render";
import { normalizeMessageId } from "./replies";
import { postingsToMail, withReviews } from "./review";
import type { AgentEvent, AgentOfferEvent, AgentPersonInput, AgentPosting, AgentPostingReview } from "./types";

/** New postings a follow-up adds at most. */
export const FOLLOWUP_NEW_MAX = 2;

export type FollowupVariant = "A" | "B" | "C" | "D" | "E";

export type FollowupPlan =
  | {
    send: true;
    variant: FollowupVariant;
    /** The first mail's postings the "지난번" line names: still open (A, B) or all closed (C). */
    named: AgentPosting[];
    /** The new postings, shown as bullets (B, C, E). */
    fresh: AgentPosting[];
    /** Every posting the mail names: what its link page shows (gtm_mails.postings). */
    postings: AgentPosting[];
    /** A general mail's events block (new first, then earlier ones still ahead); [] otherwise. */
    events?: AgentOfferEvent[];
    /** E only: an events-only mail's reminder that its events are still ahead (nothing new found). */
    reminder?: boolean;
  }
  | { send: false; note: string };

export const FOLLOWUP_COACHING_CLICKED_NOTE = "상담 페이지를 열어본 분이라 후속 메일을 보내지 않았어요";
export const FOLLOWUP_NOTHING_NEW_NOTE = "새로 제안할 공고와 행사가 없어 후속 메일을 보내지 않았어요";
/** Events a mail names at most (as the first mail: events.server.ts EVENTS_PER_MAIL). */
const FOLLOWUP_EVENTS_MAX = 2;

export const FOLLOWUP_CLOSED_NOTE = "제안한 공고가 모두 닫혀 후속 메일을 보내지 않았어요 (새로 맞는 공고도 없어요)";
export const FOLLOWUP_CLICKED_NOTE = "공고 페이지를 열어본 분이라, 새로 맞는 공고가 없어 후속 메일을 보내지 않았어요";
export const FOLLOWUP_HUMAN_NOTE = "사람이 직접 답한 스레드라 후속 메일을 보내지 않았어요";
/** Joined Harper since the first mail (the follow-up asks them to sign up), or on the opt-out list. */
export const FOLLOWUP_MEMBER_NOTE = "그사이 Harper에 가입한 분이라 후속 메일을 보내지 않았어요";
export const FOLLOWUP_SUPPRESSED_NOTE = "연락 받지 않기 목록에 있어 후속 메일을 보내지 않았어요";

/** Whether the person opened the mail's link (noticeReactions records it as a "clicked" line). */
export function openedLink(events: readonly Pick<AgentEvent, "kind">[]): boolean {
  return events.some((event) => event.kind === "clicked");
}

/**
 * What a recorded click changes on the person (run.server.ts noticeReactions): before the follow-up its date stays,
 * and the follow-up goes as B or C only (planFollowup); once the follow-up went out, nothing more is due.
 */
export function followupDueAfterClick(followupSent: boolean): { followupDueAt?: null } {
  return followupSent ? { followupDueAt: null } : {};
}

/**
 * The follow-up's form from the first mail's postings (open now / closed since), the new ones found, and whether the
 * person opened the link (then never A: they have seen those postings).
 */
export function planFollowup(args: {
  open: readonly AgentPosting[]; closed: readonly AgentPosting[]; fresh: readonly AgentPosting[]; clicked: boolean;
}): FollowupPlan {
  const fresh = args.fresh.slice(0, FOLLOWUP_NEW_MAX);
  const open = [...args.open];
  if (fresh.length && open.length) return { send: true, variant: "B", named: open, fresh, postings: [...open, ...fresh] };
  if (fresh.length && args.closed.length) return { send: true, variant: "C", named: [...args.closed], fresh, postings: fresh };
  if (!open.length) return { send: false, note: FOLLOWUP_CLOSED_NOTE };
  if (args.clicked) return { send: false, note: FOLLOWUP_CLICKED_NOTE };
  return { send: true, variant: "A", named: open, fresh: [], postings: open };
}

/** D: a coaching mail's follow-up, once, unless they opened its link (they saw the offer). */
export function planCoachingFollowup(args: { clicked: boolean }): FollowupPlan {
  if (args.clicked) return { send: false, note: FOLLOWUP_COACHING_CLICKED_NOTE };
  return { send: true, variant: "D", named: [], fresh: [], postings: [], events: [] };
}

/**
 * E: a general mail's follow-up. Its postings follow A/B/C (planFollowup) and carry the events block; without a
 * posting form, E alone when something new came up (postings for a mail that had none, or events), or, for an
 * events-only mail not opened, a reminder while its events are still ahead. `upcoming`: the first mail's events not
 * started yet; `freshEvents`: new ones, none already sent.
 */
export function planGeneralFollowup(args: {
  open: readonly AgentPosting[]; closed: readonly AgentPosting[]; fresh: readonly AgentPosting[]; clicked: boolean;
  upcoming: readonly AgentOfferEvent[]; freshEvents: readonly AgentOfferEvent[];
}): FollowupPlan {
  // New ones are picked first; the block lists them by day.
  const events = [...args.freshEvents, ...args.upcoming].slice(0, FOLLOWUP_EVENTS_MAX)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const hadPostings = args.open.length + args.closed.length > 0;
  if (hadPostings) {
    const postings = planFollowup(args);
    if (postings.send) return { ...postings, events };
  }
  const fresh = hadPostings ? [] : args.fresh.slice(0, FOLLOWUP_NEW_MAX);
  if (fresh.length || args.freshEvents.length) return { send: true, variant: "E", named: [], fresh, postings: fresh, events };
  if (!hadPostings && !args.clicked && args.upcoming.length) {
    return { send: true, variant: "E", named: [], fresh: [], postings: [], events, reminder: true };
  }
  return { send: false, note: FOLLOWUP_NOTHING_NEW_NOTE };
}

/** A posting the person was already sent (any candidate mail to them: gtm_mails.postings / posting). */
export type SentPosting = Partial<Pick<AgentPosting, "roleId" | "url" | "companyName" | "mailCompany">>;

const urlKey = (url: string | null | undefined) => String(url ?? "").trim().toLowerCase().replace(/\/+$/, "");

/**
 * The matcher's postings without any already sent to the person (the same Role, the same link, or a company already
 * named: the copy counts 곳), one per company, in the matcher's order.
 */
export function unsentPostings(found: readonly AgentPosting[], sent: readonly SentPosting[]): AgentPosting[] {
  const roleIds = new Set(sent.map((posting) => posting.roleId?.toLowerCase()).filter(Boolean));
  const urls = new Set(sent.map((posting) => urlKey(posting.url)).filter(Boolean));
  const companies = new Set(sent.flatMap((posting) => [companyKey(posting.companyName), companyKey(posting.mailCompany)]).filter(Boolean));
  const kept: AgentPosting[] = [];
  for (const posting of found) {
    const company = companyKey(posting.companyName);
    if (posting.roleId && roleIds.has(posting.roleId.toLowerCase())) continue;
    if (urlKey(posting.url) && urls.has(urlKey(posting.url))) continue;
    if (company && companies.has(company)) continue;
    if (company) companies.add(company);
    kept.push(posting);
  }
  return kept;
}

/** What the first mail's matcher gives (match.server.ts AgentMatch, the part the follow-up reads). */
export type FollowupMatch = {
  postings: AgentPosting[];
  postingTexts: Array<string | null>;
  costUsd: number;
  notJobSeeking: boolean;
  reason: string;
  frame: (postings: readonly AgentPosting[]) => Promise<{ postings: AgentPosting[]; costUsd: number }>;
};

/** The paid steps of the search (followup.server.ts wires the live ones; tests pass fakes). No mail writer. */
export type FollowupSearch = {
  match: (person: AgentPersonInput, opts: { excludeCompanyNames: string[] }) => Promise<FollowupMatch>;
  review: (args: { person: AgentPersonInput; postings: readonly AgentPosting[]; texts: ReadonlyArray<string | null> }) => Promise<{
    reviews: Array<AgentPostingReview | null>; costUsd: number; failed: string | null;
  }>;
  /** Logs one step's cost on the spend log (step followup) as soon as it is spent. */
  spend: (usd: number) => Promise<void>;
};

export type FollowupFound = {
  /** Up to FOLLOWUP_NEW_MAX new postings, graded 잘 맞음 and with their mail lines. */
  postings: AgentPosting[];
  costUsd: number;
  /** The grader's call failed: tried again later, like a first mail's. */
  failed: string | null;
  /** For the log: why nothing new came back. */
  note: string;
};

/**
 * New postings for the follow-up, as for the first mail (run.server.ts handleFound): the matcher (never their current
 * company, nor a company already sent to them), the separate grader's 잘 맞음 only, then the mail lines for the kept
 * ones. Every step's cost goes on the spend log as it is spent.
 */
export async function findFollowupPostings(
  person: AgentPersonInput, args: {
    sent: readonly SentPosting[]; excludeCompanyNames: ReadonlyArray<string | null | undefined>;
    /** A general mail's person: the matcher's "not looking" does not stop the search (the DB says nothing of it). */
    anyIntent?: boolean;
  },
  search: FollowupSearch,
): Promise<FollowupFound> {
  const excludeCompanyNames = [...new Set([...args.excludeCompanyNames, ...args.sent.map((posting) => posting.companyName)]
    .map((name) => name?.trim() ?? "").filter(Boolean))];
  const match = await search.match(person, { excludeCompanyNames });
  await search.spend(match.costUsd);
  let costUsd = match.costUsd;
  const total = () => Number(costUsd.toFixed(6));
  const textOf = new Map(match.postings.map((posting, index) => [posting, match.postingTexts[index] ?? null]));
  const candidates = match.notJobSeeking && !args.anyIntent ? [] : unsentPostings(match.postings, args.sent);
  if (!candidates.length) return { postings: [], costUsd: total(), failed: null, note: match.reason || "새로 맞는 공고가 없어요" };
  const review = await search.review({ person, postings: candidates, texts: candidates.map((posting) => textOf.get(posting) ?? null) });
  await search.spend(review.costUsd);
  costUsd += review.costUsd;
  if (review.failed) return { postings: [], costUsd: total(), failed: `따로 채점을 하지 못했어요 · ${review.failed}`, note: "" };
  const { kept } = postingsToMail(withReviews(candidates, review.reviews), FOLLOWUP_NEW_MAX);
  if (!kept.length) return { postings: [], costUsd: total(), failed: null, note: "새 공고 중 따로 채점에서 '잘 맞음'인 곳이 없어요" };
  const framed = await match.frame(kept);
  await search.spend(framed.costUsd);
  costUsd += framed.costUsd;
  return { postings: framed.postings, costUsd: total(), failed: null, note: "" };
}

// ---------------------------------------------------------------------------------------------------------------
// The words (one place: Shaun edits here)

const koCount = (count: number) => AGENT_KO_COUNT[count] ?? String(count);
const enCount = (count: number) => AGENT_EN_COUNT[count] ?? String(count);
/** "A and B", "A, B, and C". */
const enList = (names: readonly string[]) =>
  names.length > 2 ? `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}` : names.join(" and ");
/** "A 자리는" for one name, "A, B 두 곳은" for more (no particle right after a company name). */
const koNamed = (names: readonly string[]) => (names.length > 1 ? `${names.join(", ")} ${koCount(names.length)} 곳은` : `${names[0]} 자리는`);
const koWithName = (name: string | null) => (name ? `${name}님과 ` : "");

/**
 * The follow-up's own lines (greeting, link label, "N 곳 내용은", thanks and sign-off are the first mail's: render.ts).
 * `names`: the earlier postings' companies the line names; `count`: postings (the link's and the "N 곳" counts);
 * `fresh`: new postings.
 */
const FOLLOWUP_COPY = {
  ko: {
    buried: "지난번에 보내드린 메일이 다른 메일에 묻혔을까 싶어 한 번만 더 연락드려요.",
    stillOpen: (names: readonly string[]) => `그때 소개드린 ${koNamed(names)} 아직 사람을 찾고 있어요.`,
    stillHere: (count: number) => `${count > 1 ? `${koCount(count)} 곳` : "자세한"} 내용은 여기에 그대로 있어요.`,
    more: (names: readonly string[], fresh: number, name: string | null) =>
      `지난번에 소개드린 ${koNamed(names)} 아직 사람을 찾고 있고, 그사이 ${koWithName(name)}잘 맞을 것 같은 자리가 ${koCount(fresh)} 곳 더 보여서 한 번 더 연락드려요.`,
    allHere: (names: readonly string[], count: number) => `${names.join(", ")}까지 ${koCount(count)} 곳을 여기에 모아뒀어요.`,
    // "마감" covers every way a posting stops (closed, expired, paused, gone); "내려갔어요" said it was taken down.
    takenDown: (names: readonly string[], _count: number) => `지난번에 소개드린 ${names.join(", ")} 자리는 그사이 마감됐어요.`,
    instead: (name: string | null, _fresh: number) => `대신 ${koWithName(name)}잘 맞을 것 같은 자리가 새로 보여서 한 번 더 연락드려요.`,
    newHere: (count: number) => AGENT_MAIL_COPY.ko.gathered(count),
    // "나올 때마다" promised every one; Harper's checks decide when a role is worth a message.
    ask: ["궁금한 점이 있으면 이 메일에 편하게 답장 주세요.", "지금은 때가 아니시면 넘기셔도 괜찮아요. Harper에 가입해 두시면 잘 맞는 자리가 나왔을 때 알려드릴게요."],
    // D (coaching) and E (general: the events block, and E alone).
    coachingAsk: ["궁금한 점이 있으면 이 메일에 편하게 답장 주세요.", "지금은 괜찮으시면 넘기셔도 돼요."],
    eventsWith: "다가오는 행사도 함께 적어 둘게요.",
    eventsAhead: "소개드린 행사는 아직 열리기 전이에요.",
    newSince: (name: string | null) => `그사이 ${name ? `${name}님께 ` : ""}맞을 만한 기회가 새로 보여서 한 번 더 연락드려요.`,
  },
  en: {
    buried: "Just following up once in case my last email got buried.",
    stillOpen: (names: readonly string[]) =>
      `${enList(names)}, the ${names.length > 1 ? "teams" : "team"} I mentioned, ${names.length > 1 ? "are" : "is"} still hiring.`,
    stillHere: (_count: number) => "The details are still here.",
    more: (names: readonly string[], fresh: number, _name: string | null) =>
      `${enList(names)}, the ${names.length > 1 ? "teams" : "team"} I mentioned last time, ${names.length > 1 ? "are" : "is"} still hiring, `
      + `and I've since come across ${fresh > 1 ? `${enCount(fresh)} more roles that look` : "one more role that looks"} like a good fit for you, `
      + "so I wanted to reach out once more.",
    allHere: (names: readonly string[], count: number) => `I've put ${count > 2 ? `all ${enCount(count)}` : "both"}, including ${enList(names)}, in one place.`,
    takenDown: (names: readonly string[], count: number) =>
      `The ${enList(names)} ${count > 1 ? "roles" : "role"} I shared last time ${count > 1 ? "have" : "has"} since closed.`,
    instead: (_name: string | null, fresh: number) =>
      `I've come across ${fresh > 1 ? `${enCount(fresh)} new ones that look` : "a new one that looks"} like a good fit for you, so I wanted to reach out once more.`,
    newHere: (_count: number) => "The details are here.",
    ask: [
      "If you have any questions, just reply to this email.",
      "And if now isn't the right time, that's completely fine. If you sign up on Harper, I'll let you know when a role that fits comes up.",
    ],
    coachingAsk: ["If you have any questions, just reply to this email.", "And if now isn't a good time, that's completely fine."],
    eventsWith: "Here are some upcoming events too.",
    eventsAhead: "The events I shared haven't happened yet.",
    newSince: (_name: string | null) => "I've since come across a few new opportunities that might fit you, so I wanted to reach out once more.",
  },
} as const;

/** The follow-up's subject: "Re: <the first mail's subject>" (the first mail's form when it is not known). */
export function followupSubject(firstSubject: string | null | undefined, language: AgentMailLanguage, name: string | null, count: number): string {
  const first = String(firstSubject ?? "").trim().replace(/^(?:re:\s*)+/i, "") || agentSubject({ language, name, count });
  return agentMailSubject(`Re: ${first}`, language);
}

/** The companies of postings as the mail names them (an English mail's names, one per company, plain words). */
function companyNames(postings: readonly AgentPosting[]): string[] {
  const seen = new Set<string>();
  return postings.flatMap((posting) => {
    const name = plainFrameText(mailNames(posting).company, 120);
    const key = companyKey(name) || name;
    if (!name || seen.has(key)) return [];
    seen.add(key);
    return [name];
  });
}

const paragraph = (...parts: string[]) => parts.filter(Boolean).join("\n");

/**
 * The follow-up mail (fixed copy): greeting; the form's lines, the new postings as bullets (B, C), where the details are
 * and one plain link (its page shows plan.postings); the follow-up's ask; thanks, the sign-off and the opt-out line.
 * Only the link and the opt-out line are links.
 */
export function renderAgentFollowup(input: {
  plan: Extract<FollowupPlan, { send: true }>; language: AgentMailLanguage; firstSubject: string | null; name: string | null;
  harperUrl: string; senderName: string; unsubscribeUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const { plan, language } = input;
  const copy = FOLLOWUP_COPY[language];
  const mail = AGENT_MAIL_COPY[language];
  const name = agentGreetingName(language, input.name);
  const shown = (postings: readonly AgentPosting[]) => (language === "en" ? postings.map(agentCompanyCase) : [...postings]);
  const names = companyNames(shown(plan.named));
  const fresh = shown(plan.fresh);
  const count = plan.postings.length;
  const md = escapeMarkdown;
  const link = `[${md(mail.open(count))}](${input.harperUrl})`;
  // A loose list (a blank line between items), as the first mail shows its postings.
  const bullets = fresh.map(postingBulletMarkdown).join("\n\n");
  const offer = AGENT_OFFER_COPY[language];
  const events = plan.events ?? [];
  const eventBullets = events.map((event) => eventBulletMarkdown(event, language)).join("\n\n");
  const eventsBlock = events.length ? [md(plan.variant === "E" ? offer.general.events : copy.eventsWith), eventBullets] : [];
  const middle = plan.variant === "D"
    ? [paragraph(md(copy.buried), md(offer.coaching.offer[0])), `[${md(offer.coaching.open)}](${input.harperUrl})`]
    : plan.variant === "E"
      ? [
        plan.reminder ? paragraph(md(copy.buried), md(copy.eventsAhead)) : md(copy.newSince(name)),
        ...(fresh.length ? [md(offer.general.postings), bullets] : []),
        ...eventsBlock,
        paragraph(md(offer.general.gathered), `[${md(offer.general.open)}](${input.harperUrl})`),
      ]
      : plan.variant === "A"
        ? [paragraph(md(copy.buried), md(copy.stillOpen(names))), paragraph(md(copy.stillHere(count)), link), ...eventsBlock]
        : plan.variant === "B"
          ? [md(copy.more(names, fresh.length, name)), bullets, paragraph(md(copy.allHere(names, count)), link), ...eventsBlock]
          : [paragraph(md(copy.takenDown(names, plan.named.length)), md(copy.instead(name, fresh.length))), bullets, paragraph(md(copy.newHere(count)), link), ...eventsBlock];
  const markdown = [
    md(mail.greeting(name)),
    ...middle,
    paragraph(...(plan.variant === "D" ? copy.coachingAsk : copy.ask).map(md)),
    md(mail.thanks),
    paragraph(...mail.signOff(input.senderName.trim()).map(md)),
    gtmOptOutMarkdown(language, input.unsubscribeUrl),
  ].filter(Boolean).join("\n\n");
  return { subject: followupSubject(input.firstSubject, language, input.name, count), ...agentMailHtml(markdown) };
}

/** The timeline line of a follow-up that went out: its form and the new postings. */
export function followupSentNote(plan: Extract<FollowupPlan, { send: true }>, subject: string): string {
  const form = plan.variant === "A" ? "A · 아직 열린 공고" : plan.variant === "B" ? "B · 새 공고 더함" : plan.variant === "C" ? "C · 닫힌 공고 대신 새 공고"
    : plan.variant === "D" ? "D · 상담 한 번 더" : plan.reminder ? "E · 행사 다시 알림" : "E · 새 기회";
  const fresh = plan.fresh.map((posting) => `${posting.companyName} · ${posting.title}`).join(" / ");
  const events = (plan.events ?? []).map((event) => event.title).join(" / ");
  return `후속 메일 보냄 (${form}) · ${subject}${fresh ? ` · 새 공고: ${fresh}` : ""}${events ? ` · 행사: ${events}` : ""}`.slice(0, 300);
}

/**
 * The headers that put the follow-up in the first mail's thread in the recipient's mail app, from the first mail's RFC
 * Message-ID (gtm_mails.rfc_message_id, stored without brackets); none when it is not known.
 */
export function threadHeaders(rfcMessageId: string | null | undefined): Record<string, string> {
  const id = normalizeMessageId(rfcMessageId);
  return id ? { "In-Reply-To": `<${id}>`, References: `<${id}>` } : {};
}
