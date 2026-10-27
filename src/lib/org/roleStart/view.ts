import { signalsKey, stableHash, type RoleStartBrief } from "./brief";
import { parseThinConditions, type ThinCondition } from "./widen";
import { CHAT_BRIEF_EDIT, isRoleStartStalled, likedReasonChips, ROLE_START_STALL_MS, type RoleStartCandidate, type RoleStartQuestion, type RoleStartSession } from "./session";

/**
 * The only shape that leaves the server for the browser. It carries what the
 * screen shows (questions, chips, the Brief, cards, grades, evidence, reason
 * chips) and nothing that describes how candidates were found: no scores,
 * weights, pool sizes, timings, costs, models, overlap values or preparation
 * state. Measurements stay in the database and server logs.
 */
function readsStartedAt(session: RoleStartSession) {
  // Only a run still reading counts; otherwise the last write (a new search) is the start.
  return session.progress.find((item) => item.key === "first_three:review" && item.status === "running")?.at ?? null;
}

/**
 * A chat edit of the Brief still running (one older than 5 minutes was cut
 * off), or the last one's failure within 10 minutes.
 */
function chatBriefEdit(session: RoleStartSession) {
  const entry = session.progress.find((item) => item.key === CHAT_BRIEF_EDIT);
  const age = Date.now() - Date.parse(entry?.at ?? "");
  if (entry?.status === "running" && age <= 5 * 60_000) return "running" as const;
  if (entry?.status === "error" && age <= 10 * 60_000) return "error" as const;
  return null;
}

export function roleStartView(session: RoleStartSession | null) {
  if (!session) return null;
  return {
    roleId: session.roleId,
    phase: session.phase,
    /** Sent back with a Brief edit, so a Brief changed meanwhile is not overwritten. */
    briefHash: visibleBriefHash(session.brief),
    /** A background step stopped; the screen offers to start it again. */
    stalled: isRoleStartStalled(session),
    /** A first-three read that has said nothing for a while: the screen stops waiting for it. */
    // Timed from when the reads started (ratings and other writes do not reset it).
    readsStalled:
      session.phase === "evaluating" &&
      // A read can wait for a prepared one and then take its own two minutes.
      Date.now() - Date.parse(readsStartedAt(session) ?? session.updatedAt) > ROLE_START_STALL_MS * 2 &&
      session.firstCandidates.some((candidate) => !candidate.verdict && !candidate.verdictError),
    /** Answers still being applied to the Brief behind the screen. */
    refining: session.refinedAnswers < session.questions.history.length,
    brief: briefView(session.brief),
    questions: {
      history: session.questions.history.map(questionView),
      ...(session.questions.compensation ? { compensation: session.questions.compensation } : {}),
    },
    pendingQuestion: session.pendingQuestion ? questionView(session.pendingQuestion) : null,
    firstCandidates: session.firstCandidates.map(candidateView),
    // The team's own ratings and answers; reason codes stay server-side.
    evaluations: Object.fromEntries(
      Object.entries(session.evaluations).map(([talentId, evaluation]) => [
        talentId,
        {
          rating: evaluation.rating,
          answer: evaluation.answer,
          note: evaluation.note,
          reasons: (evaluation.reasons ?? []).map(({ chipId, label }) => ({ chipId, label })),
          reasonText: evaluation.reasonText ?? null,
          reasonsSkipped: evaluation.reasonsSkipped ?? false,
        },
      ])
    ),
    batch: session.batch
      ? { status: session.batch.status, candidates: session.batch.candidates.map(candidateView), kept: session.batch.kept ?? [] }
      : null,
    // Lines written before generic step wording carried counts; they are not sent.
    progress: session.progress
      .filter((entry) => entry.step)
      .map(({ text, step, status, kind }, index) => ({ key: `p${index}`, text: text || null, step, status, kind: kind ?? null })),
    briefEdit: chatBriefEdit(session),
    notice: session.timings.thin === "true" ? { thin: true, conditions: thinConditionsOf(session) } : null,
  };
}

export type RoleStartView = NonNullable<ReturnType<typeof roleStartView>>;

function thinConditionsOf(session: RoleStartSession): ThinCondition[] {
  return parseThinConditions(session.timings.thinConditions);
}

export function roleStartBriefView(brief: RoleStartBrief) {
  return briefView(brief);
}

/** What a screen's whole-Brief save overwrites: no grade signals, no reference people (kept as stored). */
export function visibleBriefHash(brief: RoleStartBrief) {
  // The summary follows the rest (rewritten in the background), so it does not count here.
  const { hardConditions, criteria, otherNotes } = briefView(brief);
  return stableHash({ hardConditions, criteria, ...(otherNotes.length ? { otherNotes } : {}) });
}

/**
 * A screen or chat edit, or an answer applied to the Brief, saved over the
 * latest record: what it did not change takes what background work wrote
 * meanwhile. Grade signals (for criteria whose text is unchanged), the summary,
 * keywords and job titles (each when left as in startedFrom) and the reference
 * people stay as they are now.
 */
export function withLatestBackground(
  next: RoleStartBrief,
  latest: RoleStartBrief,
  startedFrom?: RoleStartBrief,
  options: { blankSummaryFromLatest?: boolean } = {}
): RoleStartBrief {
  // A summary the edit left as it was takes the latest one; so does an answer's rewrite
  // that came back empty (blankSummaryFromLatest). A summary the team cleared stays empty.
  const summary =
    startedFrom && (next.summary === startedFrom.summary || (options.blankSummaryFromLatest && !next.summary.trim()))
      ? { summary: latest.summary, summaryOf: latest.summaryOf }
      : { summary: next.summary, summaryOf: next.summaryOf };
  const unchanged = (pick: (brief: RoleStartBrief) => unknown) =>
    Boolean(startedFrom) && stableHash(pick(next) ?? null) === stableHash(pick(startedFrom!) ?? null);
  const { titles: _titles, ...rest } = next;
  const titles = unchanged((brief) => brief.titles) ? latest.titles : next.titles;
  return {
    ...rest,
    ...summary,
    ...(titles ? { titles } : {}),
    keywords: unchanged((brief) => brief.keywords) ? latest.keywords : next.keywords,
    references: latest.references,
    criteria: next.criteria.map((criterion) => {
      const fresh = latest.criteria.find((item) => item.id === criterion.id);
      return fresh && signalsKey(fresh) === signalsKey(criterion)
        ? { ...criterion, signals: fresh.signals, signalsOf: fresh.signalsOf }
        : criterion;
    }),
  };
}

function briefView(brief: RoleStartBrief) {
  return {
    summary: brief.summary,
    hardConditions: brief.hardConditions.map((condition) =>
      condition.kind === "min_years" || condition.kind === "max_years"
        ? { id: condition.id, kind: condition.kind, label: condition.label, years: condition.years }
        : { id: condition.id, kind: condition.kind, label: condition.label }
    ),
    criteria: brief.criteria.map((criterion) => ({
      id: criterion.id,
      name: criterion.name,
      criteria: criterion.criteria,
      requirement: criterion.requirement,
      importance: criterion.importance,
      changeReason: criterion.changeReason,
      changedAt: criterion.changedAt,
      reference: criterion.reference ?? null,
    })),
    otherNotes: brief.otherNotes ?? [],
    // Shown on the Brief only; never part of the saved Brief text or matching.
    references: (brief.references ?? []).map((reference) => ({
      id: reference.id,
      label: reference.label,
      url: reference.url,
      status: reference.status,
      summary: reference.summary,
      liked: reference.liked,
      notUsed: reference.notUsed,
      waiting: reference.waiting,
      conflicts: reference.conflicts.map(({ question, answer }) => ({ question, answer })),
      answered: reference.answered,
    })),
  };
}

export type RoleStartBriefView = ReturnType<typeof briefView>;

function questionView(question: RoleStartQuestion) {
  return {
    id: question.id,
    question: question.question,
    why: question.why,
    status: question.status,
    chips: question.chips.map((chip) => ({ id: chip.id, label: chip.label })),
    answer: question.answer ?? null,
  };
}

function candidateView(candidate: RoleStartCandidate) {
  const verdict = candidate.verdict;
  return {
    talentId: candidate.talentId,
    name: candidate.name,
    headline: candidate.headline,
    location: candidate.location,
    current: candidate.current,
    years: candidate.years === null ? null : Math.floor(candidate.years),
    yearsBasis: candidate.yearsBasis ?? null,
    failed: Boolean(candidate.verdictError),
    verdict: verdict
      ? {
          tldr: verdict.tldr,
          finalFit: verdict.finalFit,
          criteria: verdict.criteria.map(({ criterionId, name, fitness, evidence }) => ({
            criterionId,
            name,
            fitness,
            evidence,
          })),
          companyQuestion: verdict.companyQuestion,
          reasonChips: [...(verdict.reasonChips ?? []), ...likedReasonChips(verdict)].map(({ id, label, appliesTo }) => ({ id, label, appliesTo })),
        }
      : null,
  };
}

export type RoleStartCandidateView = ReturnType<typeof candidateView>;
