import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import {
  CRITERIA_PROPOSAL_RATIONALE_MAX,
  CRITERIA_PROPOSAL_RULES,
  nextCriterionLevel,
  type CriteriaProposalPayload,
  type PassDecision,
} from "@/lib/org/criteriaProposals";
import { criterionReasonTag, FIXED_REASON_TAGS, type FixedReasonTag } from "@/lib/org/reasonTags";
import {
  criterionLevel,
  normalizeOrgRoleCriteria,
  ORG_ROLE_CRITERION_LEVELS,
  type OrgRoleCriterionLevel,
} from "@/lib/org/roleCriteria";
import { COMPANY_TERMS, type CompanyTermLocale } from "@/lib/org/terms";

/**
 * Harper's review of pass reasons (S2 G): what Harper reads and how the
 * evidence it cites is checked. Harper decides whether a suggestion is
 * warranted; this file only gathers the facts and keeps the suggestion
 * honest (real passes, real reasons, one existing criterion one level up).
 */

/** What the review reads about one pass decision besides the consolidation input. */
export type PassDecisionDetail = {
  id: number;
  action: string;
  /** detail.stage of a stage change (archived). */
  stage?: string | null;
  /** The company's own words, kept on the decision. */
  reasonText?: string | null;
};

/** A company note on a candidate for the Role (talent_progress org_note). */
export type CandidateNote = { talentId: string; text: string; createdAt?: string | null };

/** One candidate in the review, at its newest pass decision. */
export type ReviewedPass = {
  /** The decision Harper cites for this candidate. */
  decisionId: number;
  talentId: string | null;
  at: string | null;
  action: "pass" | "stop" | "archive";
  /** After the cursor: not read by an earlier review. */
  isNew: boolean;
  /** The company's own words: decision reasons, then notes. */
  reasons: string[];
  tags: string[];
  headline: string | null;
};

export type CriteriaReview = {
  /** Candidates passed with a stated reason, newest first. */
  passes: ReviewedPass[];
  /** Candidates passed without any reason, by whether they are new. */
  silent: { newCount: number; earlierCount: number };
};

/** What the review saved on its job: what Harper may cite, and what it filed. */
export type CriteriaReviewSnapshot = {
  passes: Array<{ id: number; talentId: string | null; isNew: boolean }>;
  /** Candidates with a stated reason in the review (the evidence window). */
  withReason: number;
  locale: CompanyTermLocale;
  proposalId?: string | null;
};

const REASONS_PER_CANDIDATE = 3;
const REASON_MAX = 300;
const NOTE_MAX = 200;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function shorten(value: string, max: number) {
  const chars = Array.from(value);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : value;
}

function passAction(detail?: PassDecisionDetail): ReviewedPass["action"] {
  if (detail?.action === "stop") return "stop";
  if (detail?.action === "stage_change" && detail.stage === "archived") return "archive";
  return "pass";
}

/**
 * The candidates Harper reads: every candidate passed since the cursor, then
 * earlier ones up to the review size. One line per candidate (its newest
 * decision), with every reason the company gave on it here.
 */
export function buildCriteriaReview(args: {
  /** Newest first, as company_decision_consolidation_input_v1 returns them. */
  decisions: PassDecision[];
  cursor: number | null;
  details: PassDecisionDetail[];
  notes?: CandidateNote[];
  headlines?: Record<string, string | null | undefined>;
  size?: number;
}): CriteriaReview {
  const size = args.size ?? CRITERIA_PROPOSAL_RULES.reviewSize;
  const cursor = Number(args.cursor) || 0;
  const details = new Map(args.details.map((detail) => [Number(detail.id), detail]));
  const notes = new Map<string, string[]>();
  for (const note of [...(args.notes ?? [])].sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
  )) {
    const text = clean(note.text);
    if (text) notes.set(note.talentId, [...(notes.get(note.talentId) ?? []), text]);
  }
  const byCandidate = new Map<string, ReviewedPass>();
  for (const decision of [...args.decisions].sort((a, b) => b.id - a.id)) {
    const key = decision.subjectId ?? `decision:${decision.id}`;
    const detail = details.get(decision.id);
    let entry = byCandidate.get(key);
    if (!entry) {
      entry = {
        decisionId: decision.id,
        talentId: decision.subjectId,
        at: decision.createdAt ?? null,
        action: passAction(detail),
        isNew: decision.id > cursor,
        reasons: [],
        tags: [],
        headline: decision.subjectId ? clean(args.headlines?.[decision.subjectId]) || null : null,
      };
      byCandidate.set(key, entry);
    }
    const reason = clean(detail?.reasonText);
    if (reason && !entry.reasons.includes(reason)) entry.reasons.push(reason);
    for (const tag of decision.reasonTags.map(clean))
      if (tag && !entry.tags.includes(tag)) entry.tags.push(tag);
  }
  const entries = [...byCandidate.values()];
  for (const entry of entries) {
    for (const note of entry.talentId ? notes.get(entry.talentId) ?? [] : [])
      if (!entry.reasons.includes(note)) entry.reasons.push(note);
    entry.reasons = entry.reasons
      .slice(0, REASONS_PER_CANDIDATE)
      .map((text, index) => shorten(text, index === 0 ? REASON_MAX : NOTE_MAX));
  }
  const fresh = entries.filter((entry) => entry.isNew);
  const kept = [...fresh, ...entries.filter((entry) => !entry.isNew).slice(0, Math.max(0, size - fresh.length))];
  const stated = (entry: ReviewedPass) => entry.reasons.length > 0 || entry.tags.length > 0;
  return {
    passes: kept.filter(stated),
    silent: {
      newCount: kept.filter((entry) => entry.isNew && !stated(entry)).length,
      earlierCount: kept.filter((entry) => !entry.isNew && !stated(entry)).length,
    },
  };
}

/** What Harper may cite, saved on the review's job before it runs. */
export function criteriaReviewSnapshot(
  review: CriteriaReview,
  locale: CompanyTermLocale
): CriteriaReviewSnapshot {
  return {
    passes: review.passes.map((pass) => ({ id: pass.decisionId, talentId: pass.talentId, isNew: pass.isNew })),
    withReason: review.passes.length,
    locale,
  };
}

/** Reads a saved snapshot; null when the job has none. */
export function parseCriteriaReviewSnapshot(value: unknown): CriteriaReviewSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, any>;
  if (!Array.isArray(raw.passes) || !Number.isInteger(raw.withReason)) return null;
  return {
    passes: raw.passes
      .filter((pass: any) => pass && Number.isSafeInteger(Number(pass.id)))
      .map((pass: any) => ({
        id: Number(pass.id),
        talentId: typeof pass.talentId === "string" ? pass.talentId : null,
        isNew: pass.isNew === true,
      })),
    withReason: raw.withReason,
    locale: raw.locale === "en" ? "en" : "ko",
    proposalId: typeof raw.proposalId === "string" && raw.proposalId ? raw.proposalId : null,
  };
}

function levelLabel(level: OrgRoleCriterionLevel) {
  const found = ORG_ROLE_CRITERION_LEVELS.find((item) => item.level === level)!;
  return `${found.en.toLowerCase()} (${found.ko})`;
}

/**
 * The suggestion Harper asked for, checked against the Role and the review:
 * one existing criterion one level up, cited passes that are in the review
 * with a stated reason, at least one of them new, at least two candidates.
 * Throws the reason in words the model can act on.
 */
export function criteriaProposalFromReview(args: {
  criteria: unknown;
  snapshot: CriteriaReviewSnapshot;
  criterionId: unknown;
  decisionIds: unknown;
  rationale: unknown;
}): CriteriaProposalPayload {
  const criteria = normalizeOrgRoleCriteria(args.criteria);
  const key = clean(args.criterionId);
  const criterion = criteria.find((item) => criterionReasonTag(item) === key);
  if (!criterion) {
    const ids = criteria.map(criterionReasonTag).filter(Boolean);
    throw new CriteriaReviewInputError(
      `criterionId ${key || "(empty)"} is not one of this Role's criteria${ids.length ? `: ${ids.join(", ")}` : ""}. No suggestion was added.`
    );
  }
  const from = criterionLevel(criterion);
  const to = nextCriterionLevel(from);
  if (!to)
    throw new CriteriaReviewInputError(
      `${criterion.name} is already ${levelLabel(from)}, the strictest level Harper suggests. No suggestion was added.`
    );
  const cited = Array.isArray(args.decisionIds) ? [...new Set(args.decisionIds.map(Number))] : [];
  const reviewed = new Map(args.snapshot.passes.map((pass) => [pass.id, pass]));
  const unknown = cited.filter((id) => !reviewed.has(id));
  if (!cited.length || unknown.length)
    throw new CriteriaReviewInputError(
      `${unknown.length ? `Decision ${unknown.join(", ")} is not` : "No decision was"} a pass with a stated reason in this review; cite the listed decisions whose reasons support the change. No suggestion was added.`
    );
  const candidates = new Set(cited.map((id) => reviewed.get(id)!.talentId ?? `decision:${id}`));
  if (candidates.size < 2)
    throw new CriteriaReviewInputError(
      "A suggestion needs the reasons of at least two different candidates. No suggestion was added."
    );
  if (!cited.some((id) => reviewed.get(id)!.isNew))
    throw new CriteriaReviewInputError(
      "Cite at least one pass since the last review; earlier passes alone were already reviewed. No suggestion was added."
    );
  const rationale = clean(args.rationale);
  if (!rationale)
    throw new CriteriaReviewInputError("reason is required: one short sentence for the To-do card. No suggestion was added.");
  return {
    version: 1,
    change: { type: "criterion_level", criterionKey: key, criterionName: criterion.name, from, to },
    evidence: {
      count: candidates.size,
      window: Math.max(args.snapshot.withReason, candidates.size),
      decisionIds: cited.sort((a, b) => b - a),
    },
    locale: args.snapshot.locale,
    rationale: shorten(rationale, CRITERIA_PROPOSAL_RATIONALE_MAX),
  };
}

/** A refused suggestion: goes back to Harper to correct or drop. */
export class CriteriaReviewInputError extends Error {}

function tagLabel(tag: string, names: Map<string, string>) {
  const criterion = names.get(tag);
  if (criterion) return `criterion ${criterion}`;
  if ((FIXED_REASON_TAGS as readonly string[]).includes(tag))
    return COMPANY_TERMS.reasonTag[tag as FixedReasonTag].en.toLowerCase();
  return `${tag} (no longer a criterion)`;
}

function quote(text: string) {
  return `"${text.replace(/"/g, "'")}"`;
}

/**
 * The review as Harper reads it: the Role's criteria, the passes with their
 * reasons, and the changes the company already answered. Facts only; the
 * judgment contract is the criteria_proposal policy.
 */
export function formatCriteriaReview(args: {
  roleId: string;
  roleTitle?: string | null;
  criteria: unknown;
  review: CriteriaReview;
  answeredKeys?: string[];
  locale: CompanyTermLocale;
}) {
  const criteria = normalizeOrgRoleCriteria(args.criteria);
  const names = new Map(criteria.map((item) => [criterionReasonTag(item), item.name]));
  const criteriaLines = criteria.length
    ? criteria.map((item) => {
        const level = criterionLevel(item);
        const next = nextCriterionLevel(level);
        return [
          `- ${criterionReasonTag(item)} | ${item.name} | ${levelLabel(level)}`,
          next ? `can be raised to ${levelLabel(next)}` : "cannot be raised",
          item.criteria ? shorten(clean(item.criteria), 200) : "",
        ]
          .filter(Boolean)
          .join(" | ");
      })
    : ["- (none)"];
  const passLine = (pass: ReviewedPass) =>
    [
      `- decision ${pass.decisionId} | ${formatLlmDateTime(pass.at)} | ${pass.action === "stop" ? "stopped the process" : pass.action === "archive" ? "archived" : "passed"}${pass.talentId ? ` | candidate ${pass.talentId}` : ""}${pass.headline ? ` | headline: ${shorten(pass.headline, 150)}` : ""}`,
      ...pass.reasons.map((reason) => `  reason: ${quote(reason)}`),
      pass.tags.length ? `  tags: ${pass.tags.map((tag) => tagLabel(tag, names)).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  const fresh = args.review.passes.filter((pass) => pass.isNew);
  const earlier = args.review.passes.filter((pass) => !pass.isNew);
  const answered = (args.answeredKeys ?? []).flatMap((key) => {
    const match = /^criterion_level:(.+):(nice|important|required)>(nice|important|required)$/.exec(key);
    if (!match) return [];
    const [, criterionKey, from, to] = match;
    return [`- ${names.get(criterionKey) ?? criterionKey}: ${levelLabel(from as OrgRoleCriterionLevel)} → ${levelLabel(to as OrgRoleCriterionLevel)}`];
  });
  const { newCount, earlierCount } = args.review.silent;
  return [
    `Review of pass reasons for Role ${args.roleId}${args.roleTitle ? ` (${clean(args.roleTitle)})` : ""}. time_zone=Asia/Seoul. Workspace language: ${args.locale === "en" ? "English" : "Korean"}.`,
    "Purpose: read why the company passed on these candidates and decide whether one current criterion should be one level stricter. If so, add one suggestion with propose_criteria_change; otherwise end without a tool call.",
    "",
    "Current criteria (id | name | level | possible change | what it checks):",
    ...criteriaLines,
    "",
    `Passed since your last review, with a stated reason (${fresh.length}):`,
    ...(fresh.length ? fresh.map(passLine) : ["- (none)"]),
    ...(earlier.length
      ? ["", `Earlier passes with a stated reason on this Role, for context (${earlier.length}):`, ...earlier.map(passLine)]
      : []),
    ...(newCount || earlierCount
      ? ["", `Passed without any reason (not citable): ${newCount} since your last review, ${earlierCount} earlier.`]
      : []),
    ...(answered.length
      ? ["", "Changes the company already applied or dismissed (never suggested again):", ...answered]
      : []),
  ].join("\n");
}

/** The review's run text, framed as Harper's own background work. */
export function criteriaReviewPrompt(reviewText: string) {
  return `<company_agent_event kind="criteria_review">\nThis is Harper's own background review, not a company user's message. Nobody is waiting for a reply and ordinary final text is not delivered to anyone. Act for the company's purpose within this Role only.\n${reviewText}\n</company_agent_event>`;
}
