/**
 * Where a person the agent found stands, in the words the numbers use (Shaun 11/17: the same words for the same thing
 * on the numbers and the log). Pure, so the server filter, the screen and tests agree.
 *   처리 중  still being worked on or waiting to send (찾음 − 제외 − 연락 on the numbers)
 *   제외    not contacted and will not be (a rule, no address, no fitting companies, left out by Ops, a send error)
 *   연락    a mail went out; the step shown is the furthest it got (회사 연결 … 보냄)
 *   답장    they replied (also 연락: the 연락 filter shows everyone mailed)
 */
import type { AgentEventKind, AgentStatus } from "./types";

export type AgentStage = "working" | "excluded" | "contacted" | "replied";

export const AGENT_STAGES: readonly AgentStage[] = ["working", "excluded", "contacted", "replied"];

/** The statuses each filter on the log shows (연락 includes the people who replied). */
export const STAGE_STATUSES: Record<AgentStage, readonly AgentStatus[]> = {
  working: ["found", "matched", "drafted", "approved"],
  excluded: ["excluded", "no_fit", "skipped", "failed"],
  contacted: ["sent", "ended", "replied"],
  replied: ["replied"],
};

/** The one stage a person's line shows. */
export function stageOf(status: AgentStatus): AgentStage {
  if (status === "replied") return "replied";
  return AGENT_STAGES.find((stage) => STAGE_STATUSES[stage].includes(status)) ?? "working";
}

/** What a mailed person did with the mail, from the mail facts (the numbers count the same). */
export type AgentReached = { clicked: boolean; signedUp: boolean; interested: boolean; connected: boolean };

/** How far a mailed person got, furthest first (one word on the line and in 보낸 메일 "그 뒤"). */
export type ContactOutcome = "connected" | "interested" | "signed_up" | "unsubscribed" | "bounced" | "clicked" | "ended" | "sent";

export function contactOutcome(args: {
  status: AgentStatus; eventKinds: readonly (AgentEventKind | string)[]; reached?: AgentReached | null;
}): ContactOutcome {
  const has = (kind: AgentEventKind) => args.eventKinds.includes(kind);
  const reached = args.reached;
  if (reached?.connected) return "connected";
  if (reached?.interested) return "interested";
  if (reached?.signedUp || has("signed_up")) return "signed_up";
  if (has("unsubscribed")) return "unsubscribed";
  if (has("bounced")) return "bounced";
  if (reached?.clicked || has("clicked")) return "clicked";
  if (args.status === "ended") return "ended";
  return "sent";
}
