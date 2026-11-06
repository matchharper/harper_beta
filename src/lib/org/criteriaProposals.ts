import {
  criterionLevel,
  criterionLevelFields,
  normalizeOrgRoleCriteria,
  ORG_ROLE_CRITERION_LEVELS,
  type OrgRoleCriterion,
  type OrgRoleCriterionLevel,
} from "@/lib/org/roleCriteria";
import { criterionReasonTag } from "@/lib/org/reasonTags";
import { withKoreanRo, type CompanyTermLocale } from "@/lib/org/terms";

/**
 * Pass reasons sharpen the criteria (S2 G): the counting rules.
 *
 * Harper reads the reasons a company gave when it passed on candidates for a
 * Role (a Pass, a stop, an archive). When most recent reasons name the same
 * criterion, it suggests making that criterion one level stricter. A
 * suggestion changes nothing until a company user accepts it.
 *
 * Counting is deterministic: only reason tags name a criterion. A reason
 * given as free text only counts as a reason that names no criterion, so it
 * makes a suggestion less likely, never more. No model is called.
 */

/**
 * Whether Harper makes these suggestions (on since 11/6). Off: nothing is
 * queued and the To-do shows nothing new. One switch; see the S2 report.
 */
export const CRITERIA_PROPOSALS_ENABLED = true;

/** The numbers, in one place. */
export const CRITERIA_PROPOSAL_RULES = {
  /** A Role is read again after this many new pass decisions... */
  everyDecisions: 3,
  /** ...or this many days after the oldest one not read yet. */
  waitDays: 7,
  /** How many recent passes with a reason are counted (one per candidate). */
  window: 10,
  /** A criterion needs at least this many of them... */
  minCount: 3,
  /** ...and at least this share of them. */
  minShare: 0.5,
  /** The strictest level Harper suggests (필수 keeps people out of searches). */
  highestLevel: "required" as OrgRoleCriterionLevel,
  /** Days an unanswered suggestion stays in the To-do. */
  expiresInDays: 14,
};

export type CriteriaProposalRules = typeof CRITERIA_PROPOSAL_RULES;

/** Reason tags that are not about the Role's criteria. */
const NOT_ABOUT_CRITERIA = new Set<string>(["timing"]);

/** One pass decision, as company_decision_consolidation_input_v1 returns it. */
export type PassDecision = {
  id: number;
  /** The candidate (talent) the decision was about. */
  subjectId: string | null;
  reasonTags: string[];
  hasReasonText: boolean;
  createdAt?: string | null;
};

export type CriteriaProposalChange = {
  type: "criterion_level";
  /** The criterion's id, or its name for older criteria (as tags use it). */
  criterionKey: string;
  criterionName: string;
  from: OrgRoleCriterionLevel;
  to: OrgRoleCriterionLevel;
};

/** company_agent_update_proposals.payload of a criteria_refinement proposal. */
export type CriteriaProposalPayload = {
  version: 1;
  change: CriteriaProposalChange;
  /** count of the window most recent passes with a reason named the criterion. */
  evidence: { count: number; window: number; decisionIds: number[] };
  /** The workspace language the suggestion was made in. */
  locale?: CompanyTermLocale;
};

const LEVEL_ORDER = ORG_ROLE_CRITERION_LEVELS.map((item) => item.level);

function levelName(level: OrgRoleCriterionLevel, locale: CompanyTermLocale) {
  const found = ORG_ROLE_CRITERION_LEVELS.find((item) => item.level === level)!;
  return locale === "en" ? found.en : found.ko;
}

/** One level stricter, up to the highest level Harper suggests. */
export function nextCriterionLevel(
  level: OrgRoleCriterionLevel,
  highest: OrgRoleCriterionLevel = CRITERIA_PROPOSAL_RULES.highestLevel
): OrgRoleCriterionLevel | null {
  const index = LEVEL_ORDER.indexOf(level);
  if (index < 0 || index >= LEVEL_ORDER.indexOf(highest)) return null;
  return LEVEL_ORDER[index + 1] ?? null;
}

/** What a proposal changes, as one stable key (never suggested twice). */
export function criteriaProposalContentKey(change: CriteriaProposalChange) {
  return `criterion_level:${change.criterionKey}:${change.from}>${change.to}`;
}

/**
 * The passes that are counted: newest first, the newest one with a reason per
 * candidate. A reason tagged only as timing is about the candidate's moment,
 * not the Role, and is left out.
 */
export function countedPasses(decisions: PassDecision[], size: number) {
  const counted: PassDecision[] = [];
  const seen = new Set<string>();
  for (const decision of [...decisions].sort((a, b) => b.id - a.id)) {
    if (counted.length >= size) break;
    const tags = [...new Set(decision.reasonTags)].filter(
      (tag) => !NOT_ABOUT_CRITERIA.has(tag)
    );
    if (decision.reasonTags.length > 0 && tags.length === 0) continue;
    if (!tags.length && !decision.hasReasonText) continue;
    const candidate = decision.subjectId ?? `decision:${decision.id}`;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    counted.push({ ...decision, reasonTags: tags });
  }
  return counted;
}

/**
 * The suggestion these passes support, or null. A criterion qualifies when at
 * least minCount and minShare of the counted passes name it; the most named
 * one that can still go a level up, and was not suggested before, is chosen.
 */
export function findCriteriaProposal(args: {
  decisions: PassDecision[];
  criteria: unknown;
  /** Content keys the company already accepted or dismissed for this Role. */
  answeredKeys?: Iterable<string>;
  rules?: CriteriaProposalRules;
}): CriteriaProposalPayload | null {
  const rules = args.rules ?? CRITERIA_PROPOSAL_RULES;
  const counted = countedPasses(args.decisions, rules.window);
  if (counted.length < rules.minCount) return null;
  const criteria = normalizeOrgRoleCriteria(args.criteria);
  const byKey = new Map<string, OrgRoleCriterion>();
  for (const criterion of criteria) {
    const key = criterionReasonTag(criterion);
    if (key && !byKey.has(key)) byKey.set(key, criterion);
  }
  const order = [...byKey.keys()];
  const tally = new Map<string, { count: number; latest: number; ids: number[] }>();
  for (const decision of counted) {
    for (const tag of decision.reasonTags) {
      if (!byKey.has(tag)) continue;
      const entry = tally.get(tag) ?? { count: 0, latest: 0, ids: [] };
      entry.count += 1;
      entry.latest = Math.max(entry.latest, decision.id);
      entry.ids.push(decision.id);
      tally.set(tag, entry);
    }
  }
  const answered = new Set(args.answeredKeys ?? []);
  const qualified = [...tally]
    .filter(
      ([, entry]) =>
        entry.count >= rules.minCount &&
        entry.count / counted.length >= rules.minShare
    )
    .sort(
      ([leftKey, left], [rightKey, right]) =>
        right.count - left.count ||
        right.latest - left.latest ||
        order.indexOf(leftKey) - order.indexOf(rightKey)
    );
  for (const [key, entry] of qualified) {
    const criterion = byKey.get(key)!;
    const from = criterionLevel(criterion);
    const to = nextCriterionLevel(from, rules.highestLevel);
    if (!to) continue;
    const change: CriteriaProposalChange = {
      type: "criterion_level",
      criterionKey: key,
      criterionName: criterion.name,
      from,
      to,
    };
    if (answered.has(criteriaProposalContentKey(change))) continue;
    return {
      version: 1,
      change,
      evidence: { count: entry.count, window: counted.length, decisionIds: entry.ids },
    };
  }
  return null;
}

/** Whether the criterion is still where the proposal found it. */
export function criteriaProposalStillApplies(
  change: CriteriaProposalChange,
  criteria: unknown
) {
  const criterion = normalizeOrgRoleCriteria(criteria).find(
    (item) => criterionReasonTag(item) === change.criterionKey
  );
  return Boolean(criterion) && criterionLevel(criterion!) === change.from;
}

/** The criteria with the proposal applied; other criteria are unchanged. */
export function applyCriteriaProposal(
  criteria: unknown,
  change: CriteriaProposalChange,
  changeReason: string,
  now: Date
): OrgRoleCriterion[] {
  return normalizeOrgRoleCriteria(criteria).map((criterion) =>
    criterionReasonTag(criterion) === change.criterionKey
      ? {
          ...criterion,
          ...criterionLevelFields(change.to),
          changeReason,
          changedAt: now.toISOString(),
        }
      : criterion
  );
}

function shorten(value: string, max: number) {
  const chars = Array.from(value.trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

/**
 * The company-facing line (To-do, at most 160 characters) and a one-line
 * preview of the change.
 */
export function criteriaProposalText(
  payload: CriteriaProposalPayload,
  locale: CompanyTermLocale
) {
  const { change, evidence } = payload;
  const name = shorten(change.criterionName, 40);
  const from = levelName(change.from, locale);
  const to = levelName(change.to, locale);
  if (locale === "en") {
    return {
      summary: `Raise '${name}' from ${from} to ${to}? It was the reason for ${evidence.count} of your last ${evidence.window} passes with a reason.`,
      preview: `${name}: ${from} → ${to}`,
    };
  }
  return {
    summary: `'${name}' 기준을 ${from}에서 ${withKoreanRo(to)} 올릴까요? 최근 이유를 남기고 넘긴 후보 ${evidence.window}명 중 ${evidence.count}명이 이 기준 때문이었어요.`,
    preview: `${name}: ${from} → ${to}`,
  };
}

/** Kept on the criterion when the change is accepted (shown with the Brief). */
export function criteriaProposalChangeReason(
  payload: CriteriaProposalPayload,
  locale: CompanyTermLocale
) {
  const { count, window } = payload.evidence;
  return locale === "en"
    ? `From pass reasons (${count} of ${window})`
    : `넘긴 이유 반영 (${window}명 중 ${count}명)`;
}

const LEVELS = new Set<string>(LEVEL_ORDER);

/** Reads a stored payload; null when it is not a criteria proposal. */
export function parseCriteriaProposalPayload(
  value: unknown
): CriteriaProposalPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, any>;
  const change = raw.change as Record<string, unknown> | undefined;
  const evidence = raw.evidence as Record<string, unknown> | undefined;
  if (
    raw.version !== 1 ||
    !change ||
    change.type !== "criterion_level" ||
    typeof change.criterionKey !== "string" ||
    !change.criterionKey ||
    typeof change.criterionName !== "string" ||
    !LEVELS.has(String(change.from)) ||
    !LEVELS.has(String(change.to)) ||
    !evidence
  )
    return null;
  const count = Number(evidence.count);
  const window = Number(evidence.window);
  if (!Number.isInteger(count) || !Number.isInteger(window) || count < 1 || window < count)
    return null;
  return {
    version: 1,
    change: {
      type: "criterion_level",
      criterionKey: change.criterionKey,
      criterionName: change.criterionName,
      from: change.from as OrgRoleCriterionLevel,
      to: change.to as OrgRoleCriterionLevel,
    },
    evidence: {
      count,
      window,
      decisionIds: Array.isArray(evidence.decisionIds)
        ? evidence.decisionIds.map(Number).filter(Number.isFinite)
        : [],
    },
    ...(raw.locale === "en" || raw.locale === "ko" ? { locale: raw.locale } : {}),
  };
}
