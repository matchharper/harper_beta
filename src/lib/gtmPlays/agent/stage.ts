/**
 * Where a person the agent found stands, in the words the numbers use (Shaun 11/17: the same words and the same sets
 * on the numbers and the log). Pure, built on the numbers' column predicates (funnel.ts inFunnelColumn).
 *   처리 중  neither 제외 nor 연락 yet (찾음 − 제외 − 연락)
 *   제외    the numbers' 제외 (a rule, no address, no fitting companies, left out by Ops, a send error)
 *   연락    the numbers' 연락 (a mail went out)
 *   답장    the numbers' 답장 (also 연락)
 */
import { excludeBucket, inFunnelColumn, type AgentFunnelRow, type FunnelColumn } from "./funnel";
import type { AgentEventKind, AgentStatus } from "./types";

export type AgentStage = "working" | "excluded" | "contacted" | "replied";

export const AGENT_STAGES: readonly AgentStage[] = ["working", "excluded", "contacted", "replied"];

type StageFacts = Pick<AgentFunnelRow, "status" | "excludeReason" | "sentAt" | "repliedAt">;

/** The one stage a person's line shows (답장 over 연락). */
export function stageOf(row: StageFacts): AgentStage {
  if (row.sentAt) return row.repliedAt || row.status === "replied" ? "replied" : "contacted";
  return excludeBucket(row) ? "excluded" : "working";
}

/** The 단계 filter: 연락 shows everyone mailed (the people who replied too), as the 연락 number counts. */
export function inStage(stage: AgentStage, row: StageFacts): boolean {
  const facts = row as AgentFunnelRow;
  if (stage === "excluded") return inFunnelColumn("excluded", facts);
  if (stage === "contacted") return inFunnelColumn("contacted", facts);
  if (stage === "replied") return inFunnelColumn("replied", facts);
  return !inFunnelColumn("excluded", facts) && !inFunnelColumn("contacted", facts);
}

/** What a mailed person did with the mail, from the mail facts (the numbers count the same). */
export type AgentReached = { clicked: boolean; signedUp: boolean; interested: boolean; connected: boolean };

/** How far a mailed person got, furthest first (one word on the line). */
export type ContactOutcome = "connected" | "interested" | "signed_up" | "unsubscribed" | "bounced" | "clicked" | "ended" | "sent";

export function contactOutcome(args: {
  status: AgentStatus; eventKinds: readonly (AgentEventKind | string)[]; reached?: AgentReached | null;
}): ContactOutcome {
  const has = (kind: AgentEventKind) => args.eventKinds.includes(kind);
  const reached = args.reached;
  if (reached?.connected) return "connected";
  if (reached?.interested) return "interested";
  if (reached?.signedUp) return "signed_up";
  if (has("unsubscribed")) return "unsubscribed";
  if (has("bounced")) return "bounced";
  if (reached?.clicked) return "clicked";
  if (args.status === "ended") return "ended";
  return "sent";
}

/**
 * The 메일 반응 filter. 클릭 · 가입 · 관심·지원 · 회사 연결 · 답장 are the numbers' columns themselves (클릭 counts the people
 * who went further too); 반응 없음 is mailed with none of those and no opt-out or bounce; 수신 거부 and 반송 come from the
 * person's record.
 */
export const LOG_AFTER_FILTERS = ["none", "clicked", "signed_up", "interested", "connected", "replied", "unsubscribed", "bounced"] as const;
export type LogAfterFilter = (typeof LOG_AFTER_FILTERS)[number];

const AFTER_COLUMN: Partial<Record<LogAfterFilter, FunnelColumn>> = {
  clicked: "clicked", signed_up: "signedUp", interested: "interested", connected: "connected", replied: "replied",
};

export function afterMatches(filter: LogAfterFilter, row: AgentFunnelRow & { eventKinds: readonly string[] }): boolean {
  const column = AFTER_COLUMN[filter];
  if (column) return inFunnelColumn(column, row);
  if (filter === "unsubscribed") return row.eventKinds.includes("unsubscribed");
  if (filter === "bounced") return row.eventKinds.includes("bounced");
  return inFunnelColumn("contacted", row) && !inFunnelColumn("clicked", row) && !inFunnelColumn("replied", row)
    && !row.eventKinds.includes("unsubscribed") && !row.eventKinds.includes("bounced");
}

/** A number cell → the 사람 filters that show exactly its people. */
export function filtersForColumn(column: FunnelColumn): { stage: AgentStage | null; after: LogAfterFilter | null } {
  if (column === "excluded") return { stage: "excluded", after: null };
  if (column === "contacted") return { stage: "contacted", after: null };
  if (column === "found") return { stage: null, after: null };
  const after = (Object.entries(AFTER_COLUMN).find(([, value]) => value === column)?.[0] ?? null) as LogAfterFilter | null;
  return { stage: null, after };
}
