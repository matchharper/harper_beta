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
  findCriteriaProposal,
  parseCriteriaProposalPayload,
  type PassDecision,
} from "@/lib/org/criteriaProposals";
import { OrgHttpError } from "@/lib/org/httpError";
import type { OrgRoleCriterion } from "@/lib/org/roleCriteria";
import type { CompanyTermLocale } from "@/lib/org/terms";
import type { OrgTodoItem } from "@/lib/org/todo";
import { untypedTable } from "@/lib/org/untypedTable";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";

/**
 * Pass reasons sharpen the criteria (S2 G), on the server: the dispatcher
 * queues a consolidate_decisions job for each due Role, the job counts the
 * Role's recent pass reasons and may add one suggestion, the To-do lists it,
 * and a company user's answer either saves the change through the Brief's
 * write path or dismisses it. No model is called anywhere here.
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

/**
 * Reads one Role's recent pass reasons and adds a suggestion when they
 * support one. The cursor moves past what was read either way.
 */
export async function runCriteriaConsolidation(args: {
  admin: Admin;
  workspaceId: string;
  roleId: string;
  /** The newest decision the dispatcher saw when it queued this run. */
  throughDecisionId?: number | null;
  enabled?: boolean;
  locale?: CompanyTermLocale;
  now?: Date;
}): Promise<CriteriaConsolidationResult> {
  if (!(args.enabled ?? CRITERIA_PROPOSALS_ENABLED))
    return { status: "off", throughDecisionId: null };
  const { admin, roleId } = args;
  const now = args.now ?? new Date();
  const input = (await rpc(admin, "company_decision_consolidation_input_v1", {
    p_role_id: roleId,
    p_limit: 40,
  })) as ConsolidationInput | null;
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

  const proposal = findCriteriaProposal({
    answeredKeys: input.answeredKeys ?? [],
    criteria: input.criteria,
    decisions,
  });
  let created: string | undefined;
  if (proposal) {
    const locale =
      args.locale ??
      (await (await import("@/lib/org/workspaceLocale.server")).getOrgWorkspaceLocale(args.workspaceId, admin));
    const text = criteriaProposalText(proposal, locale);
    const result = await rpc(admin, "create_company_brief_proposal_v1", {
      p_base_brief_revision: input.briefRevision ?? null,
      p_content_key: criteriaProposalContentKey(proposal.change),
      p_expires_at: new Date(now.getTime() + CRITERIA_PROPOSAL_RULES.expiresInDays * DAY_MS).toISOString(),
      p_kind: "criteria_refinement",
      p_payload: { ...proposal, locale },
      p_preview: text.preview,
      p_role_id: roleId,
      p_summary: text.summary,
      p_workspace_id: args.workspaceId,
    });
    if (clean(result?.status) === "created") created = clean(result.proposalId);
  }
  await consume();
  return created
    ? { proposalId: created, status: "proposed", throughDecisionId: through }
    : { status: "nothing", throughDecisionId: through };
}

/**
 * The consolidate_decisions job of company_agent_web_action_jobs: runs the
 * consolidation and completes the job without a message.
 */
export async function runQueuedCriteriaConsolidation(args: {
  admin: Admin;
  job: Json;
  usage?: Json;
  now?: Date;
}) {
  const { admin, job } = args;
  const result = await runCriteriaConsolidation({
    admin,
    now: args.now,
    roleId: clean(job.role_id) || clean(job.action_context?.roleId),
    throughDecisionId: Number(job.action_context?.throughDecisionId) || null,
    workspaceId: clean(job.company_workspace_id),
  });
  const at = (args.now ?? new Date()).toISOString();
  const { error } = await (admin.from("company_agent_web_action_jobs" as any) as any)
    .update({
      completed_at: at,
      last_error: null,
      locked_at: null,
      locked_by: null,
      status: "completed_silent",
      updated_at: at,
      ...(args.usage ? { usage: args.usage } : {}),
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
