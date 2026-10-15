import "server-only";
import type { User } from "@supabase/supabase-js";
import type { OrgLocale } from "@/i18n/org/locale";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { enqueueOrgAgentWebActionTurn, dispatchOrgAgentWebActionJob } from "./webActionTurn";
import { assertOrgWorkspacePermission } from "../server";
import { getOrgWorkspaceLocale } from "../workspaceLocale.server";
import type { BackgroundResultCandidateTarget } from "./backgroundResultParts";
import { buildCompanyUpdatePrompt, type CompanyUpdateSlackReceipt } from "./companyUpdate";
import { getHarperSlackMessagePermalink, resolveHarperSlackInteractionContext, sendHarperWorkspaceSlackMessage } from "../slackHarper";
import { buildSlackChannelLinks } from "../onboarding";
import { getSlackOrgAgentModel } from "./modelConfig";

/** Called only by the dispatcher shipped with company_update support. */
export async function releasePendingCompanyUpdates() {
  const admin = getSupabaseAdmin() as any;
  const { data, error } = await admin.from("company_agent_web_action_jobs")
    .select("id").eq("action_name", "company_update").eq("status", "failed")
    .eq("last_error", "company_update_runtime_required")
    .order("created_at", { ascending: true }).limit(20);
  if (error) throw error;
  if (!data?.length) return;
  const { error: releaseError } = await admin.from("company_agent_web_action_jobs")
    .update({ status: "queued", queue_dispatch_status: "pending", last_error: null })
    .in("id", data.map((job: { id: string }) => job.id))
    .eq("status", "failed").eq("last_error", "company_update_runtime_required");
  if (releaseError) throw releaseError;
}

/** Existing sealed card outboxes use the same company-side writer and contract.
 * This adapter only composes; the owning outbox persists and delivers the result.
 */
export async function composeCompanyUpdate(args: {
  workspaceId: string; roleIds: string[]; purpose: string;
  facts: Record<string, unknown>; candidateTargets: BackgroundResultCandidateTarget[];
  responseLocale?: OrgLocale;
}) {
  const admin = getSupabaseAdmin() as any;
  const [{ data: workspace, error: workspaceError }, { data: history, error: historyError }] = await Promise.all([
    admin.from("company_workspace").select("company_name,published_name").eq("company_workspace_id", args.workspaceId).single(),
    args.roleIds.length ? admin.from("company_messages").select("role,content,created_at")
      .eq("company_workspace_id", args.workspaceId).in("role_id", args.roleIds)
      .eq("message_type", "chat").in("role", ["user", "assistant"])
      .order("id", { ascending: false }).limit(12) : Promise.resolve({ data: [], error: null }),
  ]);
  if (workspaceError) throw workspaceError;
  if (historyError) throw historyError;
  const context = {
    companyName: workspace.published_name || workspace.company_name,
    purpose: args.purpose, facts: args.facts,
    recentConversation: (history ?? []).toReversed(),
  };
  const { generateOrgAgentBackgroundResultReply } = await import("./chat");
  return generateOrgAgentBackgroundResultReply({
    companyName: workspace.published_name || workspace.company_name,
    roleId: args.roleIds[0] ?? "", roleName: "", surface: "slack",
    responseLocale: args.responseLocale ?? await getOrgWorkspaceLocale(args.workspaceId, admin),
    requestedByCompany: false, candidateTargets: args.candidateTargets,
    userMessage: "",
    resultText: buildCompanyUpdatePrompt(context),
    ...(!args.roleIds.length ? { companyUpdateContext: context, model: getSlackOrgAgentModel() } : {}),
  });
}

/** Durable normal company-side turn, with ordinary history, read tools and delivery. */
type QueuedCompanyUpdate = {
  workspaceId: string; roleId: string; eventKey: string;
  purpose: string; facts: Record<string, unknown>;
  messageAlreadyDelivered?: boolean;
  immediate?: boolean;
  presentation?: { text: string; blocks?: Array<Record<string, unknown>>; metadata?: Record<string, unknown> };
};

export type InlineSlackCompanyUpdate = {
  user: User;
  workspaceId: string; eventKey: string; purpose: string; facts: Record<string, unknown>;
  /** The caller owns the completed event and supplies an authorized, member-specific destination. */
  slackDelivery: {
    channelId: string; slackTeamId: string; mentionSlackUserId: string; responseLocale?: OrgLocale;
  };
};

export function enqueueCompanyUpdate(args: QueuedCompanyUpdate): Promise<{ jobId: string }>;
export function enqueueCompanyUpdate(args: InlineSlackCompanyUpdate): Promise<{ slackUrl: string; threadId: string }>;
export async function enqueueCompanyUpdate(args: QueuedCompanyUpdate | InlineSlackCompanyUpdate) {
  if ("slackDelivery" in args) {
    const target = args.slackDelivery;
    await assertOrgWorkspacePermission({ admin: getSupabaseAdmin(), user: args.user, workspaceId: args.workspaceId, permission: "manage_candidates" });
    const installation = await resolveHarperSlackInteractionContext({
      workspaceId: args.workspaceId, channelId: target.channelId, slackTeamId: target.slackTeamId,
    });
    // Establish the real Slack thread, then run the ordinary event agent with
    // its progressive tools and durable message delivery.
    let root: CompanyUpdateSlackReceipt | undefined;
    await sendHarperWorkspaceSlackMessage({
      workspaceId: args.workspaceId, channelId: target.channelId,
      text: `<@${target.mentionSlackUserId}> 👋`,
      idempotencyKey: `${args.eventKey}:mention`,
      messageMetadata: { source: "company_update" },
      unfurlLinks: false, requireAllDeliveries: true,
      onPosted: receipt => { root = receipt; },
    });
    if (!root) throw new Error("Company update mention was not delivered");
    const job = await enqueueOrgAgentWebActionTurn({
      user: args.user, workspaceId: args.workspaceId,
      actionName: "company_update", idempotencyKey: args.eventKey, dispatch: false,
      actionContext: {
        purpose: args.purpose, facts: args.facts, slackThreadId: root.threadId,
        slackUserId: target.mentionSlackUserId, responseLocale: target.responseLocale,
      },
    });
    const { processCompanyAgentWebActionJob } = await import("./webActionProcessor.server");
    await processCompanyAgentWebActionJob({ jobId: job.jobId, kind: "web_action_job", version: 1 }, { messageId: `inline:${job.jobId}` });
    const { data: completed, error: completedError } = await (getSupabaseAdmin().from("company_agent_web_action_jobs" as any) as any)
      .select("status").eq("id", job.jobId).single();
    if (completedError) throw completedError;
    if (completed.status !== "completed_message") throw new Error("Company update delivery is incomplete");
    const delivered = root;
    let slackUrl = buildSlackChannelLinks(target.slackTeamId, target.channelId)!.web;
    try {
      slackUrl = await getHarperSlackMessagePermalink({
        channelId: target.channelId, messageTs: delivered.slackMessageTs, token: installation.token,
      });
    } catch (error) {
      console.warn("[company-update] Slack message link unavailable", error);
    }
    return { slackUrl, threadId: delivered.threadId };
  }
  const admin = getSupabaseAdmin();
  const { data, error } = await (admin.rpc as any)("enqueue_company_update_v1", {
    p_workspace_id: args.workspaceId, p_role_id: args.roleId, p_event_key: args.eventKey,
    p_purpose: args.purpose, p_facts: {
      ...args.facts,
      companyMessageAlreadyDelivered: args.messageAlreadyDelivered === true,
      ...(args.presentation ? { preservedPresentation: args.presentation } : {}),
    },
  });
  if (error) throw error;
  const jobId = String(data ?? "");
  if (!jobId) throw new Error("Company update was not recorded");
  // Only this compatible runtime releases a new event. Older deployed consumers
  // do not understand company_update and must never claim these staged jobs.
  const { error: releaseError } = await (admin.from("company_agent_web_action_jobs" as any) as any)
    .update({ status: "queued", queue_dispatch_status: "pending", last_error: null })
    .eq("id", jobId).eq("action_name", "company_update")
    .eq("status", "failed").eq("last_error", "company_update_runtime_required");
  if (releaseError) throw releaseError;
  if (args.immediate) {
    try {
      const { processCompanyAgentWebActionJob } = await import("./webActionProcessor.server");
      await processCompanyAgentWebActionJob({ jobId, kind: "web_action_job", version: 1 }, { messageId: `inline:${jobId}` });
    } catch (error) {
      await dispatchOrgAgentWebActionJob({ admin, jobId });
      throw error;
    }
  } else {
    await dispatchOrgAgentWebActionJob({ admin, jobId });
  }
  return { jobId };
}
