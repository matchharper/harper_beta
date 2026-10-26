import "server-only";

import { after } from "next/server";

import type { OrgRoleCriterionGrade } from "@/lib/org/roleCriteria";
import {
  normalizeProbes,
  normalizeRoleStartBrief,
  renderBriefMarkdown,
  type RoleStartBrief,
  type RoleStartLevel,
  type RoleStartProbe,
} from "./brief";
import { roleStartSql } from "./db";
import type { RoleStartPool } from "./fastPath";
import type { RoleStartLlmUsage } from "./llm";
import type { RoleStartReferenceRow } from "./referenceRows";

export type RoleStartPhase =
  | "drafting"
  | "questions"
  | "review"
  | "searching"
  | "evaluating"
  | "registering"
  | "batch"
  | "done"
  | "failed"
  /** The Role was registered another way (form or chat); late step results are dropped. */
  | "superseded";

export type RoleStartChipEffect =
  | {
      type: "set_requirement";
      criterion: string;
      requirement: "must" | "preferred";
    }
  | { type: "set_importance"; criterion: string; level: RoleStartLevel }
  | { type: "refine_criterion"; criterion: string; criteria: string }
  | {
      type: "add_criterion";
      name: string;
      criteria: string;
      requirement: "must" | "preferred";
      level?: RoleStartLevel;
    }
  | { type: "remove_criterion"; criterion: string }
  | { type: "add_hard_condition"; condition: Record<string, unknown> }
  /** A chip on a question the role chat asked: its label is applied like a written answer. */
  | { type: "note" }
  | { type: "none" };

export type RoleStartChip = { id: string; label: string; effect: RoleStartChipEffect };

export type RoleStartQuestion = {
  id: string;
  question: string;
  why: string;
  chips: RoleStartChip[];
  status: "pending" | "answered" | "skipped";
  overlap: number | null;
  answer?: {
    chipId: string | null;
    text: string | null;
    applied: string | null;
    /** A free-text answer that could not be applied; its question is asked again. */
    notApplied?: boolean;
    /** Next questions for this answer were prepared; no model refinement needed. */
    prepared?: boolean;
    surface?: "web" | "slack";
  };
  askedAt: string;
  answeredAt?: string;
  /** Set once the question was posted to the role creation Slack thread. */
  slack?: { channelId: string; ts: string };
};

export type RoleStartVerdict = {
  tldr: string;
  finalFit: "excellent" | "good" | "borderline" | "uncertain" | "unfit";
  criteria: Array<{
    criterionId: string;
    name: string;
    /** The criterion's subject in a few words ("PyTorch", "리서치"), for short chips. */
    topic?: string;
    fitness: OrgRoleCriterionGrade;
    evidence: string;
  }>;
  companyQuestion: { question: string; options: string[] } | null;
  /**
   * Reason chips written with the verdict and shown, without another model
   * call, when the team rates the person "확인 필요" or "맞지 않음". Stored as
   * codes (criterion id + kind) so later Pass flows can read the same shape.
   */
  reasonChips?: RoleStartReasonChip[];
};

export type RoleStartReasonKind =
  | "equivalent_experience"
  | "missing_info"
  | "scope_unclear"
  | "level_unclear"
  | "mismatch"
  | "unset_value"
  | "other";

export type RoleStartReasonChip = {
  id: string;
  /** Criterion id or hard condition id the reason is about. */
  criterionId: string;
  kind: RoleStartReasonKind;
  label: string;
  /** Profile fact the chip rests on; null when the point is missing information. */
  evidence: string | null;
  appliesTo: Array<"uncertain" | "bad" | "good" | "excellent">;
  source: "verdict" | "rule";
  /**
   * condition: about a hard condition, kept as the team's reason only.
   * outside: a reason the Brief does not cover, handled like a typed reason.
   */
  scope?: "condition" | "outside";
};

/**
 * Chips for 매우 잘 맞음 / 잘 맞음: one per criterion the verdict read 잘 맞음 or
 * better, named after it (no model call).
 */
export function likedReasonChips(verdict: RoleStartVerdict | null): RoleStartReasonChip[] {
  return (verdict?.criteria ?? [])
    .filter((item) => item.fitness === "excellent" || item.fitness === "good")
    .map((item) => ({
      id: `liked-${item.criterionId}`,
      criterionId: item.criterionId,
      kind: "other",
      label: item.name,
      evidence: item.evidence || null,
      appliesTo: ["excellent", "good"],
      source: "rule",
    }));
}

export type RoleStartCandidate = {
  talentId: string;
  /** The first-three run that picked this person; late verdicts of other runs are dropped. */
  runId?: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  years: number | null;
  /** "role": years in this Role's job; "total": total career years (job not readable). */
  yearsBasis?: "role" | "total";
  /** Whether the normalized location fields know where the person is. */
  locationKnown?: boolean;
  current: string | null;
  probe: RoleStartProbe | null;
  overall: number;
  scores: Array<{ criterionId: string; name: string; score: number; evidence: string | null }>;
  verdict: RoleStartVerdict | null;
  verdictError?: string | null;
};

export type RoleStartEvaluation = {
  rating: OrgRoleCriterionGrade;
  answer: string | null;
  note: string | null;
  /** Picked "확인 필요"/"맞지 않음" reasons, stored as codes for the first batch. */
  reasons?: Array<{ chipId?: string; criterionId: string; kind: RoleStartReasonKind; label: string; evidence?: string | null; scope?: "condition" | "outside" }>;
  reasonText?: string | null;
  reasonsSkipped?: boolean;
  at: string;
};

/** Which screen section a progress line belongs to. */
export type RoleStartProgressStep = "draft" | "first_three" | "batch";

export type RoleStartProgress = {
  at: string;
  key: string;
  text: string;
  step?: RoleStartProgressStep;
  status?: "running" | "done" | "error";
  /** Generic step kind; the screen words it. text is set only for a specific outcome. */
  kind?: string;
};

export type RoleStartQuestionCandidate = Omit<RoleStartQuestion, "status" | "askedAt" | "overlap">;

export type RoleStartQuestionState = {
  history: RoleStartQuestion[];
  candidates: RoleStartQuestionCandidate[];
  probes: RoleStartProbe[];
  stopped: boolean;
  /** Follow-up questions prepared per chip (and "skip") while a question is shown. */
  speculative?: { questionId: string; byChip: Record<string, RoleStartQuestionCandidate[]> } | null;
  /**
   * Brief changes made outside answers (chat criteria, the team's edits, role
   * info), counted in the same save as the change: words being applied to an
   * older Brief see it moved and are applied again.
   */
  briefEdits?: number;
  /** 참고 인물 rows given while the draft runs; read once the draft is saved. */
  pendingReferences?: RoleStartReferenceRow[];
  /** The fixed compensation question (asked first when the JD states none) was answered or skipped. */
  compensation?: "answered" | "skipped";
};

export type RoleStartBatch = {
  status: "running" | "done" | "failed";
  shown: number;
  passing: number;
  introIds: string[];
  candidates: RoleStartCandidate[];
  /** Names of first-three people the team rated 잘 맞음 or better, kept in the inbox at registration. */
  kept?: string[];
  error?: string | null;
};

export type RoleStartPreparedEntry = {
  briefHash: string;
  verdict: RoleStartVerdict;
  usd: number | null;
  ms: number;
  at: string;
};

export type RoleStartPreparedStats = {
  prepared?: number;
  preparedUsd?: number;
  used?: number;
  discarded?: number;
  discardedUsd?: number;
};

/**
 * The pick after the first-three ratings, computed when the team finishes
 * rating (before the last step) so registration only commits it. `key` is the
 * ratings it was computed from; a different key means the ratings changed.
 */
export type RoleStartPreparedBatch = {
  key: string;
  status: "running" | "done" | "failed";
  startedAt: string;
  result?: {
    brief: RoleStartBrief;
    notes: string[];
    proposals: Array<{ talentId: string; verdict: RoleStartVerdict }>;
    candidates: RoleStartCandidate[];
    passing: number;
    judged: number;
  };
};

/** People whose review-time verdicts are being written for one Brief, until when. */
export type RoleStartPreparedInflight = { briefHash: string; talentIds: string[]; until: string };

export type RoleStartPrepared = {
  entries: Record<string, RoleStartPreparedEntry>;
  stats: RoleStartPreparedStats;
  batch?: RoleStartPreparedBatch | null;
  inflight?: RoleStartPreparedInflight | null;
};

export type RoleStartSession = {
  roleId: string;
  workspaceId: string;
  phase: RoleStartPhase;
  brief: RoleStartBrief;
  questions: RoleStartQuestionState;
  pendingQuestion: RoleStartQuestion | null;
  pool: RoleStartPool | null;
  firstCandidates: RoleStartCandidate[];
  evaluations: Record<string, RoleStartEvaluation>;
  batch: RoleStartBatch | null;
  progress: RoleStartProgress[];
  timings: Record<string, number | string | null>;
  llmUsage: RoleStartLlmUsage[];
  prepared: RoleStartPrepared;
  revision: number;
  updatedAt: string;
  /** Answers whose background refinement is done (answers are refined in order). */
  refinedAnswers: number;
  /** Running background steps by name: who holds them and until when. */
  leases: Record<string, { token: string; until: string }>;
};

type Row = {
  role_id: string;
  company_workspace_id: string;
  phase: string;
  brief: unknown;
  questions: unknown;
  pending_question: unknown;
  pool: unknown;
  /** The pool from company_role_start_pools, when joined. */
  pool_row?: unknown;
  refined_answers?: number | null;
  leases?: unknown;
  first_candidates: unknown;
  evaluations: unknown;
  batch: unknown;
  progress: unknown;
  timings: unknown;
  llm_usage: unknown;
  prepared: unknown;
  revision: number;
  updated_at: string | Date;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function fromRow(row: Row): RoleStartSession {
  const questions = record(row.questions);
  return {
    roleId: row.role_id,
    workspaceId: row.company_workspace_id,
    phase: row.phase as RoleStartPhase,
    brief: normalizeRoleStartBrief(row.brief),
    questions: {
      history: Array.isArray(questions.history) ? (questions.history as RoleStartQuestion[]) : [],
      candidates: Array.isArray(questions.candidates)
        ? (questions.candidates as RoleStartQuestionState["candidates"])
        : [],
      probes: normalizeProbes(questions.probes),
      stopped: questions.stopped === true,
      speculative: (questions.speculative as RoleStartQuestionState["speculative"]) ?? null,
      briefEdits: typeof questions.briefEdits === "number" ? questions.briefEdits : 0,
      pendingReferences: Array.isArray(questions.pendingReferences) ? (questions.pendingReferences as RoleStartReferenceRow[]) : [],
      ...(questions.compensation === "answered" || questions.compensation === "skipped" ? { compensation: questions.compensation } : {}),
    },
    pendingQuestion: (row.pending_question as RoleStartQuestion | null) ?? null,
    pool: ((row.pool_row ?? row.pool) as RoleStartPool | null) ?? null,
    firstCandidates: Array.isArray(row.first_candidates)
      ? (row.first_candidates as RoleStartCandidate[])
      : [],
    evaluations: record(row.evaluations) as Record<string, RoleStartEvaluation>,
    batch: (row.batch as RoleStartBatch | null) ?? null,
    progress: Array.isArray(row.progress) ? (row.progress as RoleStartProgress[]) : [],
    timings: record(row.timings) as RoleStartSession["timings"],
    llmUsage: Array.isArray(row.llm_usage) ? (row.llm_usage as RoleStartLlmUsage[]) : [],
    prepared: {
      entries: record(record(row.prepared).entries) as RoleStartPrepared["entries"],
      stats: record(record(row.prepared).stats) as RoleStartPreparedStats,
      batch: (record(row.prepared).batch as RoleStartPreparedBatch | undefined) ?? null,
      inflight: (record(row.prepared).inflight as RoleStartPreparedInflight | undefined) ?? null,
    },
    revision: Number(row.revision) || 0,
    updatedAt: new Date(row.updated_at).toISOString(),
    refinedAnswers: Number(row.refined_answers) || 0,
    leases: record(row.leases) as RoleStartSession["leases"],
  };
}

/**
 * The session with its candidate pool, or (forView) only what the screen
 * shows: no pool, usage log or prepared verdicts, for frequent polling.
 */
export async function loadRoleStartSession(roleId: string, options: { forView?: boolean } = {}) {
  const sql = roleStartSql();
  const rows = options.forView
    ? await sql<Row[]>`
        select role_id, company_workspace_id, phase, brief, questions, pending_question, null::jsonb as pool,
          first_candidates, evaluations, batch, progress, timings, '[]'::jsonb as llm_usage,
          '{}'::jsonb as prepared, revision, created_at, updated_at, refined_answers, leases
        from public.company_role_start_sessions where role_id = ${roleId}
      `
    : await sql<Row[]>`
        select s.*, p.pool as pool_row
        from public.company_role_start_sessions s
        left join public.company_role_start_pools p on p.role_id = s.role_id
        where s.role_id = ${roleId}
      `;
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function createRoleStartSession(args: {
  roleId: string;
  workspaceId: string;
}) {
  const sql = roleStartSql();
  const rows = await sql<Row[]>`
    insert into public.company_role_start_sessions (role_id, company_workspace_id, phase)
    values (${args.roleId}, ${args.workspaceId}, 'drafting')
    on conflict (role_id) do nothing
    returning *
  `;
  return rows[0] ? fromRow(rows[0]) : null;
}

type SessionPatch = Partial<
  Pick<
    RoleStartSession,
    | "phase"
    | "brief"
    | "questions"
    | "pendingQuestion"
    | "pool"
    | "firstCandidates"
    | "evaluations"
    | "batch"
  >
>;

/**
 * Optimistic write: callers pass the revision they read. A concurrent click or
 * background step that already moved the session makes this return null.
 */
export async function saveRoleStartSession(args: {
  roleId: string;
  expectedRevision?: number;
  /** Write only while the session is still in one of these phases (background steps). */
  expectedPhase?: RoleStartPhase | RoleStartPhase[];
  patch: SessionPatch;
  timings?: Record<string, number | string | null>;
}) {
  const sql = roleStartSql();
  const patch = args.patch;
  const json = (value: unknown) => sql.json(wellFormedJson(value));
  const rows = await sql<Row[]>`
    update public.company_role_start_sessions set
      phase = ${patch.phase ?? sql`phase`},
      brief = ${patch.brief ? json(patch.brief) : sql`brief`},
      questions = ${patch.questions ? json(patch.questions) : sql`questions`},
      pending_question = ${"pendingQuestion" in patch ? json(patch.pendingQuestion) : sql`pending_question`},
      pool = null,
      first_candidates = ${patch.firstCandidates ? json(patch.firstCandidates) : sql`first_candidates`},
      evaluations = ${patch.evaluations ? json(patch.evaluations) : sql`evaluations`},
      batch = ${"batch" in patch ? json(patch.batch) : sql`batch`},
      timings = timings || ${json(args.timings ?? {})},
      revision = revision + 1,
      updated_at = now()
    where role_id = ${args.roleId}
      ${args.expectedRevision === undefined ? sql`` : sql`and revision = ${args.expectedRevision}`}
      ${
        args.expectedPhase === undefined
          ? sql``
          : sql`and phase = any(${[args.expectedPhase].flat()}::text[])`
      }
    returning *, ${
      "pool" in patch
        ? sql`null::jsonb`
        : sql`(select p.pool from public.company_role_start_pools p where p.role_id = ${args.roleId})`
    } as pool_row
  `;
  if (!rows[0]) return null;
  // The pool lives in its own row; written only when the session write succeeded.
  if ("pool" in patch) {
    if (patch.pool) {
      await sql`
        insert into public.company_role_start_pools (role_id, pool, updated_at)
        values (${args.roleId}, ${json(patch.pool)}, now())
        on conflict (role_id) do update set pool = excluded.pool, updated_at = now()
      `;
    } else {
      await sql`delete from public.company_role_start_pools where role_id = ${args.roleId}`;
    }
    return { ...fromRow(rows[0]), pool: patch.pool ?? null };
  }
  return fromRow(rows[0]);
}

/** Progress key of a chat edit of a registered Role's Brief (the 매칭 기준 tab locks while it runs). */
export const CHAT_BRIEF_EDIT = "chat_brief_edit";

/**
 * Upserts one progress line by key: a step appears as running and the same
 * line turns done (or error) when it finishes, keeping its position.
 */
export async function upsertRoleStartProgress(roleId: string, entry: Omit<RoleStartProgress, "at">) {
  const sql = roleStartSql();
  const value = { ...entry, at: new Date().toISOString() };
  await sql`
    update public.company_role_start_sessions s
    set progress = case
        when exists (select 1 from jsonb_array_elements(s.progress) e where e->>'key' = ${entry.key})
        then (
          select jsonb_agg(case when e->>'key' = ${entry.key} then ${sql.json(value)}::jsonb else e end order by n)
          from jsonb_array_elements(s.progress) with ordinality as x(e, n)
        )
        else s.progress || jsonb_build_array(${sql.json(value)}::jsonb)
      end,
      updated_at = now()
    where s.role_id = ${roleId}
  `;
}

export async function appendRoleStartUsage(roleId: string, usage: RoleStartLlmUsage[]) {
  if (!usage.length) return;
  const sql = roleStartSql();
  await sql`
    update public.company_role_start_sessions
    set llm_usage = llm_usage || ${sql.json(wellFormedJson(usage))}
    where role_id = ${roleId}
  `;
}

export async function updateRoleStartCandidates(
  roleId: string,
  field: "first_candidates",
  candidates: RoleStartCandidate[]
) {
  const sql = roleStartSql();
  await sql`
    update public.company_role_start_sessions
    set ${sql(field)} = ${sql.json(wellFormedJson(candidates))}, updated_at = now()
    where role_id = ${roleId}
  `;
}

/** Saves an immutable Brief version and mirrors it to the Role's current fields. */
/** Runs after every Brief version is saved (service.ts registers the grade-signal refresh). */
let afterBriefSaved: ((roleId: string, brief: RoleStartBrief) => void) | null = null;
export function onBriefSaved(listener: (roleId: string, brief: RoleStartBrief) => void) {
  afterBriefSaved = listener;
}

export async function saveRoleStartBrief(args: {
  roleId: string;
  brief: RoleStartBrief;
  changeSource: string;
  changeSummary: string | null;
  userId: string | null;
  /**
   * true: the 평가 기준 목록 and the saved Brief text, always together from this Brief.
   * "criteria": the list only, for a Role whose Brief text was written by the
   * chat (no role start Brief to render it from).
   */
  writeRole: boolean | "criteria";
  historySource?: string;
  requestReview?: boolean;
}) {
  const sql = roleStartSql();
  // Serialize writes from the current session and capture one existing history
  // item per transaction. Internal draft refinements never create fake history.
  const { version, historyIds } = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${`role_brief_version:${args.roleId}`}))`;
    // Published saves use the session, so the Role is written from the
    // session's Brief as it is now: a slower save of an older Brief cannot land last.
    const [current] = await tx<Array<{ brief: unknown }>>`
      select brief from public.company_role_start_sessions where role_id = ${args.roleId}
    `;
    const roleBrief = current?.brief ? normalizeRoleStartBrief(current.brief) : args.brief;
    // Grade signals stay in the working session, never on the Role's list.
    const criteria = roleBrief.criteria.map(
      ({ rule: _rule, kind: _kind, evidenceTerms: _terms, signals: _signals, signalsOf: _of, reference: _reference, ...criterion }) => criterion
    );
    const markdown = renderBriefMarkdown(roleBrief);
    // The structured working draft stays in the session. Saved company-facing
    // text and criteria use the existing history trigger and search hash.
    if (args.changeSource === "jd_draft" || args.changeSource === "confirmed") {
      await tx`update public.company_role_start_sessions set brief_source = 'onboarding'
        where role_id = ${args.roleId} and phase <> 'superseded'`;
    }
    if (args.writeRole) {
      // Feed the existing history trigger in this same transaction. Background
      // saves without an author remain explicitly unattributed.
      const [actor] = args.userId
        ? await tx<Array<{ name: string | null }>>`select name from public.company_users where user_id = ${args.userId}`
        : [];
      await tx`select set_config('harper.hiring_brief_change_context', ${JSON.stringify({
        actorUserId: args.userId,
        actorLabel: actor?.name ?? null,
        source: args.historySource ?? args.changeSource,
        requestReview: args.requestReview === true && args.historySource === "website" && Boolean(args.userId),
      })}, true)`;
    }
    if (args.writeRole === "criteria") {
      await tx`
        update public.company_internal_roles
        set criteria = ${tx.json(wellFormedJson(criteria))}, updated_at = now()
        where role_id = ${args.roleId}
      `;
    } else if (args.writeRole) {
      await tx`
        update public.company_internal_roles
        set criteria = ${tx.json(wellFormedJson(criteria))}, request = ${markdown}, updated_at = now()
        where role_id = ${args.roleId}
      `;
      await tx`
        update public.company_roles set request = ${markdown}, updated_at = now()
        where role_id = ${args.roleId}
      `;
    }
    const history = args.writeRole
      ? await tx<Array<{ id: string }>>`select id from public.company_role_hiring_brief_history
          where role_id = ${args.roleId} and transaction_id = txid_current()`
      : [];
    const [currentVersion] = await tx<Array<{ version: string }>>`
      select public.company_role_search_brief_version_v1(${args.roleId}::uuid) as version
    `;
    return { version: currentVersion.version, historyIds: history.map(row => row.id) };
  });
  if (historyIds.length) {
    const dispatch = async () => {
      try {
        const { dispatchHiringBriefHistory } = await import("@/lib/org/hiringBriefHistory.server");
        await dispatchHiringBriefHistory({ historyIds });
      } catch (error) {
        // Pending history remains the durable recovery source.
        console.error("[role-start] hiring brief history dispatch", error);
      }
    };
    try { after(dispatch); } catch { await dispatch(); }
  }
  afterBriefSaved?.(args.roleId, args.brief);
  return version;
}

/** The session records whether its structured draft was authored by onboarding. */
export async function hasRoleStartBrief(roleId: string) {
  const rows = await roleStartSql()<Array<{ found: boolean }>>`
    select exists (
      select 1 from public.company_role_start_sessions
      where role_id = ${roleId} and brief_source = 'onboarding' and phase <> 'superseded'
    ) as found
  `;
  return Boolean(rows[0]?.found);
}

export async function isRegisteredRoleStartRole(roleId: string, workspaceId: string) {
  const rows = await roleStartSql()<Array<{ found: boolean }>>`
    select exists (
      select 1 from public.company_roles r
      join public.company_role_start_sessions s using (role_id)
      where r.role_id = ${roleId} and r.company_workspace_id::text = ${workspaceId}
        and r.status <> 'draft' and s.brief_source = 'onboarding' and s.phase <> 'superseded'
    ) as found
  `;
  return Boolean(rows[0]?.found);
}

export function roleStartCostUsd(session: Pick<RoleStartSession, "llmUsage">) {
  return session.llmUsage.reduce((sum, usage) => sum + (usage.usd ?? 0), 0);
}

/**
 * A JSON copy Postgres accepts: profile text cut in the middle of a
 * two-part character (e.g. styled letters like "𝗵") leaves half of it, which
 * jsonb rejects; that half becomes U+FFFD.
 */
export function wellFormedJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null), (_key, item) =>
    typeof item === "string" ? item.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD") : item
  );
}

/** Stores one verdict written ahead of confirmation; concurrent writers touch only their key. */
export async function savePreparedEntry(roleId: string, talentId: string, entry: RoleStartPreparedEntry) {
  const sql = roleStartSql();
  await sql`
    update public.company_role_start_sessions
    set prepared = jsonb_set(prepared, ${["entries", talentId]}::text[], ${sql.json(wellFormedJson(entry))})
    where role_id = ${roleId}
  `;
}

export async function savePreparedInflight(roleId: string, inflight: RoleStartPreparedInflight) {
  const sql = roleStartSql();
  await sql`
    update public.company_role_start_sessions
    set prepared = jsonb_set(prepared, '{inflight}', ${sql.json(wellFormedJson(inflight))})
    where role_id = ${roleId}
  `;
}

/** Write the prepared pick; `onlyKey` keeps a newer computation from being overwritten by an older one. */
export async function savePreparedBatch(roleId: string, batch: RoleStartPreparedBatch, onlyKey?: string) {
  const sql = roleStartSql();
  const rows = await sql<Array<{ role_id: string }>>`
    update public.company_role_start_sessions
    set prepared = jsonb_set(prepared, '{batch}', ${sql.json(wellFormedJson(batch))})
    where role_id = ${roleId}
      ${onlyKey === undefined ? sql`` : sql`and prepared->'batch'->>'key' = ${onlyKey}`}
    returning role_id
  `;
  return rows.length > 0;
}

export async function addPreparedStats(roleId: string, delta: Required<RoleStartPreparedStats> | RoleStartPreparedStats) {
  const sql = roleStartSql();
  const keys = Object.entries(delta).filter(([, value]) => typeof value === "number" && value !== 0);
  if (!keys.length) return;
  // Numeric increments per key, atomically in one statement.
  await sql`
    update public.company_role_start_sessions s
    set prepared = jsonb_set(s.prepared, '{stats}', coalesce(s.prepared->'stats', '{}'::jsonb) || (
      select jsonb_object_agg(d.key, coalesce((s.prepared->'stats'->>d.key)::numeric, 0) + d.value::numeric)
      from jsonb_each_text(${sql.json(Object.fromEntries(keys))}) d
    ))
    where s.role_id = ${roleId}
  `;
}

export async function mergeRoleStartTimings(roleId: string, timings: Record<string, number | string | null>) {
  const sql = roleStartSql();
  await sql`
    update public.company_role_start_sessions
    set timings = timings || ${sql.json(timings)}, updated_at = now()
    where role_id = ${roleId}
  `;
}

/** The stored Brief's fingerprint, to tell whether it changed since a read. */
export async function storedBriefHash(roleId: string) {
  const sql = roleStartSql();
  const rows = await sql<Array<{ hash: string }>>`
    select md5(brief::text) as hash from public.company_role_start_sessions where role_id = ${roleId}
  `;
  return rows[0]?.hash ?? "";
}

/**
 * Stores prepared follow-ups only while the same question is still open and
 * the Brief is the one they were prepared from (words applied meanwhile make them stale).
 */
export async function saveSpeculativeFollowUps(
  roleId: string,
  questionId: string,
  byChip: Record<string, RoleStartQuestionCandidate[]>,
  briefHash: string
) {
  const sql = roleStartSql();
  await sql`
    update public.company_role_start_sessions
    set questions = jsonb_set(questions, '{speculative}', ${sql.json(wellFormedJson({ questionId, byChip }))})
    where role_id = ${roleId} and pending_question->>'id' = ${questionId} and md5(brief::text) = ${briefHash}
  `;
}

export { isRoleStartEnded, isRoleStartStalled, ROLE_START_STALL_MS, roleStartOwnsRole } from "./ownership";

/**
 * The Role was registered another way: end its start flow so results still
 * running are dropped. Returns the question left open, whose cards close.
 */
export async function supersedeRoleStartSession(roleId: string) {
  const sql = roleStartSql();
  const rows = await sql<Array<{ pending: RoleStartQuestion | null }>>`
    with open as (
      select role_id, pending_question from public.company_role_start_sessions
      where role_id = ${roleId} and phase not in ('done', 'superseded')
      for update
    )
    update public.company_role_start_sessions s
    set phase = 'superseded', pending_question = null, revision = s.revision + 1, updated_at = now()
    from open where s.role_id = open.role_id
    returning open.pending_question as pending
  `;
  return rows[0]?.pending ?? null;
}

/**
 * Claim a background step for a while. Only one holder at a time; an expired
 * claim (its process died) can be taken over. Returns a token, or null if held.
 */
export async function claimRoleStartLease(roleId: string, name: string, ttlMs: number) {
  const sql = roleStartSql();
  const token = crypto.randomUUID();
  const until = new Date(Date.now() + ttlMs).toISOString();
  const rows = await sql<Array<{ role_id: string }>>`
    update public.company_role_start_sessions
    set leases = leases || jsonb_build_object(${name}::text, jsonb_build_object('token', ${token}::text, 'until', ${until}::text))
    where role_id = ${roleId}
      and (leases->${name} is null or (leases->${name}->>'until')::timestamptz < now())
    returning role_id
  `;
  return rows.length ? token : null;
}

export async function roleStartLeaseHeld(roleId: string, name: string) {
  const sql = roleStartSql();
  const rows = await sql<Array<{ held: boolean }>>`
    select (leases->${name} is not null and (leases->${name}->>'until')::timestamptz >= now()) held
    from public.company_role_start_sessions where role_id = ${roleId}
  `;
  return rows[0]?.held === true;
}

export async function releaseRoleStartLease(roleId: string, name: string, token: string) {
  const sql = roleStartSql();
  await sql`
    update public.company_role_start_sessions set leases = leases - ${name}::text
    where role_id = ${roleId} and leases->${name}->>'token' = ${token}
  `;
}

/** Record that answers up to this one are refined (never moves back). */
export async function markRoleStartRefined(roleId: string, answers: number) {
  const sql = roleStartSql();
  await sql`
    update public.company_role_start_sessions
    set refined_answers = greatest(refined_answers, ${answers}), updated_at = now()
    where role_id = ${roleId}
  `;
}
