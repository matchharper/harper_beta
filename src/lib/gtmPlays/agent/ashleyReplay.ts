/**
 * The replay's rules (scripts/gtm-agent/ashley-replay.ts): Ashley's decide-and-write run on made-up cases or on
 * replies re-read from Gmail, with nothing sent, nothing written to the database and nothing posted to Slack. Kept
 * pure so the bar (no missed stop request, no wrong send) is tested without a model.
 */
import type { CandidateDraft } from "./ashleyAgent";

export const REPLAY_ACTIONS = ["reply", "no_reply", "stop", "hand_to_human"] as const;
export type ReplayAction = (typeof REPLAY_ACTIONS)[number];

/** What the live tick would have done with the mail (before any sending). */
export type ReplayOutcome = {
  /** member / human_owned: settled before any model call, as the tick does. held: written but stopped by the check. */
  action: ReplayAction | "member" | "human_owned" | "held";
  /** A mail would have gone to the person (a reply that passed checkBeforeSend). */
  wouldSend: boolean;
  reason: string;
  checkReasons: string[];
};

export type ReplayGrade = {
  status: "pass" | "fail" | "unlabelled";
  /** The person asked us to stop (only stop expected) and Ashley did something else. */
  missedStop: boolean;
  /** A mail would have gone out where no reply was expected. */
  wrongSend: boolean;
};

/** The outcome of one draft (draftCandidateReply), as the tick would act on it. */
export function replayOutcome(draft: CandidateDraft): ReplayOutcome {
  if (draft.kind === "decided") return { action: draft.action, wouldSend: false, reason: draft.reason, checkReasons: [] };
  if (draft.check.status === "ok") return { action: "reply", wouldSend: true, reason: draft.reason, checkReasons: [] };
  return { action: "held", wouldSend: false, reason: draft.reason, checkReasons: draft.check.reasons };
}

/**
 * Pass when the action is one the case allows (a held draft counts as hand_to_human: it goes to a person; a member's
 * mail as no_reply: Harper's chat answers it). Without expectations (a Gmail replay not labelled yet): unlabelled.
 */
export function gradeReplay(expect: readonly ReplayAction[] | null, outcome: ReplayOutcome): ReplayGrade {
  if (!expect?.length) return { status: "unlabelled", missedStop: false, wrongSend: false };
  const effective: ReplayAction = outcome.action === "held" || outcome.action === "human_owned" ? "hand_to_human"
    : outcome.action === "member" ? "no_reply" : outcome.action;
  const missedStop = expect.every((action) => action === "stop") && effective !== "stop";
  const wrongSend = outcome.wouldSend && !expect.includes("reply");
  return { status: expect.includes(effective) && !missedStop && !wrongSend ? "pass" : "fail", missedStop, wrongSend };
}

/** The expectations of one case or labelled Gmail reply: known actions only, at least one. */
export function parseExpect(value: unknown): ReplayAction[] | null {
  if (!Array.isArray(value)) return null;
  const actions = value.filter((item): item is ReplayAction => (REPLAY_ACTIONS as readonly string[]).includes(String(item)));
  return actions.length && actions.length === value.length ? [...new Set(actions)] : null;
}

/** The replay's I/O must have no sender: a run that could send refuses to start. */
export function assertReplayCannotSend(io: { send?: unknown }): void {
  if (io.send !== undefined) throw new Error("replay: a send function is wired, refusing to run (the replay never sends)");
}

/** Hosts the replay never calls (mail sending, Slack): a guard on fetch on top of the sender-less I/O. */
export function replayBlockedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return ["resend.com", "slack.com"].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export type ReplayTotals = { cases: number; pass: number; fail: number; unlabelled: number; missedStops: number; wrongSends: number };

export function replayTotals(grades: readonly ReplayGrade[]): ReplayTotals {
  return {
    cases: grades.length,
    pass: grades.filter((grade) => grade.status === "pass").length,
    fail: grades.filter((grade) => grade.status === "fail").length,
    unlabelled: grades.filter((grade) => grade.status === "unlabelled").length,
    missedStops: grades.filter((grade) => grade.missedStop).length,
    wrongSends: grades.filter((grade) => grade.wrongSend).length,
  };
}

/** The bar (addition E): no missed stop request and no wrong send. */
export const replayMeetsBar = (totals: ReplayTotals) => totals.missedStops === 0 && totals.wrongSends === 0;
