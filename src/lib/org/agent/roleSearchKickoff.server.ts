import "server-only";
import type { User } from "@supabase/supabase-js";
import { isTestOnlyInternalRole } from "@/lib/internalRoleSafety";
import { matchingSearchUnavailableReason } from "./matchingSearch";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { assertOrgRoleAccess, OrgHttpError } from "../server";
import { isHarperSlackAudienceAllowed } from "../slackHarper";
import { OrgAgentWebActionSupersededError } from "./chat";
import { buildOrgAgentPromptContext } from "./context";
import { runRoleSearchResearchDelivery } from "./roleSearchResearch.server";
import { saveCompanyMessageBatchThinkingLogs } from "./companyMessaging";
import { upsertOrgAgentThinkingLog } from "./thinkingLogs";
import type { OrgAgentThinkingLog } from "./types";
import type { OrgAgentConversationRow } from "./store";

export type RoleSearchKickoffRequest = {
  user: User; workspaceId: string; roleId: string; channelDbId: string; requestId: string;
};

export async function assertRoleSearchKickoffAccess(args: Omit<RoleSearchKickoffRequest, "requestId">) {
  const admin = getSupabaseAdmin();
  await assertOrgRoleAccess({ admin, ...args });
  const [{ data: role, error }, { data: channel, error: channelError }] = await Promise.all([
    admin.from("company_roles").select("status,source_type,information,is_expired,expires_at")
      .eq("role_id", args.roleId).eq("company_workspace_id", args.workspaceId).single(),
    admin.from("company_slack_channels").select("id,slack_channel_id,is_enabled")
      .eq("id", args.channelDbId).eq("company_workspace_id", args.workspaceId).single(),
  ]);
  if (error) throw error;
  if (channelError) throw channelError;
  if (role.source_type !== "internal" || role.status !== "active" || role.is_expired ||
    (role.expires_at && Date.parse(role.expires_at) <= Date.now()) || isTestOnlyInternalRole(role))
    throw new OrgHttpError(409, "This Role is not available for a recruiting search");
  if (!channel.is_enabled || !await isHarperSlackAudienceAllowed({
    workspaceId: args.workspaceId, roleId: args.roleId, channelId: channel.slack_channel_id,
  })) throw new OrgHttpError(409, "The selected channel cannot receive this Role's messages");
  return channel;
}

/** Explicit manual job only. Role activation never calls this function. */
export async function runRoleSearchKickoff(args: {
  user: User; conversation: OrgAgentConversationRow; anchorMessageId: number; jobId: string;
  roleId: string | null; actionContext: Record<string, unknown>; responseLocale?: "ko" | "en" | "auto";
}, dependencies = { admin: getSupabaseAdmin, access: assertRoleSearchKickoffAccess, context: buildOrgAgentPromptContext,
  research: runRoleSearchResearchDelivery, saveLogs: saveCompanyMessageBatchThinkingLogs }) {
  const workspaceId = args.conversation.company_workspace_id;
  const roleId = args.roleId;
  if (!roleId || args.conversation.role_id !== roleId || typeof args.actionContext.channelDbId !== "string")
    throw new Error("Missing authorized research target");
  const scope = { user: args.user, workspaceId, roleId, channelDbId: args.actionContext.channelDbId };
  const channel = await dependencies.access(scope);
  const admin = dependencies.admin();
  const { data: committed, error } = await admin.from("company_messages").select("id,metadata")
    .eq("company_workspace_id", workspaceId).eq("role_id", roleId).eq("role", "assistant")
    .contains("metadata", { webActionJobId: args.jobId })
    .not("metadata->companyMessageBatch", "is", null).order("id");
  if (error) throw error;
  // A committed draft is immutable. Delivery retries must not rerun research or overwrite the Brief.
  if (committed?.length) return { outcome: "completed_message" as const, progressMessageId: null,
    terminalMessageId: Number(committed[0].id), batchId: (committed[0].metadata as any).companyMessageBatch.batchId as string };
  const assertCanContinue = async () => {
    await dependencies.access(scope);
    const { data: current, error } = await (admin.from("company_agent_web_action_jobs" as any) as any)
      .select("status").eq("id", args.jobId).single();
    if (error) throw error;
    if (current.status !== "processing") throw new Error("Research assignment is no longer processing");
    // Same freshness boundary as ordinary web actions: let the newer company
    // conversation own its instructions instead of applying a stale assignment.
    const { data: newer, error: newerError } = await admin.from("company_messages").select("id")
      .eq("conversation_id", args.conversation.id).eq("role", "user")
      .in("message_type", ["chat", "slack"]).gt("id", args.anchorMessageId).limit(1);
    if (newerError) throw newerError;
    if (newer?.length) throw new OrgAgentWebActionSupersededError();
  };
  const context = await dependencies.context({ admin, user: args.user, conversation: args.conversation,
    beforeMessageId: args.anchorMessageId, currentUserMessageId: args.anchorMessageId,
    includeSharedConversation: true, readAudience: "company_safe", scopeKey: `research-delivery:${roleId}` });
  let thinkingLogs: OrgAgentThinkingLog[] = [];
  const result = await dependencies.research({ admin, context, user: args.user,
    conversation: args.conversation, roleId, currentUserMessageId: args.anchorMessageId,
    responseLocale: args.responseLocale, assertCanContinue,
    companyMessageAudience: { channelDbId: channel.id, channelId: channel.slack_channel_id, jobId: args.jobId },
    onToolStatus: log => { thinkingLogs = upsertOrgAgentThinkingLog(thinkingLogs, log); },
  });
  await dependencies.saveLogs({ admin, workspaceId, batch: result.batch, thinkingLogs });
  return { outcome: "completed_message" as const, progressMessageId: null,
    terminalMessageId: result.batch.messageIds[0], batchId: result.batch.batchId };
}

/** The DB records admission on the existing job atomically with search enqueue. */
export async function continueRoleSearchKickoff(args: { jobId: string; workspaceId: string; roleId: string }) {
  const admin = getSupabaseAdmin();
  const { data: result, error } = await (admin.rpc as any)("enqueue_company_research_search_v1", { p_job_id: args.jobId });
  if (error) throw error;
  if (!result || !["queued", "already_queued", "already_running", "not_queued"].includes(result.status))
    throw new Error("Unexpected research search admission result");
  if (result.status === "not_queued") {
    const { enqueueCompanyUpdate } = await import("./companyUpdate.server");
    // Ordinary company-side LLM explains the verified result; no fixed success/failure prose.
    await enqueueCompanyUpdate({ workspaceId: args.workspaceId, roleId: args.roleId,
      eventKey: `role-research:${args.jobId}:search-unavailable`,
      purpose: "서치 방향은 전달했지만 이어지는 후보 탐색이 접수되지 않은 상황을 설명하고, 현재 가능한 다음 행동을 판단한다.",
      facts: { researchExplanationDelivered: true, searchAccepted: false, searchUnavailableReason: matchingSearchUnavailableReason(result.reason) },
    });
  }
  return result;
}

/** Give the ordinary result writer what was actually explained, without a second research report. */
export async function readRoleSearchKickoffExplanation(args: {
  admin: ReturnType<typeof getSupabaseAdmin>; workspaceId: string; roleId: string; runId: string;
}) {
  const { data: job, error } = await (args.admin.from("company_agent_web_action_jobs" as any) as any)
    .select("id").eq("company_workspace_id", args.workspaceId).eq("role_id", args.roleId)
    .eq("action_name", "role_search_kickoff")
    .contains("action_context", { matchingSearchResult: { runId: args.runId } })
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!job) return null;
  const { data: messages, error: messageError } = await args.admin.from("company_messages")
    .select("content").eq("company_workspace_id", args.workspaceId).eq("role_id", args.roleId)
    .eq("role", "assistant").contains("metadata", { webActionJobId: job.id })
    .not("metadata->companyMessageReceipt", "is", null).order("id");
  if (messageError) throw messageError;
  return messages?.length ? { alreadyDelivered: true, explanation: messages.map(m => m.content).join("\n\n") } : null;
}
