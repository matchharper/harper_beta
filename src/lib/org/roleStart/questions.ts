import "server-only";

import {
  levelLabel,
  levelOf,
  parseLevel,
  withLevel,
  normalizeHardConditions,
  normalizeProbes,
  normalizeRoleStartBrief,
  shortId,
  summaryKey,
  type RoleStartBrief,
  type RoleStartCriterion,
  type RoleStartProbe,
} from "./brief";
import type {
  RoleStartChip,
  RoleStartChipEffect,
  RoleStartQuestion,
  RoleStartQuestionState,
} from "./session";

/** Every question the team sees in the start flow, Harper's chat cards included. */
export const QUESTION_HARD_LIMIT = 5;
/**
 * Questions asked before the Brief opens on its own (Harper's own question
 * from reading the JD counts); the team can always go to the Brief earlier.
 */
export const QUESTION_MINIMUM = 3;

type RawCondition = {
  kind: string;
  label: string;
  years: number | null;
  countries: string[];
  cities: string[];
  allowRelocation: boolean | null;
};

type RawCriterion = {
  /** Id of the existing criterion this continues; null for a new one (and in the first draft). */
  id?: string | null;
  name: string;
  criteria: string;
  /** nice / important / required (있으면 좋음 · 중요 · 필수); older outputs give requirement instead. */
  importance?: string | null;
  requirement?: "must" | "preferred";
  kind: "rule" | "similarity" | "judgment";
  minYears: number | null;
  maxYears: number | null;
  /** Absent in the first draft: written per criterion beside it (criterion_signals). */
  signals?: Record<string, string>;
  evidenceTerms?: string[][];
};

/** Each effect variant carries only its own fields. */
type RawEffect = {
  type: string;
  criterion?: string | null;
  requirement?: "must" | "preferred" | null;
  importance?: string | null;
  name?: string | null;
  criteria?: string | null;
  condition?: RawCondition | null;
};

export type RawQuestion = {
  question: string;
  why: string;
  chips: Array<{ label: string; effect: RawEffect }>;
};

export type RawProbe = {
  type: string;
  criterion: string | null;
  years: number | null;
  label: string;
};

export type RawBrief = {
  summary: string;
  hardConditions: RawCondition[];
  criteria: RawCriterion[];
  keywords: string[];
  matchingTitles?: string[];
  nearMissTitles?: string[];
};

/** Keep ids and change history for criteria the model returned under the same name. */
/**
 * modelSignals: keep the grade signals the model wrote for a changed criterion
 * (the first batch is judged with this Brief at once, before any refresh runs).
 */
export function briefFromRaw(raw: RawBrief, previous?: RoleStartBrief, reason?: string, options: { modelSignals?: boolean } = {}) {
  const now = new Date().toISOString();
  // Ids the rewrite keeps by id. A criterion found only by its name never takes
  // one of them (a rename next to a new criterion under the old name would give
  // both the same id), and an id given twice goes to its first criterion only.
  const keptIds = new Set(
    raw.criteria.flatMap((criterion) =>
      criterion.id && previous?.criteria.some((item) => item.id === criterion.id) ? [criterion.id] : []
    )
  );
  const taken = new Set<string>();
  const brief = normalizeRoleStartBrief({
    summary: raw.summary,
    keywords: raw.keywords,
    // A rewrite without title lists keeps the previous ones.
    titles: raw.matchingTitles?.length || raw.nearMissTitles?.length
      ? { matching: raw.matchingTitles ?? [], nearMiss: raw.nearMissTitles ?? [] }
      : previous?.titles,
    hardConditions: [
      ...raw.hardConditions.map((condition) => ({
        ...condition,
        allowRelocation: condition.allowRelocation ?? false,
      })),
      // The model no longer writes "other"; one saved earlier stays until the team removes it.
      ...(previous?.hardConditions ?? []).filter(
        (condition) => condition.kind === "other" && !raw.hardConditions.some((item) => item.label === condition.label)
      ),
    ],
    criteria: raw.criteria.map((criterion) => {
      // Same criterion by the id the model returns (renames keep it), else by name.
      const byId = criterion.id && !taken.has(criterion.id) ? previous?.criteria.find((item) => item.id === criterion.id) : undefined;
      const before =
        byId ??
        previous?.criteria.find((item) => item.name === criterion.name && !(item.id && (keptIds.has(item.id) || taken.has(item.id))));
      if (before?.id) taken.add(before.id);
      const level = parseLevel(criterion.importance) ?? levelOf({ requirement: criterion.requirement });
      const changed =
        before &&
        (before.criteria !== criterion.criteria ||
          before.name !== criterion.name ||
          levelOf(before) !== level);
      // Grade signals never come from an edit: an unchanged criterion keeps its own,
      // a changed one has them written again from its text (refreshRoleStartSignals);
      // only a new criterion takes the ones written with it.
      const sameText = before && before.name === criterion.name && before.criteria === criterion.criteria;
      return {
        id: before?.id,
        name: criterion.name,
        criteria: criterion.criteria,
        ...withLevel({}, level),
        kind: criterion.kind,
        signals: before && !options.modelSignals ? (sameText ? before.signals : undefined) : criterion.signals,
        ...(sameText && !options.modelSignals && before?.signalsOf ? { signalsOf: before.signalsOf } : {}),
        ...(before?.reference ? { reference: before.reference } : {}),
        evidenceTerms: criterion.evidenceTerms ?? [],
        rule:
          criterion.kind === "rule"
            ? { minYears: criterion.minYears, maxYears: criterion.maxYears }
            : null,
        changeReason: changed || (!before && previous) ? reason : before?.changeReason,
        changedAt: changed || (!before && previous) ? now : before?.changedAt,
      };
    }),
  });
  // Reference people are the team's own record; a model rewrite never sees or drops them.
  if (previous?.references?.length) brief.references = previous.references;
  // Hard conditions with the same label keep their ids.
  brief.hardConditions = brief.hardConditions.map((condition) => {
    const before = previous?.hardConditions.find((item) => item.label === condition.label);
    return before ? { ...condition, id: before.id } : condition;
  });
  // The model wrote the summary for exactly these conditions and criteria; one it
  // returned unchanged from before is still the old one, and keeps its old key.
  if (previous && brief.summary === previous.summary) {
    if (previous.summaryOf) brief.summaryOf = previous.summaryOf;
  } else brief.summaryOf = summaryKey(brief);
  return brief;
}

export function probesFromRaw(raw: RawProbe[], brief: RoleStartBrief): RoleStartProbe[] {
  return normalizeProbes(
    raw.map((probe) => ({
      type: probe.type,
      criterionId:
        brief.criteria.find((criterion) => criterion.name === probe.criterion)?.id ?? null,
      years: probe.years,
      label: probe.label,
    }))
  );
}

function effectFromRaw(raw: RawEffect): RoleStartChipEffect {
  switch (raw.type) {
    case "note":
      return { type: "note" };
    case "set_importance": {
      const level = parseLevel(raw.importance);
      return raw.criterion && level ? { type: "set_importance", criterion: raw.criterion, level } : { type: "none" };
    }
    case "set_requirement":
      return raw.criterion && raw.requirement
        ? { type: "set_requirement", criterion: raw.criterion, requirement: raw.requirement }
        : { type: "none" };
    case "refine_criterion":
      return raw.criterion && raw.criteria
        ? { type: "refine_criterion", criterion: raw.criterion, criteria: raw.criteria }
        : { type: "none" };
    case "add_criterion":
      return raw.name && raw.criteria
        ? {
            type: "add_criterion",
            name: raw.name,
            criteria: raw.criteria,
            requirement: parseLevel(raw.importance) === "required" || raw.requirement === "must" ? "must" : "preferred",
            ...(parseLevel(raw.importance) ? { level: parseLevel(raw.importance)! } : {}),
          }
        : { type: "none" };
    case "remove_criterion":
      return raw.criterion ? { type: "remove_criterion", criterion: raw.criterion } : { type: "none" };
    case "add_hard_condition":
      return raw.condition
        ? { type: "add_hard_condition", condition: { ...raw.condition } }
        : { type: "none" };
    default:
      return { type: "none" };
  }
}

export function questionsFromRaw(raw: RawQuestion[]): RoleStartQuestionState["candidates"] {
  return raw
    // A question short of 4 chips is kept; the service fills it (chipGuard).
    .filter((question) => question.question && question.chips.some((chip) => chip.label.trim()))
    .slice(0, 6)
    .map((question) => ({
      id: shortId("q"),
      question: question.question.slice(0, 300),
      why: question.why.slice(0, 300),
      chips: question.chips
        .filter((chip, index, all) => chip.label.trim() && all.findIndex((other) => other.label.trim() === chip.label.trim()) === index)
        .slice(0, 5)
        .map(
        (chip): RoleStartChip => ({
          id: shortId("chip"),
          label: chip.label.slice(0, 80),
          effect: effectFromRaw(chip.effect),
        })
      ),
    }));
}

/**
 * The summary without the sentences that name a removed criterion word for
 * word (a safety net: the summary is not meant to list criteria). Kept as is
 * when nothing would be left.
 */
export function withoutMentions(summary: string, name: string) {
  const sentences = summary.match(/[^.]*?(?:요\.|다\.|\.|$)\s*/g)?.filter((item) => item.trim()) ?? [];
  const kept = sentences.filter((sentence) => !sentence.includes(name));
  return kept.length && kept.length < sentences.length ? kept.join("").trim() : summary;
}

/** Applies a chip deterministically; one chip changes one criterion or condition. */
export function applyChipEffect(
  brief: RoleStartBrief,
  effect: RoleStartChipEffect,
  reason: string
): { brief: RoleStartBrief; applied: string | null } {
  const now = new Date().toISOString();
  const next: RoleStartBrief = {
    ...brief,
    criteria: brief.criteria.map((criterion) => ({ ...criterion })),
    hardConditions: [...brief.hardConditions],
  };
  const target = (name: string) =>
    next.criteria.find((criterion) => criterion.name === name || criterion.id === name);
  switch (effect.type) {
    case "set_importance": {
      const criterion = target(effect.criterion);
      if (!criterion || levelOf(criterion) === effect.level) return { brief, applied: null };
      Object.assign(criterion, withLevel(criterion, effect.level), { changeReason: reason, changedAt: now });
      return {
        brief: next,
        applied: `'${criterion.name}' 기준을 ${levelLabel(effect.level)}${effect.level === "nice" ? "으로" : "로"} 바꿨어요.`,
      };
    }
    case "set_requirement": {
      const criterion = target(effect.criterion);
      // Chips stored before the three levels: must → 필수, preferred → 중요.
      const level = effect.requirement === "must" ? "required" : "important";
      if (!criterion || levelOf(criterion) === level) return { brief, applied: null };
      Object.assign(criterion, withLevel(criterion, level), { changeReason: reason, changedAt: now });
      return {
        brief: next,
        applied: `'${criterion.name}' 기준을 ${levelLabel(level)}로 바꿨어요.`,
      };
    }
    case "refine_criterion": {
      const criterion = target(effect.criterion);
      if (!criterion) return { brief, applied: null };
      Object.assign(criterion, { criteria: effect.criteria, changeReason: reason, changedAt: now });
      return { brief: next, applied: `'${criterion.name}' 기준을 구체화했어요.` };
    }
    case "add_criterion": {
      if (target(effect.name)) return { brief, applied: null };
      next.criteria.push({
        id: shortId("cr"),
        name: effect.name,
        criteria: effect.criteria,
        ...withLevel({}, effect.level ?? levelOf({ requirement: effect.requirement })),
        kind: "similarity",
        changeReason: reason,
        changedAt: now,
      });
      return { brief: next, applied: `'${effect.name}' 기준을 추가했어요.` };
    }
    case "remove_criterion": {
      const criterion = target(effect.criterion);
      if (!criterion) return { brief, applied: null };
      next.criteria = next.criteria.filter((item) => item !== criterion);
      next.summary = withoutMentions(next.summary, criterion.name);
      // Search words that came from the removed criterion go with it.
      // Exact words only, and none another criterion still names.
      const wordsOf = (item: RoleStartCriterion) => [item.name, ...(item.evidenceTerms ?? []).flat()].map((word) => word.toLowerCase());
      const kept = new Set(next.criteria.flatMap(wordsOf));
      const removed = new Set(wordsOf(criterion as RoleStartCriterion).filter((word) => !kept.has(word)));
      next.keywords = next.keywords.filter((keyword) => !removed.has(keyword.toLowerCase()));
      return { brief: next, applied: `'${criterion.name}' 기준은 보지 않을게요.` };
    }
    case "add_hard_condition": {
      const [condition] = normalizeHardConditions([effect.condition]);
      if (!condition || next.hardConditions.some((item) => item.label === condition.label)) {
        return { brief, applied: null };
      }
      next.hardConditions.push(condition);
      return { brief: next, applied: `필수 조건 '${condition.label}'을 추가했어요.` };
    }
    default:
      return { brief, applied: null };
  }
}

/**
 * The next question: the first candidate, in the order the model wrote them
 * (it orders them by how much an answer would change who is shown). Nothing is
 * asked past the limit.
 */
export function selectNextQuestion(args: {
  candidates: RoleStartQuestionState["candidates"];
  askedCount: number;
}): { question: RoleStartQuestion | null; remaining: RoleStartQuestionState["candidates"] } {
  const [first, ...rest] = args.candidates;
  if (!first || args.askedCount >= QUESTION_HARD_LIMIT) return { question: null, remaining: [] };
  return { question: { ...first, status: "pending", overlap: null, askedAt: new Date().toISOString() }, remaining: rest };
}
