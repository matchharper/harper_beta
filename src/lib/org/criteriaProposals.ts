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
 * Pass reasons sharpen the criteria (S2 G): what a suggestion is.
 *
 * Harper (the company agent) reads the reasons a company gave when it passed
 * on candidates for a Role (a Pass, a stop, an archive): the company's own
 * words, its reason tags and who the candidates were. When the reasons keep
 * pointing at the same criterion, Harper may suggest making that criterion
 * one level stricter; when they point at something no criterion checks, it
 * may suggest a new criterion (criteriaReview.server.ts). A suggestion changes
 * nothing until a company user accepts it.
 *
 * This file holds the parts that are not a judgment: when a Role is read
 * again, the levels, the stored payload and the To-do text.
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
  /** Candidates Harper reads per review: every new pass, then earlier ones up to this many. */
  reviewSize: 20,
  /** The strictest level Harper suggests (필수 keeps people out of searches). */
  highestLevel: "required" as OrgRoleCriterionLevel,
  /** Days an unanswered suggestion stays in the To-do. */
  expiresInDays: 14,
};

export type CriteriaProposalRules = typeof CRITERIA_PROPOSAL_RULES;

/** One pass decision, as company_decision_consolidation_input_v1 returns it. */
export type PassDecision = {
  id: number;
  /** The candidate (talent) the decision was about. */
  subjectId: string | null;
  reasonTags: string[];
  hasReasonText: boolean;
  createdAt?: string | null;
};

export type CriteriaProposalLevelChange = {
  type: "criterion_level";
  /** The criterion's id, or its name for older criteria (as tags use it). */
  criterionKey: string;
  criterionName: string;
  from: OrgRoleCriterionLevel;
  to: OrgRoleCriterionLevel;
};

/** A criterion the Role does not have yet, added at a level below required. */
export type CriteriaProposalNewCriterion = {
  type: "criterion_add";
  criterionName: string;
  /** What the criterion checks (the criterion's criteria text). */
  description: string;
  to: OrgRoleCriterionLevel;
};

export type CriteriaProposalChange = CriteriaProposalLevelChange | CriteriaProposalNewCriterion;

/** Levels a new criterion may start at: 필수 would keep people out of searches at once. */
export const NEW_CRITERION_LEVELS: readonly OrgRoleCriterionLevel[] = ["nice", "important"];
/** Longest stored name and description of a new criterion. */
export const NEW_CRITERION_NAME_MAX = 60;
export const NEW_CRITERION_DESCRIPTION_MAX = 300;

/** company_agent_update_proposals.payload of a criteria_refinement proposal. */
export type CriteriaProposalPayload = {
  version: 1;
  change: CriteriaProposalChange;
  /**
   * Harper found that count of the window candidates it read with a stated
   * reason were passed for this criterion; decisionIds are those passes.
   */
  evidence: { count: number; window: number; decisionIds: number[] };
  /** The workspace language the suggestion was made in. */
  locale?: CompanyTermLocale;
  /** Harper's one sentence for the To-do card, in locale. */
  rationale?: string;
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

/** A criterion name as compared for a new criterion (case and spacing ignored). */
export function criterionNameKey(name: string) {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/** What a proposal changes, as one stable key (never suggested twice). */
export function criteriaProposalContentKey(change: CriteriaProposalChange) {
  if (change.type === "criterion_add") return `criterion_add:${criterionNameKey(change.criterionName)}`;
  return `criterion_level:${change.criterionKey}:${change.from}>${change.to}`;
}

/** Whether the criterion is still where the proposal found it (a new one: still missing). */
export function criteriaProposalStillApplies(
  change: CriteriaProposalChange,
  criteria: unknown
) {
  if (change.type === "criterion_add") {
    const key = criterionNameKey(change.criterionName);
    return !normalizeOrgRoleCriteria(criteria).some((item) => criterionNameKey(item.name) === key);
  }
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
  if (change.type === "criterion_add")
    return [
      ...normalizeOrgRoleCriteria(criteria),
      {
        name: change.criterionName,
        criteria: change.description,
        ...criterionLevelFields(change.to),
        changeReason,
        changedAt: now.toISOString(),
      },
    ];
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

/** Longest stored sentence Harper writes for the card. */
export const CRITERIA_PROPOSAL_RATIONALE_MAX = 200;

function shorten(value: string, max: number) {
  const chars = Array.from(value.trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

/** The To-do summary column holds this many characters. */
export const CRITERIA_PROPOSAL_SUMMARY_MAX = 160;

/**
 * The company-facing line (To-do, at most 160 characters) and a one-line
 * preview of the change. Harper's own sentence is used when the reader reads
 * the language it was written in; the numbers always come from the evidence.
 */
export function criteriaProposalText(
  payload: CriteriaProposalPayload,
  locale: CompanyTermLocale
) {
  const { change, evidence } = payload;
  const name = shorten(change.criterionName, 40);
  const to = levelName(change.to, locale);
  let preview: string;
  let question: string;
  if (change.type === "criterion_add") {
    preview =
      locale === "en"
        ? `New criterion ${name} (${to}): ${change.description}`
        : `새 기준 ${name} (${to}): ${change.description}`;
    question =
      locale === "en"
        ? `Add '${name}' as a new criterion (${to})?`
        : `'${name}' 기준을 ${withKoreanRo(to)} 새로 넣을까요?`;
  } else {
    const from = levelName(change.from, locale);
    preview = `${name}: ${from} → ${to}`;
    question =
      locale === "en"
        ? `Raise '${name}' from ${from} to ${to}?`
        : `'${name}' 기준을 ${from}에서 ${withKoreanRo(to)} 올릴까요?`;
  }
  const rationale = payload.rationale?.trim();
  if (rationale && (payload.locale ?? "ko") === locale) {
    const count =
      locale === "en"
        ? `(${evidence.count} of ${evidence.window} passes with a reason)`
        : `(이유를 남긴 ${evidence.window}명 중 ${evidence.count}명)`;
    const room = CRITERIA_PROPOSAL_SUMMARY_MAX - Array.from(`${question}  ${count}`).length;
    if (room >= 20)
      return { summary: `${question} ${shorten(rationale, room)} ${count}`, preview };
  }
  if (locale === "en") {
    return {
      summary: `${question} It was the reason for ${evidence.count} of your last ${evidence.window} passes with a reason.`,
      preview,
    };
  }
  return {
    summary: `${question} 최근 이유를 남기고 넘긴 후보 ${evidence.window}명 중 ${evidence.count}명이 ${change.type === "criterion_add" ? "이 이유" : "이 기준"} 때문이었어요.`,
    preview,
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
  const added =
    change?.type === "criterion_add" &&
    typeof change.criterionName === "string" &&
    Boolean(change.criterionName.trim()) &&
    typeof change.description === "string" &&
    Boolean(change.description.trim()) &&
    NEW_CRITERION_LEVELS.includes(change.to as OrgRoleCriterionLevel);
  if (
    raw.version !== 1 ||
    !change ||
    !evidence ||
    (!added &&
      (change.type !== "criterion_level" ||
        typeof change.criterionKey !== "string" ||
        !change.criterionKey ||
        typeof change.criterionName !== "string" ||
        !LEVELS.has(String(change.from)) ||
        !LEVELS.has(String(change.to))))
  )
    return null;
  const count = Number(evidence.count);
  const window = Number(evidence.window);
  if (!Number.isInteger(count) || !Number.isInteger(window) || count < 1 || window < count)
    return null;
  return {
    version: 1,
    change: added
      ? {
          type: "criterion_add",
          criterionName: shorten(String(change.criterionName), NEW_CRITERION_NAME_MAX),
          description: shorten(String(change.description), NEW_CRITERION_DESCRIPTION_MAX),
          to: change.to as OrgRoleCriterionLevel,
        }
      : {
          type: "criterion_level",
          criterionKey: String(change.criterionKey),
          criterionName: String(change.criterionName),
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
    ...(typeof raw.rationale === "string" && raw.rationale.trim()
      ? { rationale: shorten(raw.rationale, CRITERIA_PROPOSAL_RATIONALE_MAX) }
      : {}),
  };
}
