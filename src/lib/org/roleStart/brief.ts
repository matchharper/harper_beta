import {
  criterionLevel,
  criterionLevelFields,
  normalizeOrgRoleCriteria,
  ORG_ROLE_CRITERION_LEVELS,
  type OrgRoleCriterionLevel,
  type OrgRoleCriterion,
  type OrgRoleCriterionGrade,
} from "@/lib/org/roleCriteria";

/**
 * The Brief of the role start flow: 요약 + 필수 조건 + 평가 기준.
 *
 * 필수 조건 are of two kinds: profile facts (hardConditions, SQL filters) and
 * required criteria checked on the career (requirement "must": they also
 * weigh the ranking and keep out people who clearly lack them). 평가 기준 are
 * the other criteria, 중요 or 있으면 좋음: they only order people.
 */
export type RoleStartHardCondition =
  | { id: string; kind: "min_years"; label: string; years: number }
  | { id: string; kind: "max_years"; label: string; years: number }
  | {
      id: string;
      kind: "location";
      label: string;
      countries: string[];
      cities: string[];
      allowRelocation: boolean;
    }
  | { id: string; kind: "remote_ok"; label: string }
  | { id: string; kind: "other"; label: string };

export type RoleStartCriterionRule = {
  minYears: number | null;
  maxYears: number | null;
};

export type RoleStartCriterion = OrgRoleCriterion & {
  /** Numeric criteria measured by SQL/rules instead of similarity. */
  rule?: RoleStartCriterionRule | null;
  /** Literal evidence: one group per tool/product, with its Korean spelling and aliases. */
  evidenceTerms?: string[][];
  /** signalsKey of the name and criteria the grade signals were written for. */
  signalsOf?: string;
  /** Label of the reference person this criterion came from (shown on screen only). */
  reference?: string;
};

/** A trait read from a reference person, offered to the team; it matters only once accepted. */
export type RoleStartReferenceTrait = {
  id: string;
  label: string;
  criterionName: string;
  criteria: string;
  /** An existing criterion this adds to instead of becoming a new one. */
  mergeInto: string | null;
};

/**
 * A reference person the team gave ("이런 분 같은 사람"). Kept only in the
 * structured Brief (screen and versions): never in the saved Brief text, the
 * verdict input or any hash. Matching sees only the traits the team accepted,
 * as ordinary criteria.
 */
export type RoleStartReference = {
  id: string;
  /** "참고 인물 A" */
  label: string;
  source: "talent" | "link" | "text";
  talentId: string | null;
  url: string | null;
  status: "read" | "unread";
  /** Career facts only. Empty when unread. */
  summary: string;
  traits: RoleStartReferenceTrait[];
  liked: string[];
  notUsed: string[];
  /** Accepted, but the criteria are full and nothing similar to add to. */
  waiting: string[];
  conflicts: Array<{ id: string; question: string; answer: string | null }>;
  answered: boolean;
  addedAt: string;
};

export type RoleStartBrief = {
  summary: string;
  hardConditions: RoleStartHardCondition[];
  criteria: RoleStartCriterion[];
  keywords: string[];
  /**
   * Job titles that do this Role's work, and close titles that do not. Kept
   * for a job-match score; not used for selection yet.
   */
  titles?: { matching: string[]; nearMiss: string[] };
  references?: RoleStartReference[];
  /** The conditions and criteria the summary recaps (summaryKey); a different key means it is rewritten. */
  summaryOf?: string;
  /** 기타 참고 사항: the team's other job-related preferences, soft context for matching (at most 5 lines). */
  otherNotes?: string[];
};

/**
 * A 기타 참고 사항 line about age, gender or another protected trait is never
 * saved or used for matching (same words the reason chips and saved
 * preferences already refuse).
 */
export const PROTECTED_NOTE_WORDS =
  /나이|연령|[1-9]0\s*대|\d+\s*세|성별|여성|남성|여자|남자|결혼|기혼|미혼|임신|출산|육아|자녀|가족|국적|인종|민족|종교|정치|장애|질병|건강|병력|군\s?필|군\s?복무|성적\s*지향|\bage\b|gender|\bsex\b|female|\bmale\b|married|marital|pregnan|religio|nationality|\brace\b|ethnic|disabilit|sexual\s+orientation/i;
export const PROTECTED_NOTE_MESSAGE = "나이·성별 같은 조건은 매칭에 쓰지 않아요. 경력 연차나 직무 요건으로 적어 주세요.";
export const MAX_OTHER_NOTES = 5;

export function isProtectedNote(line: string) {
  return PROTECTED_NOTE_WORDS.test(line);
}

export type RoleStartProbe = {
  /** Which criterion or condition the company has not settled yet. */
  id: string;
  type: "criterion_low" | "years_above" | "years_below";
  criterionId?: string;
  years?: number;
  /** Shown on the info candidate card, e.g. why Harper included the person. */
  label: string;
};

export const ROLE_START_GRADES: OrgRoleCriterionGrade[] = [
  "excellent",
  "good",
  "uncertain",
  "bad",
];

export const ROLE_START_GRADE_LABELS: Record<OrgRoleCriterionGrade, string> = {
  excellent: "매우 잘 맞음",
  good: "잘 맞음",
  uncertain: "확인 필요",
  bad: "맞지 않음",
};

/** Criterion levels (있으면 좋음 · 중요 · 필수); the rules live with the criteria type. */
export type RoleStartLevel = OrgRoleCriterionLevel;

type Leveled = { importance?: number | null; requirement?: string | null };

export const levelOf = criterionLevel;

export function isRequired(criterion: Leveled) {
  return criterion.requirement === "must";
}

export function weightOf(criterion: Leveled) {
  return criterionLevelFields(levelOf(criterion)).importance;
}

/** The same criterion at a new level (requirement and importance kept in step). */
export function withLevel<T extends Leveled>(criterion: T, level: RoleStartLevel): T {
  return { ...criterion, ...criterionLevelFields(level) };
}

export function levelLabel(level: RoleStartLevel) {
  return ORG_ROLE_CRITERION_LEVELS.find((item) => item.level === level)!.ko;
}

/** A level from model or form input; anything else is null. */
export function parseLevel(value: unknown): RoleStartLevel | null {
  if (value === "nice" || value === "important" || value === "required") return value;
  if (value === "must") return "required";
  if (value === "preferred") return "important";
  return null;
}

function text(value: unknown, max = 2_000) {
  return String(value ?? "")
    .replaceAll("\u0000", "")
    .trim()
    .slice(0, max);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textList(value: unknown, max = 20) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => text(item, 120))
        .filter(Boolean)
    )
  ).slice(0, max);
}

function finiteYears(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 60
    ? Math.round(parsed * 10) / 10
    : null;
}

export function shortId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeHardConditions(
  value: unknown
): RoleStartHardCondition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RoleStartHardCondition[] => {
    const source = record(item);
    const id = text(source.id, 80) || shortId("hc");
    const label = text(source.label, 200);
    if (!label) return [];
    if (source.kind === "min_years" || source.kind === "max_years") {
      const years = finiteYears(source.years);
      return years === null ? [] : [{ id, kind: source.kind, label, years }];
    }
    if (source.kind === "location") {
      const countries = textList(source.countries)
        .map((code) => code.toUpperCase())
        .filter((code) => /^[A-Z]{2}$/.test(code));
      const cities = textList(source.cities);
      if (!countries.length && !cities.length) return [];
      return [
        {
          id,
          kind: "location",
          label,
          countries,
          cities,
          // Relocation opens an onsite Role to people elsewhere; only when stated.
          allowRelocation: source.allowRelocation === true,
        },
      ];
    }
    if (source.kind === "remote_ok") return [{ id, kind: "remote_ok", label }];
    return [{ id, kind: "other", label }];
  });
}

export function normalizeRoleStartBrief(value: unknown): RoleStartBrief {
  const source = record(value);
  const rawCriteria = Array.isArray(source.criteria) ? source.criteria : [];
  const criteria = normalizeOrgRoleCriteria(rawCriteria)
    .map((item, index): RoleStartCriterion => {
      const rule = record(record(rawCriteria[index]).rule);
      // Models often write 0 for "no bound"; a zero or inverted cap is no cap.
      const minYears = finiteYears(rule.minYears) || null;
      const rawMax = finiteYears(rule.maxYears) || null;
      const rawTerms = record(rawCriteria[index]).evidenceTerms;
      const evidenceTerms = (Array.isArray(rawTerms) ? rawTerms : [])
        .map((group) => textList(group, 8).map((term) => term.toLowerCase()))
        .filter((group) => group.length)
        .slice(0, 8);
      const maxYears = rawMax !== null && (minYears === null || rawMax >= minYears) ? rawMax : null;
      const signalsOf = text(record(rawCriteria[index]).signalsOf, 64);
      return {
        ...item,
        id: item.id || shortId("cr"),
        ...withLevel({}, levelOf(item)),
        kind: item.kind ?? "similarity",
        // Signals saved before this field existed were written for the text they sit with.
        ...(signalsOf ? { signalsOf } : item.signals?.excellent ? { signalsOf: signalsKey(item) } : {}),
        ...(evidenceTerms.length ? { evidenceTerms } : {}),
        ...(text(record(rawCriteria[index]).reference, 40) ? { reference: text(record(rawCriteria[index]).reference, 40) } : {}),
        ...(minYears !== null || maxYears !== null
          ? { rule: { minYears, maxYears } }
          : {}),
      };
    })
    .filter((item) => item.name && item.criteria);
  return {
    summary: text(source.summary, 4_000),
    hardConditions: normalizeHardConditions(source.hardConditions),
    criteria,
    keywords: textList(source.keywords, 16),
    ...titlesFrom(source),
    ...referencesFrom(source),
    ...(text(source.summaryOf, 80) ? { summaryOf: text(source.summaryOf, 80) } : {}),
    ...otherNotesFrom(source),
  };
}

function otherNotesFrom(source: Record<string, unknown>) {
  const notes = textList(source.otherNotes, MAX_OTHER_NOTES * 2).filter((line) => !isProtectedNote(line)).slice(0, MAX_OTHER_NOTES);
  return notes.length ? { otherNotes: notes } : {};
}

function referencesFrom(source: Record<string, unknown>) {
  const references = (Array.isArray(source.references) ? source.references : []).flatMap((item): RoleStartReference[] => {
    const value = record(item);
    const id = text(value.id, 80);
    const label = text(value.label, 40);
    if (!id || !label) return [];
    const kind = text(value.source, 10);
    return [
      {
        id,
        label,
        source: kind === "talent" || kind === "link" ? kind : "text",
        talentId: text(value.talentId, 80) || null,
        url: text(value.url, 1_000) || null,
        status: value.status === "read" ? "read" : "unread",
        summary: text(value.summary, 1_000),
        traits: (Array.isArray(value.traits) ? value.traits : []).flatMap((raw): RoleStartReferenceTrait[] => {
          const trait = record(raw);
          const traitLabel = text(trait.label, 60);
          const criterionName = text(trait.criterionName, 80);
          const criteria = text(trait.criteria, 1_000);
          if (!traitLabel || !criterionName || !criteria) return [];
          return [{ id: text(trait.id, 80) || shortId("tr"), label: traitLabel, criterionName, criteria, mergeInto: text(trait.mergeInto, 80) || null }];
        }).slice(0, 5),
        liked: textList(value.liked, 10),
        notUsed: textList(value.notUsed, 10),
        waiting: textList(value.waiting, 10),
        conflicts: (Array.isArray(value.conflicts) ? value.conflicts : []).flatMap((raw) => {
          const conflict = record(raw);
          const question = text(conflict.question, 300);
          return question ? [{ id: text(conflict.id, 80) || shortId("cf"), question, answer: text(conflict.answer, 500) || null }] : [];
        }).slice(0, 2),
        answered: value.answered === true,
        addedAt: text(value.addedAt, 40) || new Date().toISOString(),
      },
    ];
  });
  return references.length ? { references: references.slice(0, 5) } : {};
}

/** The Brief as an edit or calibration model reads it: reference people and their tags left out. */
export function briefForModel(brief: RoleStartBrief) {
  const { references: _references, ...rest } = brief;
  return { ...rest, criteria: brief.criteria.map(({ reference: _reference, ...criterion }) => criterion) };
}

function titlesFrom(source: Record<string, unknown>) {
  const titles = record(source.titles);
  const matching = textList(titles.matching ?? source.matchingTitles, 16);
  const nearMiss = textList(titles.nearMiss ?? source.nearMissTitles, 16);
  return matching.length || nearMiss.length ? { titles: { matching, nearMiss } } : {};
}

export function normalizeProbes(value: unknown): RoleStartProbe[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RoleStartProbe[] => {
    const source = record(item);
    const label = text(source.label, 200);
    if (!label) return [];
    const id = text(source.id, 80) || shortId("pr");
    if (source.type === "criterion_low" && text(source.criterionId)) {
      return [
        { id, type: "criterion_low", criterionId: text(source.criterionId), label },
      ];
    }
    if (source.type === "years_above" || source.type === "years_below") {
      const years = finiteYears(source.years);
      return years === null ? [] : [{ id, type: source.type, years, label }];
    }
    return [];
  });
}

/** Stable key for cache invalidation of SQL pools and criterion scores. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return `{${Object.keys(source)
      .sort()
      .filter((key) => source[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function stableHash(value: unknown) {
  const json = canonicalJson(value);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function hardConditionsHash(brief: RoleStartBrief) {
  return stableHash(
    brief.hardConditions
      .filter((condition) => condition.kind !== "other")
      .map(({ label: _label, id: _id, ...rest }) => rest)
  );
}

export function criterionHash(criterion: OrgRoleCriterion) {
  return stableHash({
    // Bump when the scoring formula changes so cached pool scores are recomputed.
    scoring: "similarity+term-bonus-v6",
    name: criterion.name,
    terms: (criterion as RoleStartCriterion).evidenceTerms ?? [],
    criteria: criterion.criteria,
    // Everything criterionQueryText embeds.
    excellent: criterion.signals?.excellent ?? "",
    good: criterion.signals?.good ?? "",
    kind: criterion.kind ?? "similarity",
  });
}

/** What a criterion's grade signals are written from: its name and what counts as evidence. */
export function signalsKey(criterion: { name: string; criteria: string }) {
  return stableHash({ name: criterion.name, criteria: criterion.criteria });
}

/** Signals missing, or written for a name or criteria that have changed since. */
export function needsSignals(criterion: RoleStartCriterion) {
  return !criterion.signals?.excellent || !criterion.signalsOf || criterion.signalsOf !== signalsKey(criterion);
}

/** What the summary recaps: the conditions and each criterion's text and level. */
export function summaryKey(brief: Pick<RoleStartBrief, "hardConditions" | "criteria">) {
  return stableHash({
    hard: brief.hardConditions.map((condition) => condition.label),
    criteria: brief.criteria.map((criterion) => [criterion.name, criterion.criteria, levelOf(criterion)]),
  });
}

/** A summary written for other conditions or criteria than the Brief has now. */
export function needsSummary(brief: RoleStartBrief) {
  return Boolean(brief.summary) && brief.criteria.length > 0 && brief.summaryOf !== summaryKey(brief);
}

/**
 * Everything a verdict reads from the Brief; a changed hash makes a prepared
 * verdict stale. The summary only recaps the rest, so it is not part of it.
 */
export function verdictBriefHash(brief: RoleStartBrief) {
  return stableHash({
    ...(brief.otherNotes?.length ? { notes: brief.otherNotes } : {}),
    hard: brief.hardConditions.map((condition) => condition.label),
    criteria: brief.criteria.map((criterion) => [
      criterion.id ?? criterion.name,
      criterion.name,
      criterion.criteria,
      levelOf(criterion),
      criterion.signals ?? {},
    ]),
  });
}

/** Text embedded for section similarity: what strong evidence looks like. */
export function criterionQueryText(criterion: OrgRoleCriterion) {
  return [
    criterion.name,
    criterion.criteria,
    criterion.signals?.excellent,
    criterion.signals?.good,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The saved Brief text (저장된 Brief 글) for existing readers of the request field
 * (the scheduled search, the role chat). 필수 조건 — profile facts and required
 * criteria alike — are "## Hard constraints": people without them are not
 * recommended. 평가 기준 are "## Preferred criteria": they only order people.
 */
export function renderBriefMarkdown(brief: RoleStartBrief) {
  const lines: string[] = [];
  if (brief.summary) lines.push(brief.summary, "");
  const pushSignals = (criterion: RoleStartCriterion) => {
    for (const grade of ROLE_START_GRADES) {
      const signal = criterion.signals?.[grade];
      if (signal) lines.push(`  - ${ROLE_START_GRADE_LABELS[grade]}: ${signal}`);
    }
  };
  const required = brief.criteria.filter((criterion) => isRequired(criterion));
  const ordering = brief.criteria
    .filter((criterion) => !isRequired(criterion))
    .sort((left, right) => weightOf(right) - weightOf(left));
  lines.push("## Hard constraints");
  for (const condition of brief.hardConditions) lines.push(`- ${condition.label}`);
  for (const criterion of required) {
    lines.push(`- **${criterion.name}**: ${criterion.criteria}`);
    pushSignals(criterion);
  }
  if (!brief.hardConditions.length && !required.length) lines.push("- 회사가 정한 필수 조건은 없습니다.");
  lines.push("- 프로필에서 확인되지 않는 조건은 미충족이 아니라 확인 필요로 봅니다.", "");
  lines.push("## Preferred criteria");
  if (!ordering.length) lines.push("- 회사가 정한 평가 기준은 없습니다.");
  for (const criterion of ordering) {
    lines.push(`- **${criterion.name}** (${levelLabel(levelOf(criterion))}): ${criterion.criteria}`);
    pushSignals(criterion);
  }
  // Soft context for matching: never a reason to leave someone out.
  if (brief.otherNotes?.length) {
    lines.push("", "## Other notes", "- 아래는 팀의 기타 참고 사항이에요. 참고만 하고, 이것만으로 후보를 제외하지 않아요.");
    for (const note of brief.otherNotes) lines.push(`- ${note}`);
  }
  return lines.join("\n").trim();
}

/**
 * Info-candidate ratings settle a criterion's strength; a Brief rewritten by
 * the calibration model keeps them (matched by id, or by name if renamed).
 */
export function reapplySettled(
  brief: RoleStartBrief,
  settled: Array<{ criterionId: string; name: string; level: RoleStartLevel }>
) {
  if (!settled.length) return brief;
  return {
    ...brief,
    criteria: brief.criteria.map((criterion) => {
      const decision = settled.find(
        (item) => item.criterionId === (criterion.id ?? criterion.name) || item.name === criterion.name
      );
      return decision && levelOf(criterion) !== decision.level
        ? withLevel(criterion, decision.level)
        : criterion;
    }),
  };
}

/**
 * Whether a criterion is required is the company's call: a model rewrite
 * neither turns 필수 on nor off (a new criterion never starts as one).
 */
export function keepRequired(before: RoleStartBrief, after: RoleStartBrief): RoleStartBrief {
  return {
    ...after,
    criteria: after.criteria.map((criterion) => {
      const previous = before.criteria.find(
        (item) => (item.id ?? item.name) === (criterion.id ?? criterion.name) || item.name === criterion.name
      );
      const wanted = previous ? isRequired(previous) : false;
      if (isRequired(criterion) === wanted) return criterion;
      return withLevel(criterion, wanted ? "required" : "important");
    }),
  };
}

/**
 * Importance the team set itself (a chip answer) stays as they set it, and a
 * criterion the team named as why someone did not fit is never lowered: a
 * calibration may refine the wording, not reverse the team.
 */
export function keepTeamLevels(
  before: RoleStartBrief,
  after: RoleStartBrief,
  decided: Set<string>,
  gaps: Set<string>
): RoleStartBrief {
  return {
    ...after,
    criteria: after.criteria.map((criterion) => {
      const previous = before.criteria.find((item) => (item.id ?? item.name) === (criterion.id ?? criterion.name));
      if (!previous) return criterion;
      const key = previous.id ?? previous.name;
      // A named gap may only go up; a level the team chose otherwise stays.
      const lowered = weightOf(criterion) < weightOf(previous);
      const keep = gaps.has(key) ? lowered : decided.has(previous.name) || decided.has(key);
      return keep && levelOf(criterion) !== levelOf(previous) ? withLevel(criterion, levelOf(previous)) : criterion;
    }),
  };
}
