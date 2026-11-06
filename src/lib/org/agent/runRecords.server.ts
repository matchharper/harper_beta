import "server-only";
import { getLlmUsageContext, withLlmUsageContext } from "@/lib/llm/usageContext";
import { companyRunUsageJson, createCompanyRunUsage } from "@/lib/llm/runUsage";

/**
 * What one company Harper run did, and what company Harper's model calls
 * cost (#261, company_agent_usage_v1).
 *
 * - A run is a row in company_agent_web_action_jobs. The web action
 *   processor names it in the usage context, so a search started anywhere
 *   inside the run can be linked to it (company_agent_operations.run_id).
 * - Slack turns, email replies and connection emails are company Harper
 *   turns outside that ledger. Their model calls are collected the same way
 *   and saved per turn in company_agent_turn_usage.
 */

/** The company Harper run this code is part of, if any. */
export function currentCompanyRunId() {
  return getLlmUsageContext()?.companyRunId ?? null;
}

type RpcClient = {
  rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Links a search queued through an RPC to the run that queued it. The search
 * is already queued, so a failure here is only logged.
 */
export async function linkOperationToRun(args: {
  admin: unknown;
  kind: "member_search";
  workId: unknown;
  runId?: string | null;
}) {
  const runId = args.runId ?? currentCompanyRunId();
  const workId = typeof args.workId === "string" ? args.workId : "";
  if (!runId || !workId) return false;
  try {
    const { data, error } = await (args.admin as RpcClient).rpc("link_company_agent_operation_run_v1", {
      p_kind: args.kind,
      p_work_id: workId,
      p_run_id: runId,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.warn("[org/agent:run-link]", { kind: args.kind, workId, runId, error });
    return false;
  }
}

export type CompanyTurnUsageKind = "slack_turn" | "email_reply" | "connection_email";

export type CompanyTurnUsageTarget = {
  kind: CompanyTurnUsageKind;
  /** The turn's own row: slack_reply_jobs, email_reply_jobs or company_email_outbox. */
  sourceId: string;
  /** Set once known; without it nothing is saved. */
  workspaceId?: string | null;
  roleId?: string | null;
};

export type CompanyTurnUsage = ReturnType<typeof companyRunUsageJson>;

export type CompanyTurnUsageRecorder = (
  target: CompanyTurnUsageTarget & { workspaceId: string },
  usage: CompanyTurnUsage
) => Promise<void>;

/** Saves one turn's usage; repeats of the same turn add up (record_company_agent_turn_usage_v1). */
export const recordCompanyTurnUsage: CompanyTurnUsageRecorder = async (target, usage) => {
  const { getSupabaseAdmin } = await import("@/lib/server/candidateAccess");
  const { error } = await (getSupabaseAdmin() as unknown as RpcClient).rpc("record_company_agent_turn_usage_v1", {
    p_kind: target.kind,
    p_source_id: target.sourceId,
    p_company_workspace_id: target.workspaceId,
    p_role_id: target.roleId ?? null,
    p_usage: usage,
  });
  if (error) throw error;
};

/**
 * Runs one turn with its model calls counted, the way a run's are
 * (webActionProcessor), and saves them when the turn ends, also when it
 * fails. Saving is best effort and never changes the turn's outcome.
 */
export async function withCompanyTurnUsage<T>(
  target: CompanyTurnUsageTarget,
  work: () => Promise<T>,
  record: CompanyTurnUsageRecorder = recordCompanyTurnUsage
): Promise<T> {
  const totals = createCompanyRunUsage();
  const startedAt = Date.now();
  try {
    return await withLlmUsageContext({ requestId: target.sourceId, companyRunUsage: totals }, work);
  } finally {
    const workspaceId = target.workspaceId;
    if (totals.calls > 0 && workspaceId && target.sourceId) {
      await record({ ...target, workspaceId }, companyRunUsageJson(totals, Date.now() - startedAt)).catch((error) =>
        console.warn("[org/agent:turn-usage]", { kind: target.kind, sourceId: target.sourceId, error })
      );
    }
  }
}
