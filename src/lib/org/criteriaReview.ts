import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import {
  CRITERIA_PROPOSAL_RATIONALE_MAX,
  CRITERIA_PROPOSAL_RULES,
  criterionNameKey,
  MEMORY_NOTE_MAX,
  memoryNoteKey,
  NEW_CRITERION_DESCRIPTION_MAX,
  NEW_CRITERION_LEVELS,
  NEW_CRITERION_NAME_MAX,
  nextCriterionLevel,
  type CriteriaProposalChange,
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
import { containsContactDetails } from "@/lib/org/todoSuggestionTool";

/**
 * Harper's review of pass reasons (S2 G): what Harper reads and how the
 * evidence it cites is checked. Harper decides whether a suggestion is
 * warranted; this file only gathers the facts and keeps the suggestion
 * honest (real passes, real reasons, one existing criterion one level up,
 * one new criterion below required, or one company memory note).
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
  /** How the criteria changed after this decision; empty when they did not. */
  criteriaChangedSince: string[];
};

/** Something the company said in the Role's conversation since the last review. */
export type ReviewedMessage = { id: number; at: string | null; channel: string; text: string };

export type CriteriaReview = {
  /** Candidates passed with a stated reason, newest first. */
  passes: ReviewedPass[];
  /** Candidates passed without any reason, by whether they are new. */
  silent: { newCount: number; earlierCount: number };
  /** What the company said since the last review, newest first. */
  companyMessages: ReviewedMessage[];
};

/** What the review saved on its job: what Harper may cite, and what it filed. */
export type CriteriaReviewSnapshot = {
  /** written: the company wrote a reason or note (not only reason tags). */
  passes: Array<{ id: number; talentId: string | null; isNew: boolean; written: boolean }>;
  /** The company's messages in this review. */
  messageIds: number[];
  /** Candidates with a stated reason in the review (the evidence window). */
  withReason: number;
  locale: CompanyTermLocale;
  proposalId?: string | null;
  /** The added suggestion repeats one already waiting: the company was told about it then. */
  repeated?: boolean;
};

const REASONS_PER_CANDIDATE = 3;
const REASON_MAX = 300;
const NOTE_MAX = 200;
const MESSAGE_MAX = 500;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function shorten(value: string, max: number) {
  const chars = Array.from(value);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : value;
}

/** What differs between the criteria of a past Brief version and the current ones. */
export function criteriaChanges(then: unknown, now: unknown): string[] {
  const before = new Map(normalizeOrgRoleCriteria(then).map((item) => [criterionNameKey(item.name), item]));
  const after = new Map(normalizeOrgRoleCriteria(now).map((item) => [criterionNameKey(item.name), item]));
  const changes: string[] = [];
  for (const [key, item] of after) {
    const old = before.get(key);
    if (!old) changes.push(`${item.name} added`);
    else if (criterionLevel(old) !== criterionLevel(item))
      changes.push(`${item.name}: ${criterionLevel(old)} → ${criterionLevel(item)}`);
  }
  for (const [key, item] of before) if (!after.has(key)) changes.push(`${item.name} removed`);
  return changes;
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
  /** The current criteria, compared with those of each decision's Brief version. */
  criteria?: unknown;
  briefCriteriaAt?: Record<string, unknown>;
  messages?: Array<{ id: number; channel?: string | null; text: string; createdAt?: string | null }>;
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
        criteriaChangedSince:
          decision.briefRevision && args.briefCriteriaAt?.[String(decision.briefRevision)] !== undefined
            ? criteriaChanges(args.briefCriteriaAt[String(decision.briefRevision)], args.criteria)
            : [],
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
    companyMessages: (args.messages ?? []).map((message) => ({
      id: message.id,
      at: message.createdAt ?? null,
      channel: message.channel === "slack" ? "Slack" : "web",
      text: shorten(clean(message.text), MESSAGE_MAX),
    })),
  };
}

/** What Harper may cite, saved on the review's job before it runs. */
export function criteriaReviewSnapshot(
  review: CriteriaReview,
  locale: CompanyTermLocale
): CriteriaReviewSnapshot {
  return {
    passes: review.passes.map((pass) => ({
      id: pass.decisionId,
      talentId: pass.talentId,
      isNew: pass.isNew,
      written: pass.reasons.length > 0,
    })),
    messageIds: review.companyMessages.map((message) => message.id),
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
        written: pass.written === true,
      })),
    messageIds: Array.isArray(raw.messageIds) ? raw.messageIds.map(Number).filter(Number.isSafeInteger) : [],
    withReason: raw.withReason,
    locale: raw.locale === "en" ? "en" : "ko",
    proposalId: typeof raw.proposalId === "string" && raw.proposalId ? raw.proposalId : null,
    ...(raw.repeated === true ? { repeated: true } : {}),
  };
}

function levelLabel(level: OrgRoleCriterionLevel) {
  const found = ORG_ROLE_CRITERION_LEVELS.find((item) => item.level === level)!;
  return `${found.en.toLowerCase()} (${found.ko})`;
}

function inputObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Compared without spacing or case, so a name written another way is still found. */
function compact(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/**
 * A memory note as Harper wrote it, checked: one short note the To-do card
 * shows whole, never a candidate's name, ID or contact details.
 */
function memoryNoteChange(
  input: Record<string, unknown>,
  context: { candidateNames?: string[]; roleTeamId?: string | null }
): CriteriaProposalChange {
  const note = clean(input.text);
  const length = Array.from(note).length;
  if (!memoryNoteKey(note))
    throw new CriteriaReviewInputError("memoryNote needs text: the note to save, in the workspace language. No suggestion was added.");
  if (length > MEMORY_NOTE_MAX)
    throw new CriteriaReviewInputError(
      `memoryNote.text is ${length} characters; keep it within ${MEMORY_NOTE_MAX} so the To-do card shows the whole note. No suggestion was added.`
    );
  if (containsContactDetails(note) || UUID.test(note))
    throw new CriteriaReviewInputError(
      "memoryNote.text must not contain an email address, phone number or ID. Write the company's preference itself. No suggestion was added."
    );
  const text = compact(note);
  if ((context.candidateNames ?? []).some((name) => Array.from(compact(name)).length >= 2 && text.includes(compact(name))))
    throw new CriteriaReviewInputError(
      "memoryNote.text names a candidate from this review. Write the company's preference itself, without candidate names. No suggestion was added."
    );
  const scope = clean(input.scope);
  if (scope !== "company" && scope !== "team")
    throw new CriteriaReviewInputError(
      "memoryNote.scope is company (every Role) or team (this Role's team). No suggestion was added."
    );
  if (scope === "company") return { type: "memory_note", note, scope };
  const teamId = clean(context.roleTeamId);
  if (!teamId)
    throw new CriteriaReviewInputError("This Role has no team; use scope company, or make no suggestion. No suggestion was added.");
  return { type: "memory_note", note, scope, teamId };
}

/**
 * The suggestion Harper asked for, checked against the Role and the review:
 * one existing criterion one level up, one new criterion (a name the Role
 * does not have, below required), or one company memory note; cited passes
 * that are in the review with a stated reason (a written one for a note), at
 * least one of them new, at least two candidates.
 * Throws the reason in words the model can act on.
 */
export function criteriaProposalFromReview(args: {
  criteria: unknown;
  snapshot: CriteriaReviewSnapshot;
  criterionId: unknown;
  newCriterion?: unknown;
  memoryNote?: unknown;
  /** For a memory note: the reviewed candidates' names, which a note must not contain. */
  candidateNames?: string[];
  /** For a team memory note: the Role's team. */
  roleTeamId?: string | null;
  decisionIds: unknown;
  /** The company's messages in this review that support the change. */
  messageIds?: unknown;
  rationale: unknown;
}): CriteriaProposalPayload {
  const criteria = normalizeOrgRoleCriteria(args.criteria);
  const key = clean(args.criterionId);
  const added = inputObject(args.newCriterion);
  const memory = inputObject(args.memoryNote);
  if ([key, added, memory].filter(Boolean).length !== 1)
    throw new CriteriaReviewInputError(
      "Give exactly one of criterionId (raise an existing criterion), newCriterion (add one) or memoryNote (save a company memory note). No suggestion was added."
    );
  let change: CriteriaProposalChange;
  if (memory) {
    change = memoryNoteChange(memory, args);
  } else if (added) {
    const name = shorten(clean(added.name), NEW_CRITERION_NAME_MAX);
    const description = shorten(clean(added.description), NEW_CRITERION_DESCRIPTION_MAX);
    const level = clean(added.level) as OrgRoleCriterionLevel;
    if (!name || !description)
      throw new CriteriaReviewInputError(
        "newCriterion needs a name and a description of what it checks. No suggestion was added."
      );
    if (!NEW_CRITERION_LEVELS.includes(level))
      throw new CriteriaReviewInputError(
        `A new criterion starts at ${NEW_CRITERION_LEVELS.map(levelLabel).join(" or ")}. No suggestion was added.`
      );
    const existing = criteria.find((item) => criterionNameKey(item.name) === criterionNameKey(name));
    if (existing)
      throw new CriteriaReviewInputError(
        `${existing.name} is already one of this Role's criteria (id ${criterionReasonTag(existing)}); suggest raising it instead. No suggestion was added.`
      );
    change = { type: "criterion_add", criterionName: name, description, to: level };
  } else {
    const criterion = criteria.find((item) => criterionReasonTag(item) === key);
    if (!criterion) {
      const ids = criteria.map(criterionReasonTag).filter(Boolean);
      throw new CriteriaReviewInputError(
        `criterionId ${key} is not one of this Role's criteria${ids.length ? `: ${ids.join(", ")}` : ""}. No suggestion was added.`
      );
    }
    const from = criterionLevel(criterion);
    const to = nextCriterionLevel(from);
    if (!to)
      throw new CriteriaReviewInputError(
        `${criterion.name} is already ${levelLabel(from)}, the strictest level Harper suggests. No suggestion was added.`
      );
    change = { type: "criterion_level", criterionKey: key, criterionName: criterion.name, from, to };
  }
  const cited = Array.isArray(args.decisionIds) ? [...new Set(args.decisionIds.map(Number))] : [];
  const citedMessages = Array.isArray(args.messageIds) ? [...new Set(args.messageIds.map(Number))] : [];
  const unknownMessages = citedMessages.filter((id) => !args.snapshot.messageIds.includes(id));
  if (unknownMessages.length)
    throw new CriteriaReviewInputError(
      `Message ${unknownMessages.join(", ")} is not one of the company's messages in this review. No suggestion was added.`
    );
  const reviewed = new Map(args.snapshot.passes.map((pass) => [pass.id, pass]));
  const unknown = cited.filter((id) => !reviewed.has(id));
  if ((!cited.length && !citedMessages.length) || unknown.length)
    throw new CriteriaReviewInputError(
      `${unknown.length ? `Decision ${unknown.join(", ")} is not` : "No decision was"} a pass with a stated reason in this review; cite the listed decisions whose reasons support the change, or the company's messages. No suggestion was added.`
    );
  const candidates = new Set(cited.map((id) => reviewed.get(id)!.talentId ?? `decision:${id}`));
  // What the company said is enough by itself; passes need a pattern.
  if (!citedMessages.length && candidates.size < 2)
    throw new CriteriaReviewInputError(
      "A suggestion needs the reasons of at least two different candidates. No suggestion was added."
    );
  if (!citedMessages.length && !cited.some((id) => reviewed.get(id)!.isNew))
    throw new CriteriaReviewInputError(
      "Cite at least one pass since the last review; earlier passes alone were already reviewed. No suggestion was added."
    );
  const tagsOnly = change.type === "memory_note" ? cited.filter((id) => !reviewed.get(id)!.written) : [];
  if (tagsOnly.length)
    throw new CriteriaReviewInputError(
      `Decision ${tagsOnly.join(", ")} has reason tags but no written reason; a memory note rests on the company's own words. No suggestion was added.`
    );
  const rationale = clean(args.rationale);
  if (!rationale)
    throw new CriteriaReviewInputError("reason is required: one short sentence for the To-do card. No suggestion was added.");
  return {
    version: 1,
    change,
    evidence: {
      count: candidates.size || citedMessages.length,
      window: Math.max(args.snapshot.withReason, candidates.size || citedMessages.length),
      decisionIds: cited.sort((a, b) => b - a),
      ...(citedMessages.length ? { messageIds: citedMessages.sort((a, b) => b - a) } : {}),
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

/** A suggestion's change in one line, for Harper. */
export function describeCriteriaChange(change: CriteriaProposalChange) {
  if (change.type === "memory_note") return `${change.scope} memory note "${change.note}"`;
  if (change.type === "criterion_add") return `new criterion ${change.criterionName} (${change.to})`;
  return `${change.criterionName}: ${change.from} → ${change.to}`;
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
  /** Suggestions waiting for the company's answer. */
  openProposals?: Array<{ id: string; summary: string; change: CriteriaProposalChange | null }>;
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
      pass.criteriaChangedSince.length ? `  criteria changed after this decision: ${pass.criteriaChangedSince.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  const fresh = args.review.passes.filter((pass) => pass.isNew);
  const earlier = args.review.passes.filter((pass) => !pass.isNew);
  const answered = (args.answeredKeys ?? []).flatMap((key) => {
    if (key.startsWith("criterion_add:")) return [`- new criterion ${key.slice("criterion_add:".length)}`];
    if (key.startsWith("memory_note:")) return [`- memory note ${quote(key.slice("memory_note:".length))}`];
    const match = /^criterion_level:(.+):(nice|important|required)>(nice|important|required)$/.exec(key);
    if (!match) return [];
    const [, criterionKey, from, to] = match;
    return [`- ${names.get(criterionKey) ?? criterionKey}: ${levelLabel(from as OrgRoleCriterionLevel)} → ${levelLabel(to as OrgRoleCriterionLevel)}`];
  });
  const open = (args.openProposals ?? []).map(
    (proposal) => `- proposal ${proposal.id} | ${proposal.change ? describeCriteriaChange(proposal.change) : proposal.summary}`
  );
  const { newCount, earlierCount } = args.review.silent;
  return [
    `Review of pass reasons for Role ${args.roleId}${args.roleTitle ? ` (${clean(args.roleTitle)})` : ""}. time_zone=Asia/Seoul. Workspace language: ${args.locale === "en" ? "English" : "Korean"}.`,
    "Purpose: read why the company passed on these candidates and what it said in this Role's conversation, and decide whether one current criterion should be one level stricter, or, when the reasons point at something no current criterion checks, whether the Role needs a new criterion, or, when they point at a lasting company preference or fact rather than something to check for this Role, whether to save one company memory note. If so, add one suggestion with propose_criteria_change; otherwise end without a tool call.",
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
    ...(args.review.companyMessages.length
      ? [
          "",
          `What the company said in this Role's conversation since your last review (${args.review.companyMessages.length}, citable by messageIds):`,
          ...args.review.companyMessages.map(
            (message) => `- message ${message.id} | ${formatLlmDateTime(message.at)} | ${message.channel}\n  said: ${quote(message.text)}`
          ),
        ]
      : []),
    ...(answered.length
      ? ["", "Changes the company already applied or dismissed (never suggested again):", ...answered]
      : []),
    ...(open.length
      ? ["", `Your suggestions still waiting for the company's answer (${open.length} of ${CRITERIA_PROPOSAL_RULES.maxOpen} open):`, ...open]
      : []),
  ].join("\n");
}

/** The review's run text, framed as Harper's own background work. */
export function criteriaReviewPrompt(reviewText: string) {
  return `<company_agent_event kind="criteria_review">\nThis is Harper's own background review, not a company user's message. Nobody is waiting for a reply and ordinary final text is not delivered to anyone. Act for the company's purpose within this Role only.\n${reviewText}\n</company_agent_event>`;
}
