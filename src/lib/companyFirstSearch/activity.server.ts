import "server-only";
import type { OrgAgentAdminClient } from "@/lib/org/agent/data";
import type { OrgMatchingSearchStatusResponse, RoleMatchingActivity } from "./activity";

type Run = {
  status: string;
  trigger_reason: string;
  activation_run_id: string | null;
  selection_source_run_id: string | null;
};
type Job = { status: string; activation_run_id: string | null; completed_run_id: string | null };

const runFields = "status,trigger_reason,activation_run_id:request_options->>activationRunId,selection_source_run_id:request_options->>selectionSourceRunId";
const triggerOf = (row: Run): RoleMatchingActivity["trigger"] =>
  row.trigger_reason === "role_activated" || row.activation_run_id
    ? "role_activated"
    : row.trigger_reason === "scheduled" ? "scheduled" : "requested";

/** Read only work facts for an authorized Role. Never expose candidate data or model output. */
export async function readRoleMatchingActivity(args: {
  admin: OrgAgentAdminClient; workspaceId: string; roleId: string;
}): Promise<OrgMatchingSearchStatusResponse> {
  const { admin, workspaceId, roleId } = args;
  const [runs, jobs, handoffs] = await Promise.all([
    (admin.from("company_first_search_runs" as any) as any).select(runFields)
      .eq("company_workspace_id", workspaceId)
      .or(`role_id.eq.${roleId},scheduled_role_ids.cs.{${roleId}},requested_role_ids.cs.{${roleId}}`)
      .in("status", ["queued", "running", "delivery_pending"])
      .order("created_at", { ascending: false }),
    (admin.from("company_agent_web_action_jobs" as any) as any)
      .select("status,activation_run_id:action_context->>activationRunId,completed_run_id:action_context->>completedRunId")
      .eq("company_workspace_id", workspaceId).eq("role_id", roleId)
      .eq("action_name", "scheduled_matching_review")
      .in("status", ["queued", "retry", "processing"])
      .order("created_at", { ascending: false }).limit(1),
    // The completed worker run remains pending until its company-side continuation
    // is enqueued. This covers the dispatcher handoff without a misleading idle gap.
    (admin.from("company_first_search_runs" as any) as any).select(runFields)
      .eq("company_workspace_id", workspaceId).eq("role_id", roleId)
      .eq("contract_version", "scheduled_agentic_role_search_v1")
      .in("status", ["succeeded", "skipped", "failed"])
      .is("result->scheduledContinuation->>jobId", null)
      .order("created_at", { ascending: false }).limit(1),
  ]);
  for (const response of [runs, jobs, handoffs]) if (response.error) throw response.error;
  const activeRuns = (runs.data ?? []) as Run[];
  const active = activeRuns.some(row => row.trigger_reason === "company_requested");
  const run = activeRuns.find(row => row.status === "running") ?? activeRuns[0];
  let activity: RoleMatchingActivity | null = null;
  if (run) {
    activity = { trigger: triggerOf(run), phase: run.status === "delivery_pending" ? "delivering"
      : run.status === "queued" ? "queued" : run.selection_source_run_id ? "preparing" : "searching" };
  } else {
    const job = (jobs.data?.[0] ?? null) as Job | null;
    const handoff = (handoffs.data?.[0] ?? null) as Run | null;
    if (job) activity = { trigger: job.activation_run_id ? "role_activated" : "scheduled",
      phase: job.completed_run_id ? "reviewing" : "queued" };
    else if (handoff) activity = { trigger: triggerOf(handoff), phase: "reviewing" };
  }
  return { ok: true, active, activity };
}
