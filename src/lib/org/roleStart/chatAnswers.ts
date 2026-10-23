import "server-only";

import type { RoleStartBrief } from "./brief";
import { applyChipEffect, QUESTION_MINIMUM } from "./questions";
import type { RoleStartChip, RoleStartQuestion, RoleStartQuestionCandidate } from "./session";

/**
 * Decisions around Harper's own chat questions answered while other work
 * runs, kept free of the database and the model so they can be tested alone:
 * which answer can settle a queued question, what the draft shows first, how
 * many questions count toward the limit, and which chip answers survive a
 * refinement of another answer.
 */

/** Harper's own question from the chat: every chip is the team's words, no preset change. */
export function isChatQuestion(question: { chips: RoleStartChip[] }) {
  return question.chips.length > 0 && question.chips.every((chip) => chip.effect.type === "note");
}

/**
 * A link or a pasted profile. Such an answer names a person whose profile has
 * not been read, so it cannot tell which other question it settles; it is
 * never used to skip or drop one (it is still applied as the team's words).
 */
export function isReferenceMaterial(text: string) {
  return /https?:\/\/|www\.|linkedin\.com\/|github\.com\//i.test(text) || text.trim().length >= 400;
}

/**
 * The team's answer to an answered chat question when it can settle another
 * question: a chip label or short typed words. Null for a skipped question,
 * an answer that was not applied, or a link or pasted profile.
 */
export function settlingAnswer(question: Pick<RoleStartQuestion, "chips" | "status" | "answer">) {
  if (!isChatQuestion(question) || question.status !== "answered") return null;
  const text = question.answer?.text?.trim();
  if (!text || question.answer?.notApplied || isReferenceMaterial(text)) return null;
  return text;
}

/** One answered chat question for the overlap check: the question, with the answer when it can settle others. */
export function answeredForOverlap(question: RoleStartQuestion) {
  return { question: question.question, answer: settlingAnswer(question) };
}

function asCandidate(item: RoleStartQuestionCandidate | RoleStartQuestion): RoleStartQuestionCandidate {
  const { status: _status, askedAt: _askedAt, overlap: _overlap, ...candidate } = item as RoleStartQuestion;
  return candidate;
}

/**
 * What the draft shows once it is written, on top of what the chat did while
 * it ran. `covered` holds chat questions a drafted one covers and drafted
 * questions an answered chat question already asked or settled: those are
 * skipped, never shown and never counted. The first question left is shown
 * at once; an answer still being applied does not hold it. With nothing left
 * below the minimum while words are still to be applied, the questions step
 * waits for that refinement (it asks the next question or opens the Brief).
 */
export function planDraftQueue(args: {
  /** The draft's questions in order: the selected one first. */
  drafted: Array<RoleStartQuestion | RoleStartQuestionCandidate>;
  /** Drafted ids kept only to reach the minimum. */
  fillers: string[];
  /** The chat question open on screen while the draft ran. */
  pending: RoleStartQuestion | null;
  /** Chat questions queued while the draft ran. */
  chatQueued: RoleStartQuestionCandidate[];
  /** Answers given so far (chat questions answered while the draft ran). */
  historyLength: number;
  covered: Set<string>;
  /** Some answer's words are not in the Brief yet. */
  wordsPending: boolean;
  now?: string;
}) {
  const asked = args.pending && !args.covered.has(args.pending.id) ? args.pending : null;
  const chatQueued = args.chatQueued.filter((item) => !args.covered.has(item.id));
  // Harper's own questions count toward the minimum: drafted questions kept
  // only to reach it are dropped once those already make up the minimum.
  const planned = args.historyLength + (asked ? 1 : 0) + chatQueued.length;
  const draftedOrder = args.drafted.filter((item) => !args.covered.has(item.id));
  const skipped = args.drafted.filter((item) => args.covered.has(item.id)).map((item) => item.id);
  const fillerRoom = Math.max(0, QUESTION_MINIMUM - planned - draftedOrder.filter((item) => !args.fillers.includes(item.id)).length);
  let fillersKept = 0;
  const draftQueue = draftedOrder.filter((item) => !args.fillers.includes(item.id) || fillersKept++ < fillerRoom);
  // With no drafted question left, Harper's own queued question comes first.
  const first = asked ? undefined : draftQueue[0] ?? chatQueued[0];
  const queued = [...chatQueued, ...draftQueue].filter((item) => item !== first).map(asCandidate);
  const pending: RoleStartQuestion | null =
    asked ?? (first ? { overlap: null, ...first, status: "pending", askedAt: args.now ?? new Date().toISOString() } : null);
  const waitForWords = !pending && args.historyLength < QUESTION_MINIMUM && args.wordsPending;
  return { pending, queued, skipped, waitForWords };
}

/**
 * Questions that count toward the limit of 5: answered ones, the one on
 * screen and Harper's queued chat cards (reference people take none). A
 * question skipped or dropped because an answer settled it is in none of these.
 */
export function questionsTowardLimit(args: {
  history: RoleStartQuestion[];
  pending: RoleStartQuestion | null;
  queued: RoleStartQuestionCandidate[];
}) {
  return args.history.length + (args.pending ? 1 : 0) + args.queued.filter(isChatQuestion).length;
}

/** The queue without questions an answer settled. */
export function withoutSettled<T extends { id: string }>(queue: T[], settled: Set<string>) {
  return settled.size ? queue.filter((item) => !settled.has(item.id)) : queue;
}

/**
 * A Brief the model rewrote from one answer's words. The words win over
 * earlier choices; chips answered after the refine read the Brief are
 * replayed (the model never saw them).
 */
export function replayLaterChips(args: { rewritten: RoleStartBrief; history: RoleStartQuestion[]; answerIndex: number }) {
  let next = args.rewritten;
  args.history.forEach((question, index) => {
    if (index <= args.answerIndex) return;
    const chip = question.chips.find((item) => item.id === question.answer?.chipId);
    if (chip) next = applyChipEffect(next, chip.effect, `질문 '${question.question}'에 대한 답`).brief;
  });
  return next;
}
