/**
 * #5 수치: what happened to the people the agent found, per source and in total. Pure, so the server, the Ops screen
 * and tests count the same way. One row is one person row (gtm_agent_people) created in the period. Every person is
 * in exactly one of 제외 / 대기 / 연락 (Shaun 11/17: no separate "맞는 회사 없음" column; no address is 제외).
 *   찾음       every person found
 *   제외       not contacted and will not be: already a member, mailed within 30 days, opted out, old post, no
 *              address the agent may use (no page to look one up from, the lookup found none, the lookup found
 *              someone else's, or none otherwise), fewer than 2 fitting companies, left out by Ops, or a send that failed
 *   대기       not out yet: being checked (email lookup, posting pick) or written and waiting for send hours / cap
 *   연락       a mail went out (email only)
 *   클릭       the Harper page the message's link opens was on screen, or the person signed up from it
 *   가입       someone made a Harper account from the message's link (before onboarding too; Shaun 11/19), or an
 *              existing member took its postings
 *   관심·지원  a proposed posting went on to saved / applied / connected / offer / accepted
 *   회사 연결  a company connected with the person on Harper for a proposed posting
 *   답장       a reply came (recorded on the screen)
 *   Ashley 답함   Ashley's reply to them went out (gtm_agent_messages, agent/conversationView.ts)
 *   답 안 함    Ashley decided not to answer a reply of theirs (no_reply / stop); by the reason's label
 *   사람에게 넘김  a mail of theirs went to a person on the team: Ashley handed it over (hand_to_human), or her reply to it
 *              was held by the pre-send check or failed (conversationRules.ts mergeHistory's "handed to a person")
 *   연락 그만   Ashley decided to stop writing to them (stop) on a mail of theirs (also in 답 안 함)
 *   답장 후 가입  replied, then signed up
 *   반송/스팸신고/수신거부  of the mailed: a mail that could not be delivered (bounced, failed), was reported as spam,
 *              or the person asked to stop (the mail's 연락 받지 않기 link, or a reply asking to stop) (Shaun 11/19)
 *   신호 뒤 24시간 안에 보냄  the first mail went out within 24 hours of the signal (the post, profile or application)
 *   이메일 찾기  a paid email lookup was tried for them (수치 · 후보's 찾기)
 *   연락 가능   they have an address the agent may write to (on their page or file, or from a lookup)
 * 이메일 찾기 and 연락 가능 are columns like the others (Shaun 11/22: a number opens exactly its people, 찾기's too), so the
 * log's 찾기 filter (stage.ts LOG_FIND_FILTERS) reads the same predicates.
 */
import { hoursFromSignal, SIGNAL_FRESH_HOURS } from "./sendTiming";
import type { AgentChannel, AgentExcludeReason, AgentSource, AgentStatus } from "./types";

/** Why a person is in 제외: the exclusion rule, or no fitting companies, left out by Ops, a failed send. */
export type AgentExcludeBucket = AgentExcludeReason | "no_fit" | "skipped" | "failed";

/** Every 제외 reason, in the order the 제외 이유 filter lists them (the record makes a missing one a type error). */
const BUCKET_ORDER: Record<AgentExcludeBucket, number> = {
  no_lookup_source: 0, lookup_not_found: 1, lookup_other_person: 2, lookup_skipped: 3, no_email: 4, no_mx: 5, no_fit: 6,
  member: 7, recent_contact: 8, quiet_after_end: 9, suppressed: 10, internal: 11, duplicate: 12, stale_signal: 13,
  not_job_seeking: 14, giver: 15, skipped: 16, failed: 17,
};
export const AGENT_EXCLUDE_BUCKETS = (Object.keys(BUCKET_ORDER) as AgentExcludeBucket[])
  .sort((a, b) => BUCKET_ORDER[a] - BUCKET_ORDER[b]);

export type AgentFunnelRow = {
  source: AgentSource;
  status: AgentStatus;
  excludeReason: AgentExcludeReason | null;
  channel: AgentChannel | null;
  sentAt: string | null;
  /** When the person showed the signal (post, profile or application); null when unknown. */
  signalAt?: string | null;
  clickedAt: string | null;
  signedUpAt: string | null;
  repliedAt: string | null;
  /** The first Ashley reply that went out to them (conversationView.ts conversationFactsByPerson); null when none. */
  ashleyRepliedAt?: string | null;
  /** The reason label of their latest reply Ashley did not answer (no_reply / stop); null when none. */
  noReplyReason?: string | null;
  /** When a mail of theirs first went to a person (handed over, or Ashley's reply to it held or failed); null when never. */
  handedOffAt?: string | null;
  /** Their mail's permanent delivery failure (gtm_mails.delivery_status: bounced, complained, failed), else null. */
  deliveryStatus?: string | null;
  /** They asked to stop: the mail's opt-out link or a reply asking to stop. */
  unsubscribed?: boolean;
  interested: boolean;
  connected: boolean;
  costUsd: number;
  /** A paid email lookup was tried for them (이메일 찾기). */
  lookupTried?: boolean;
  /** They have an address the agent may write to (gtm_agent_people.email; 연락 가능). */
  hasEmail?: boolean;
};

/** The most person rows one read takes (views.server.ts agentFunnelRows, and the ids a 수치 · 회사 number opens). */
export const AGENT_PEOPLE_MAX = 20_000;

export type AgentFunnelNumbers = {
  found: number;
  excluded: number;
  excludedBy: Partial<Record<AgentExcludeBucket, number>>;
  /** Not out yet: being checked (email lookup, posting pick) or written and waiting for send hours or the cap. */
  waiting: number;
  contacted: number;
  contactedBy: Partial<Record<AgentChannel, number>>;
  clicked: number;
  signedUp: number;
  interested: number;
  connected: number;
  replied: number;
  ashleyReplied: number;
  noReply: number;
  /** 답 안 함 by reason label (the number's hover words). */
  noReplyBy: Record<string, number>;
  handedOff: number;
  signedUpAfterReply: number;
  /** Of the contacted: bounced (or failed), reported as spam, asked to stop. */
  bounced: number;
  complained: number;
  unsubscribed: number;
  /** Contacted people whose signal time is known, and of them the ones mailed within 24 hours of it. */
  signalKnown: number;
  sentWithin24h: number;
  /** 이메일 찾기: the people a paid lookup was tried for; 연락 가능: the people with an address the agent may use. */
  lookupTried: number;
  withAddress: number;
  costUsd: number;
};

export const EMPTY_AGENT_NUMBERS: AgentFunnelNumbers = {
  found: 0, excluded: 0, excludedBy: {}, waiting: 0, contacted: 0, contactedBy: {},
  clicked: 0, signedUp: 0, interested: 0, connected: 0, replied: 0, ashleyReplied: 0, noReply: 0, noReplyBy: {},
  handedOff: 0, signedUpAfterReply: 0, bounced: 0, complained: 0, unsubscribed: 0, signalKnown: 0, sentWithin24h: 0,
  lookupTried: 0, withAddress: 0, costUsd: 0,
};

/**
 * The numbers' columns, one predicate each (Shaun 11/17: a number and the log behind it are the same set). The counts
 * here and the log's filters (views.server.ts listAgentPeopleLog) both use these, so clicking a number shows exactly
 * the people it counts.
 */
export const FUNNEL_COLUMNS = [
  "found", "excluded", "contacted", "clicked", "signedUp", "interested", "connected", "bounced", "complained", "unsubscribed",
  "replied", "ashleyReplied", "noReply", "handedOff", "signedUpAfterReply", "lookupTried", "withAddress",
] as const;
export type FunnelColumn = (typeof FUNNEL_COLUMNS)[number];

export function inFunnelColumn(column: FunnelColumn, row: AgentFunnelRow): boolean {
  switch (column) {
    case "found": return true;
    case "excluded": return excludeBucket(row) !== null;
    case "contacted": return Boolean(row.sentAt);
    // Signing up from the link takes its page, so a sign-up is a click too.
    case "clicked": return Boolean(row.clickedAt || row.signedUpAt);
    case "signedUp": return Boolean(row.signedUpAt);
    case "interested": return row.interested;
    case "connected": return row.connected;
    // 반송 / 스팸 신고 / 수신 거부 of the mailed. 수신 거부 is the link and Ashley's "연락 그만" alike (she marks the mail
    // the same way), so 답장's 답 안 함 holds those people too and no separate 연락 그만 column is kept (Shaun 11/22).
    case "bounced": return Boolean(row.sentAt && row.deliveryStatus && row.deliveryStatus !== "complained");
    case "complained": return Boolean(row.sentAt && row.deliveryStatus === "complained");
    case "unsubscribed": return Boolean(row.sentAt && row.unsubscribed);
    case "replied": return Boolean(row.repliedAt || row.status === "replied");
    case "ashleyReplied": return Boolean(row.sentAt && row.ashleyRepliedAt);
    case "noReply": return Boolean(row.sentAt) && typeof row.noReplyReason === "string";
    // Like Ashley 답함, inside 연락: both are about a mail of theirs, which only someone we wrote to has.
    case "handedOff": return Boolean(row.sentAt && row.handedOffAt);
    case "signedUpAfterReply": {
      const replied = row.repliedAt ? Date.parse(row.repliedAt) : Number.NaN;
      const signedUp = row.signedUpAt ? Date.parse(row.signedUpAt) : Number.NaN;
      return inFunnelColumn("replied", row) && signedUp >= replied;
    }
    case "lookupTried": return Boolean(row.lookupTried);
    case "withAddress": return Boolean(row.hasEmail);
  }
}

export function tallyAgentPeople(rows: readonly AgentFunnelRow[]): AgentFunnelNumbers {
  const numbers: AgentFunnelNumbers = { ...EMPTY_AGENT_NUMBERS, excludedBy: {}, contactedBy: {}, noReplyBy: {} };
  for (const row of rows) {
    numbers.found += 1;
    numbers.costUsd += Number.isFinite(row.costUsd) ? row.costUsd : 0;
    const bucket = excludeBucket(row);
    if (bucket) {
      numbers.excluded += 1;
      numbers.excludedBy[bucket] = (numbers.excludedBy[bucket] ?? 0) + 1;
    } else if (!row.sentAt && WAITING.has(row.status)) {
      numbers.waiting += 1;
    }
    if (inFunnelColumn("contacted", row)) {
      numbers.contacted += 1;
      if (row.channel) numbers.contactedBy[row.channel] = (numbers.contactedBy[row.channel] ?? 0) + 1;
      if (inFunnelColumn("bounced", row)) numbers.bounced += 1;
      if (inFunnelColumn("complained", row)) numbers.complained += 1;
      if (inFunnelColumn("unsubscribed", row)) numbers.unsubscribed += 1;
      const hours = hoursFromSignal(row.signalAt, row.sentAt);
      if (hours !== null) {
        numbers.signalKnown += 1;
        if (hours <= SIGNAL_FRESH_HOURS) numbers.sentWithin24h += 1;
      }
    }
    if (inFunnelColumn("clicked", row)) numbers.clicked += 1;
    if (inFunnelColumn("signedUp", row)) numbers.signedUp += 1;
    if (inFunnelColumn("interested", row)) numbers.interested += 1;
    if (inFunnelColumn("connected", row)) numbers.connected += 1;
    if (inFunnelColumn("replied", row)) numbers.replied += 1;
    if (inFunnelColumn("ashleyReplied", row)) numbers.ashleyReplied += 1;
    if (inFunnelColumn("noReply", row)) {
      const reason = String(row.noReplyReason);
      numbers.noReply += 1;
      numbers.noReplyBy[reason] = (numbers.noReplyBy[reason] ?? 0) + 1;
    }
    if (inFunnelColumn("handedOff", row)) numbers.handedOff += 1;
    if (inFunnelColumn("signedUpAfterReply", row)) numbers.signedUpAfterReply += 1;
    if (inFunnelColumn("lookupTried", row)) numbers.lookupTried += 1;
    if (inFunnelColumn("withAddress", row)) numbers.withAddress += 1;
  }
  numbers.costUsd = Math.round(numbers.costUsd * 10_000) / 10_000;
  return numbers;
}

/**
 * The number a column shows (the record makes a new column without its number a type error), so a table cell, the log
 * it opens and the tests read one map.
 */
const COLUMN_COUNT: Record<FunnelColumn, (numbers: AgentFunnelNumbers) => number> = {
  found: (n) => n.found, excluded: (n) => n.excluded, contacted: (n) => n.contacted, clicked: (n) => n.clicked,
  signedUp: (n) => n.signedUp, interested: (n) => n.interested, connected: (n) => n.connected, bounced: (n) => n.bounced,
  complained: (n) => n.complained, unsubscribed: (n) => n.unsubscribed, replied: (n) => n.replied,
  ashleyReplied: (n) => n.ashleyReplied, noReply: (n) => n.noReply, handedOff: (n) => n.handedOff,
  signedUpAfterReply: (n) => n.signedUpAfterReply, lookupTried: (n) => n.lookupTried, withAddress: (n) => n.withAddress,
};

export const columnCount = (numbers: AgentFunnelNumbers, column: FunnelColumn): number => COLUMN_COUNT[column](numbers);

const WAITING = new Set<AgentStatus>(["found", "matched", "drafted", "approved"]);

/** The 제외 reason of a person who was never mailed and will not be, or null. */
export function excludeBucket(row: Pick<AgentFunnelRow, "status" | "excludeReason" | "sentAt">): AgentExcludeBucket | null {
  if (row.sentAt) return null;
  if (row.status === "excluded") return row.excludeReason ?? "no_email";
  if (row.status === "no_fit" || row.status === "skipped" || row.status === "failed") return row.status;
  return null;
}

/**
 * Per source (where the person was found): every source in `always` (the ones turned on, so an empty source still
 * shows) plus every source a row came from, in that order.
 */
export function agentFunnelBySource(rows: readonly AgentFunnelRow[], always: readonly AgentSource[] = []): Record<AgentSource, AgentFunnelNumbers> {
  const sources = [...new Set([...always, ...rows.map((row) => row.source)])];
  return Object.fromEntries(sources.map((source) => [
    source, tallyAgentPeople(rows.filter((row) => row.source === source)),
  ]));
}

/** n / d as a whole percent; null when there is nothing to divide by. */
export function agentRate(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}
