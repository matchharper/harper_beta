/**
 * #5 숫자: what happened to the people the agent found, per source and in total. Pure, so the server, the Ops screen
 * and tests count the same way. One row is one person row (gtm_agent_people) created in the period.
 *   찾음       every person found
 *   제외       not contacted on purpose (already a member, mailed within 30 days, opted out, old post, …)
 *   맞는 회사 없음  fewer than 2 fitting companies: no contact, only a record (Shaun 11/17)
 *   연락       a mail went out, or a person sent the drafted message by hand (보냈어요)
 *   클릭       the Harper page the message's link opens was on screen, or the person signed up from it
 *   가입       someone signed in from the message's link and onboarded
 *   관심·지원  a proposed posting went on to saved / applied / connected / offer / accepted
 *   회사 연결  a company connected with the person on Harper for a proposed posting
 *   답장       a reply came (recorded on the screen)
 */
import type { AgentChannel, AgentExcludeReason, AgentSource, AgentStatus } from "./types";

export type AgentFunnelRow = {
  source: AgentSource;
  status: AgentStatus;
  excludeReason: AgentExcludeReason | null;
  channel: AgentChannel | null;
  sentAt: string | null;
  clickedAt: string | null;
  signedUpAt: string | null;
  repliedAt: string | null;
  interested: boolean;
  connected: boolean;
  costUsd: number;
};

export type AgentFunnelNumbers = {
  found: number;
  excluded: number;
  excludedBy: Partial<Record<AgentExcludeReason, number>>;
  noFit: number;
  /** Drafted or approved, not out yet (waiting for send hours, the cap or approval). */
  waiting: number;
  /** In the hand-send list (LinkedIn / X / Threads), not sent yet. */
  queuedHuman: number;
  contacted: number;
  contactedBy: Partial<Record<AgentChannel, number>>;
  clicked: number;
  signedUp: number;
  interested: number;
  connected: number;
  replied: number;
  skipped: number;
  costUsd: number;
};

export const EMPTY_AGENT_NUMBERS: AgentFunnelNumbers = {
  found: 0, excluded: 0, excludedBy: {}, noFit: 0, waiting: 0, queuedHuman: 0, contacted: 0, contactedBy: {},
  clicked: 0, signedUp: 0, interested: 0, connected: 0, replied: 0, skipped: 0, costUsd: 0,
};

export const AGENT_FUNNEL_SOURCES: readonly AgentSource[] = ["recruiter", "opentowork", "threads", "manual", "role"];

export function tallyAgentPeople(rows: readonly AgentFunnelRow[]): AgentFunnelNumbers {
  const numbers: AgentFunnelNumbers = { ...EMPTY_AGENT_NUMBERS, excludedBy: {}, contactedBy: {} };
  for (const row of rows) {
    numbers.found += 1;
    numbers.costUsd += Number.isFinite(row.costUsd) ? row.costUsd : 0;
    if (row.status === "excluded") {
      numbers.excluded += 1;
      if (row.excludeReason) numbers.excludedBy[row.excludeReason] = (numbers.excludedBy[row.excludeReason] ?? 0) + 1;
    }
    if (row.status === "no_fit") numbers.noFit += 1;
    if (row.status === "drafted" || row.status === "approved" || row.status === "matched") numbers.waiting += 1;
    if (row.status === "queued_human") numbers.queuedHuman += 1;
    if (row.status === "skipped") numbers.skipped += 1;
    if (row.sentAt) {
      numbers.contacted += 1;
      if (row.channel) numbers.contactedBy[row.channel] = (numbers.contactedBy[row.channel] ?? 0) + 1;
    }
    // Signing up from the link takes its page, so a sign-up is a click too (as #4).
    if (row.clickedAt || row.signedUpAt) numbers.clicked += 1;
    if (row.signedUpAt) numbers.signedUp += 1;
    if (row.interested) numbers.interested += 1;
    if (row.connected) numbers.connected += 1;
    if (row.repliedAt || row.status === "replied") numbers.replied += 1;
  }
  numbers.costUsd = Math.round(numbers.costUsd * 10_000) / 10_000;
  return numbers;
}

export function agentFunnelBySource(rows: readonly AgentFunnelRow[]): Record<AgentSource, AgentFunnelNumbers> {
  return Object.fromEntries(AGENT_FUNNEL_SOURCES.map((source) => [
    source, tallyAgentPeople(rows.filter((row) => row.source === source)),
  ])) as Record<AgentSource, AgentFunnelNumbers>;
}

/** A reply that asks not to be contacted again (the screen pre-checks "연락 그만"; the Ops person decides). */
export function looksLikeStopRequest(text: string | null | undefined): boolean {
  const value = String(text ?? "").toLowerCase();
  return /연락\s*(하지\s*마|그만|원치\s*않|사절|받고\s*싶지\s*않|안\s*받)|수신\s*거부|그만\s*(보내|연락)|보내지\s*마|unsubscribe|stop (contacting|emailing|messaging|sending)|remove me|do not (contact|email|message)|don'?t (contact|email|message) me|no more (emails|messages)/i
    .test(value);
}

/** n / d as a whole percent; null when there is nothing to divide by. */
export function agentRate(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}
