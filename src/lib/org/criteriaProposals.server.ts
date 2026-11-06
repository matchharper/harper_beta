import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  applyCriteriaProposal,
  CRITERIA_PROPOSAL_RULES,
  CRITERIA_PROPOSALS_ENABLED,
  criteriaProposalChangeReason,
  criteriaProposalContentKey,
  criteriaProposalStillApplies,
  criteriaProposalText,
  parseCriteriaProposalPayload,
  type CriteriaProposalPayload,
  type PassDecision,
} from "@/lib/org/criteriaProposals";
import {
  buildCriteriaReview,
  type CandidateNote,
  type CriteriaReview,
  type PassDecisionDetail,
} from "@/lib/org/criteriaReview";
import { OrgHttpError } from "@/lib/org/httpError";
import type { OrgRoleCriterion } from "@/lib/org/roleCriteria";
import type { CompanyTermLocale } from "@/lib/org/terms";
import type { OrgTodoItem } from "@/lib/org/todo";
import { untypedTable } from "@/lib/org/untypedTable";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";

/**
 * Pass reasons sharpen the criteria (S2 G), on the server: the dispatcher
 * queues a consolidate_decisions job for each due Role, the job gathers the
 * Role's recent pass reasons and Harper reviews them (criteriaReview.server.ts)
 * and may add one suggestion, the To-do lists it, and a company user's answer
 * either saves the change through the Brief's write path or dismisses it.
 */

type Admin = ReturnType<typeof getSupabaseAdmin>;
type Json = Record<string, any>;

const DAY_MS = 24 * 60 * 60 * 1000;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function rpc(admin: Admin, name: string, args: Json) {
  const { data, error } = await (admin.rpc as any)(name, args);
  if (error) throw error;
  return data;
}

/** Queues consolidation for the Roles that are due; returns how many. */
export async function enqueueDueCriteriaConsolidations(args: {
  admin: Admin;
  enabled?: boolean;
  limit?: number;
}) {
  if (!(args.enabled ?? CRITERIA_PROPOSALS_ENABLED)) return 0;
  return Number(
    (await rpc(args.admin, "enqueue_due_company_decision_consolidations_v1", {
      p_every: CRITERIA_PROPOSAL_RULES.everyDecisions,
      p_wait_days: CRITERIA_PROPOSAL_RULES.waitDays,
      p_limit: args.limit ?? 20,
    })) ?? 0
  );
}

type ConsolidationInput = {
  roleId: string;
  workspaceId: string;
  open: boolean;
  criteria: unknown;
  cursor: number | null;
  briefRevision: number | null;
  decisions: PassDecision[];
  pending: { id: string; payload: unknown; expiresAt: string } | null;
  answeredKeys: string[];
};

export type CriteriaConsolidationResult = {
  status: "off" | "skipped" | "proposed" | "pending" | "nothing";
  proposalId?: string;
  /** The cursor after this run. */
  throughDecisionId: number | null;
};

/** What Harper's review gets: the Role's current facts and the passes to read. */
export type PreparedCriteriaReview = {
  workspaceId: string;
  roleId: string;
  criteria: unknown;
  briefRevision: number | null;
  answeredKeys: string[];
  review: CriteriaReview;
};

/** Harper's review of the passes; returns the suggestion it added, if any. */
export type CriteriaReviewRunner = (
  prepared: PreparedCriteriaReview
) => Promise<{ proposalId: string | null }>;

/** The consolidation input of one Role (criteria, cursor, recent passes, open and answered suggestions). */
export async function readConsolidationInput(admin: Admin, roleId: string, limit = 40) {
  return (await rpc(admin, "company_decision_consolidation_input_v1", {
    p_role_id: roleId,
    p_limit: limit,
  })) as ConsolidationInput | null;
}

/**
 * The company's own words on these passes: the reason kept on each decision,
 * its notes on the candidates for this Role, and who the candidates were.
 */
async function readCriteriaReview(args: {
  admin: Admin;
  roleId: string;
  decisions: PassDecision[];
  cursor: number | null;
}): Promise<CriteriaReview> {
  const ids = args.decisions.map((decision) => decision.id);
  const talentIds = [...new Set(args.decisions.map((decision) => decision.subjectId).filter(Boolean))] as string[];
  const [events, notes, people] = await Promise.all([
    ids.length
      ? untypedTable(args.admin, "company_decision_events")
          .select("id,action,detail,reason_text")
          .eq("role_id", args.roleId)
          .in("id", ids)
      : { data: [], error: null },
    talentIds.length
      ? untypedTable(args.admin, "talent_progress")
          .select("talent_id,text,created_at")
          .eq("role_id", args.roleId)
          .eq("kind", "org_note")
          .eq("open_to_company", true)
          .in("talent_id", talentIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [], error: null },
    talentIds.length
      ? untypedTable(args.admin, "talent_users")
          .select("user_id,headline,deleted_at")
          .in("user_id", talentIds)
      : { data: [], error: null },
  ]);
  for (const result of [events, notes, people]) if (result.error) throw result.error;
  const details: PassDecisionDetail[] = ((events.data ?? []) as Json[]).map((row) => ({
    id: Number(row.id),
    action: clean(row.action),
    stage: clean(row.detail?.stage) || null,
    reasonText: typeof row.reason_text === "string" ? row.reason_text : null,
  }));
  const candidateNotes: CandidateNote[] = ((notes.data ?? []) as Json[]).flatMap((row) =>
    typeof row.text === "string" && row.talent_id
      ? [{ talentId: String(row.talent_id), text: row.text, createdAt: row.created_at ?? null }]
      : []
  );
  const headlines = Object.fromEntries(
    ((people.data ?? []) as Json[])
      .filter((row) => !row.deleted_at)
      .map((row) => [String(row.user_id), typeof row.headline === "string" ? row.headline : null])
  );
  return buildCriteriaReview({
    cursor: args.cursor,
    decisions: args.decisions,
    details,
    headlines,
    notes: candidateNotes,
  });
}

/**
 * Reads one Role's recent passes and, when any new one has a stated reason,
 * lets Harper review them. The cursor moves past what was read either way.
 */
export async function runCriteriaConsolidation(args: {
  admin: Admin;
  workspaceId: string;
  roleId: string;
  /** The newest decision the dispatcher saw when it queued this run. */
  throughDecisionId?: number | null;
  enabled?: boolean;
  now?: Date;
  review: CriteriaReviewRunner;
}): Promise<CriteriaConsolidationResult> {
  if (!(args.enabled ?? CRITERIA_PROPOSALS_ENABLED))
    return { status: "off", throughDecisionId: null };
  const { admin, roleId } = args;
  const now = args.now ?? new Date();
  const input = await readConsolidationInput(admin, roleId);
  if (!input || input.workspaceId !== args.workspaceId)
    return { status: "skipped", throughDecisionId: null };
  const decisions = (input.decisions ?? []).map((decision) => ({
    ...decision,
    id: Number(decision.id),
    reasonTags: Array.isArray(decision.reasonTags) ? decision.reasonTags.map(String) : [],
  }));
  const through = Math.max(Number(args.throughDecisionId) || 0, decisions[0]?.id ?? 0) || null;
  const consume = async () => {
    if (through) await rpc(admin, "consume_company_decisions_v1", { p_role_id: roleId, p_through_id: through });
  };
  if (!input.open) {
    await consume();
    return { status: "skipped", throughDecisionId: through };
  }

  // One suggestion per Role at a time: while one waits, Harper does not run.
  let pendingOpen = Boolean(input.pending);
  if (input.pending) {
    const payload = parseCriteriaProposalPayload(input.pending.payload);
    if (Date.parse(input.pending.expiresAt) <= now.getTime()) {
      // Expired: the next suggestion replaces it.
      pendingOpen = false;
    } else if (payload && !criteriaProposalStillApplies(payload.change, input.criteria)) {
      // The criterion changed since: the suggestion no longer fits.
      const resolved = await rpc(admin, "resolve_company_brief_proposal_v1", {
        p_action: "stale",
        p_actor_user_id: null,
        p_detail: {},
        p_proposal_id: input.pending.id,
        p_role_id: roleId,
        p_workspace_id: args.workspaceId,
      });
      pendingOpen = clean(resolved?.status) !== "stale";
    }
  }
  if (pendingOpen) {
    await consume();
    return { status: "pending", throughDecisionId: through };
  }

  const review = await readCriteriaReview({ admin, roleId, decisions, cursor: input.cursor });
  // Nothing new to read (no new pass gave a reason): no run.
  if (!review.passes.some((pass) => pass.isNew)) {
    await consume();
    return { status: "nothing", throughDecisionId: through };
  }
  const { proposalId } = await args.review({
    answeredKeys: input.answeredKeys ?? [],
    briefRevision: input.briefRevision ?? null,
    criteria: input.criteria,
    review,
    roleId,
    workspaceId: args.workspaceId,
  });
  await consume();
  return proposalId
    ? { proposalId, status: "proposed", throughDecisionId: through }
    : { status: "nothing", throughDecisionId: through };
}

/**
 * Adds a suggestion to the Role's To-do through the one proposal path
 * (create_company_brief_proposal_v1): nothing is added while another one
 * waits or when the company already answered the same change.
 */
export async function fileCriteriaProposal(args: {
  admin: Admin;
  workspaceId: string;
  roleId: string;
  payload: CriteriaProposalPayload;
  briefRevision: number | null;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const text = criteriaProposalText(args.payload, args.payload.locale ?? "ko");
  const result = (await rpc(args.admin, "create_company_brief_proposal_v1", {
    p_base_brief_revision: args.briefRevision ?? null,
    p_content_key: criteriaProposalContentKey(args.payload.change),
    p_expires_at: new Date(now.getTime() + CRITERIA_PROPOSAL_RULES.expiresInDays * DAY_MS).toISOString(),
    p_kind: "criteria_refinement",
    p_payload: args.payload,
    p_preview: text.preview,
    p_role_id: args.roleId,
    p_summary: text.summary,
    p_workspace_id: args.workspaceId,
  })) as Json | null;
  const status = clean(result?.status);
  return {
    status: status === "created" || status === "pending_exists" || status === "answered_before" ? status : "unknown",
    proposalId: status === "created" ? clean(result?.proposalId) || null : null,
    summary: text.summary,
  } as const;
}

/**
 * The consolidate_decisions job of company_agent_web_action_jobs: runs the
 * consolidation (Harper's review) and completes the job without a message.
 */
export async function runQueuedCriteriaConsolidation(args: {
  admin: Admin;
  job: Json;
  /** The run's usage, read when the job completes (after Harper's calls). */
  usage?: Json | (() => Json);
  now?: Date;
  /** Defaults to CRITERIA_PROPOSALS_ENABLED (tests pass it). */
  enabled?: boolean;
  /** Defaults to Harper's review run (tests pass a stand-in). */
  review?: CriteriaReviewRunner;
}) {
  const { admin, job } = args;
  const review: CriteriaReviewRunner =
    args.review ??
    (async (prepared) => {
      const { runCriteriaReviewAgent } = await import("@/lib/org/criteriaReview.server");
      return runCriteriaReviewAgent({ admin, job, prepared });
    });
  const result = await runCriteriaConsolidation({
    admin,
    enabled: args.enabled,
    now: args.now,
    review,
    roleId: clean(job.role_id) || clean(job.action_context?.roleId),
    throughDecisionId: Number(job.action_context?.throughDecisionId) || null,
    workspaceId: clean(job.company_workspace_id),
  });
  const at = (args.now ?? new Date()).toISOString();
  const usage = typeof args.usage === "function" ? args.usage() : args.usage;
  const { error } = await (admin.from("company_agent_web_action_jobs" as any) as any)
    .update({
      completed_at: at,
      last_error: null,
      locked_at: null,
      locked_by: null,
      status: "completed_silent",
      updated_at: at,
      ...(usage ? { usage } : {}),
    })
    .eq("id", job.id)
    .eq("status", "processing")
    .eq("locked_by", job.locked_by);
  if (error) throw error;
  return result;
}

/**
 * The Role's open criteria suggestion for the To-do, in the reader's
 * language, under Harper's suggestions (not counted as a To-do).
 */
export async function readRoleCriteriaProposalItems(args: {
  admin: Admin;
  workspaceId: string;
  roleId: string;
  locale: CompanyTermLocale;
  now?: Date;
}): Promise<OrgTodoItem[]> {
  const now = args.now ?? new Date();
  const { data, error } = await untypedTable(args.admin, "company_agent_update_proposals")
    .select("id,payload,created_at")
    .eq("workspace_id", args.workspaceId)
    .eq("scope_key", `brief:${args.roleId}`)
    .eq("status", "pending")
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; payload: unknown; created_at: string }>).flatMap((row) => {
    const payload = parseCriteriaProposalPayload(row.payload);
    if (!payload) return [];
    return [
      {
        id: `criteria:${row.id}`,
        column: "suggestion",
        kind: "criteria_proposal",
        at: row.created_at,
        detail: criteriaProposalText(payload, args.locale).summary,
        source: "harper",
      } satisfies OrgTodoItem,
    ];
  });
}

export type SaveProposedCriteria = (args: {
  criteria: OrgRoleCriterion[];
  expectedCriteria: unknown;
  roleId: string;
  user: User;
  workspaceId: string;
}) => Promise<void>;

/**
 * The Brief's one write path, as a criteria edit on the website: role start
 * Roles change through their Brief, others through the criteria save. Either
 * records the new Brief version with the person and the source.
 */
const saveThroughBrief: SaveProposedCriteria = async (args) => {
  const { applyChatEditToRoleStart } = await import("@/lib/org/roleStart/service");
  const viaBrief = await applyChatEditToRoleStart({
    criteria: args.criteria,
    expectedCriteria: args.expectedCriteria,
    historySource: "website",
    previousRequest: null,
    roleId: args.roleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  if (viaBrief) return;
  const { updateOrgRoleCriteria } = await import("@/lib/org/server");
  await updateOrgRoleCriteria({
    criteria: args.criteria,
    expectedCriteria: args.expectedCriteria,
    roleId: args.roleId,
    source: "website",
    user: args.user,
    workspaceId: args.workspaceId,
  });
};

function answeredError(status: string) {
  if (status === "not_found") return new OrgHttpError(404, "제안을 찾지 못했어요.");
  if (status === "busy") return new OrgHttpError(409, "다른 팀원이 이 제안을 반영하고 있어요.");
  if (status === "expired") return new OrgHttpError(409, "기한이 지난 제안이에요.");
  if (status === "stale") return new OrgHttpError(409, "그사이 기준이 바뀌어 반영하지 않았어요.");
  return new OrgHttpError(409, "이미 답한 제안이에요.");
}

/**
 * A company user's answer to a criteria suggestion. accept saves the change
 * and records it; dismiss records it. Either way Harper never suggests the
 * same change again.
 */
export async function answerCriteriaProposal(args: {
  admin: Admin;
  user: User;
  workspaceId: string;
  roleId: string;
  proposalId: string;
  action: "accept" | "dismiss";
  now?: Date;
  saveCriteria?: SaveProposedCriteria;
}) {
  const { admin, roleId, workspaceId } = args;
  const resolve = async (action: string, detail: Json = {}) =>
    (await rpc(admin, "resolve_company_brief_proposal_v1", {
      p_action: action,
      p_actor_user_id: args.user.id,
      p_detail: detail,
      p_proposal_id: args.proposalId,
      p_role_id: roleId,
      p_workspace_id: workspaceId,
    })) as Json;

  if (args.action === "dismiss") {
    const result = await resolve("reject");
    if (result?.status !== "rejected") throw answeredError(clean(result?.status));
    return { status: "rejected" as const, decisionId: Number(result.decisionId) || null };
  }

  const claimed = await resolve("claim");
  if (claimed?.status !== "claimed") throw answeredError(clean(claimed?.status));
  const payload = parseCriteriaProposalPayload(claimed.payload);
  const { data: internal, error } = await untypedTable(admin, "company_internal_roles")
    .select("criteria")
    .eq("role_id", roleId)
    .maybeSingle();
  if (error) {
    await resolve("release").catch(() => undefined);
    throw error;
  }
  const current = (internal as { criteria?: unknown } | null)?.criteria ?? [];
  if (!payload || !criteriaProposalStillApplies(payload.change, current)) {
    await resolve("stale");
    throw answeredError("stale");
  }
  const now = args.now ?? new Date();
  const criteria = applyCriteriaProposal(
    current,
    payload.change,
    criteriaProposalChangeReason(payload, payload.locale ?? "ko"),
    now
  );
  try {
    await (args.saveCriteria ?? saveThroughBrief)({
      criteria,
      expectedCriteria: current,
      roleId,
      user: args.user,
      workspaceId,
    });
  } catch (saveError) {
    await resolve("release").catch(() => undefined);
    throw saveError;
  }
  const { data: revision, error: revisionError } = await untypedTable(admin, "company_role_brief_revisions")
    .select("revision")
    .eq("role_id", roleId)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (revisionError) console.error("[org/criteria-proposal:revision]", revisionError);
  const briefRevision = Number((revision as { revision?: unknown } | null)?.revision) || null;
  const applied = await resolve("apply", briefRevision ? { briefRevision } : {});
  if (applied?.status !== "applied") {
    // The change is saved; only its record failed. Say so rather than retry.
    console.error("[org/criteria-proposal:apply]", { proposalId: args.proposalId, status: applied?.status });
  }
  return {
    status: "applied" as const,
    briefRevision,
    decisionId: Number(applied?.decisionId) || null,
  };
}
