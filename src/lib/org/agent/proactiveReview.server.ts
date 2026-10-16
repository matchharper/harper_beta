import "server-only";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { assertOrgWorkspacePermission } from "../server";
import { isHarperSlackAudienceAllowed } from "../slackHarper";
import { buildOrgAgentPromptContext } from "./context";
import { buildCompanyProactiveReviewPrompt } from "./proactiveReview";
import { ORG_AGENT_SOL_MODEL } from "./modelConfig";
import { OrgAgentWebActionSupersededError, runOrgAgentToolLoop } from "./chat";
import { commitCompanyMessages, saveCompanyMessageBatchThinkingLogs, type CompanyMessageAudience } from "./companyMessaging";
import { upsertOrgAgentThinkingLog } from "./thinkingLogs";
import type { OrgAgentThinkingLog } from "./types";
import type { OrgAgentConversationRow } from "./store";
import { enqueueOrgAgentWebActionTurn } from "./webActionTurn";

type ProactiveReviewSchedule = { daysOfWeek: number[]; startTimeKst: string; windowMinutes: number };

// Scheduled outreach is enabled; production activation follows the normal release process.
export function isCompanyProactiveReviewEnabled() { return true; }

export function parseProactiveReviewSchedule(raw?: string): ProactiveReviewSchedule {
  const value = raw?.trim() ? JSON.parse(raw) : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("COMPANY_PROACTIVE_REVIEW_SCHEDULE must be an object");
  const daysOfWeek = value.daysOfWeek ?? [1, 2, 3, 4, 5];
  const startTimeKst = value.startTimeKst ?? "13:00";
  const windowMinutes = value.windowMinutes ?? 120;
  if (!Array.isArray(daysOfWeek) || daysOfWeek.some(day => !Number.isInteger(day) || day < 0 || day > 6)
    || typeof startTimeKst !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTimeKst)
    || !Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > 1440) {
    throw new Error("Invalid COMPANY_PROACTIVE_REVIEW_SCHEDULE: use daysOfWeek 0–6, startTimeKst HH:mm, windowMinutes 1–1440");
  }
  return { daysOfWeek, startTimeKst, windowMinutes };
}

export function proactiveReviewWindow(now: Date, schedule = parseProactiveReviewSchedule()) {
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const duration = schedule.windowMinutes * 60000;
  let startAt = Date.parse(`${today}T${schedule.startTimeKst}:00+09:00`);
  // An overnight window belongs to the date on which it started, including its deduplication key.
  const previousStart = startAt - 86400000;
  if (now.getTime() < startAt && now.getTime() < previousStart + duration) startAt = previousStart;
  const localStart = new Date(startAt + 9 * 3600000);
  return { date: localStart.toISOString().slice(0, 10),
    due: schedule.daysOfWeek.includes(localStart.getUTCDay()) && now.getTime() >= startAt && now.getTime() < startAt + duration,
    deadlineAt: new Date(startAt + duration).toISOString() };
}

async function* enabledProactiveChannels(admin: ReturnType<typeof getSupabaseAdmin>) {
  let afterId: string | undefined;
  while (true) {
    let query = admin.from("company_slack_channels").select("id,company_workspace_id")
      .eq("is_enabled", true).order("id").limit(200);
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return;
    yield* data;
    afterId = data[data.length - 1].id;
  }
}

/** Existing five-minute dispatcher only enqueues; the normal queue owns execution. */
export async function enqueueDueCompanyProactiveReviews(now = new Date(), dependencies = {
  admin: getSupabaseAdmin, allowed: isHarperSlackAudienceAllowed, enqueue: enqueueOrgAgentWebActionTurn,
}) {
  if (!isCompanyProactiveReviewEnabled()) return 0;
  const window = proactiveReviewWindow(now, parseProactiveReviewSchedule(process.env.COMPANY_PROACTIVE_REVIEW_SCHEDULE));
  if (!window.due) return 0;
  const admin = dependencies.admin();
  let enqueued = 0;
  for await (const discovered of enabledProactiveChannels(admin)) {
    const config = { workspaceId: discovered.company_workspace_id, channelDbId: discovered.id };
    const { data: channel, error } = await admin.from("company_slack_channels")
      .select("slack_channel_id,is_enabled").eq("id", config.channelDbId).eq("company_workspace_id", config.workspaceId).maybeSingle();
    if (error) throw error;
    if (!channel?.is_enabled) continue;
    const { data: owner, error: ownerError } = await admin.from("company_user_workspace").select("company_user_id,authority")
      .eq("company_workspace_id", config.workspaceId).eq("authority", "owner")
      .order("created_at").order("id").limit(1).maybeSingle();
    if (ownerError) throw ownerError;
    if (owner?.authority !== "owner") continue;
    if (!await dependencies.allowed({ workspaceId: config.workspaceId, channelId: channel.slack_channel_id })) continue;
    const { data: recent, error: recentError } = await admin.from("company_messages").select("id")
      .eq("company_workspace_id", config.workspaceId).eq("role", "user").in("message_type", ["chat", "slack"])
      .gte("created_at", new Date(now.getTime() - 30 * 60000).toISOString()).limit(1);
    if (recentError) throw recentError;
    if (recent?.length) continue;
    const auth = await admin.auth.admin.getUserById(owner.company_user_id);
    if (auth.error) throw auth.error;
    if (!auth.data.user) continue;
    const result = await dependencies.enqueue({ workspaceId: config.workspaceId, user: auth.data.user,
      actionName: "proactive_recruiting_review", actionContext: { channelDbId: config.channelDbId, deadlineAt: window.deadlineAt },
      idempotencyKey: `proactive-review:${config.workspaceId}:${config.channelDbId}:${window.date}`, dispatch: false });
    if (result.created) enqueued++;
  }
  return enqueued;
}

export async function loadCompanyProactiveAwareness(args: {
  admin: any; workspaceId: string; channelDbId: string; roles: Array<{ roleId: string; status?: string | null; promotionDemand?: unknown }>;
  anchor: number; now?: Date;
}) {
  const now = args.now ?? new Date();
  const roles = args.roles.filter(r => r.status === "active");
  const roleIds = roles.map(r => r.roleId);
  const { data: conversations, error } = roleIds.length ? await args.admin.from("company_conversations")
    .select("id,role_id,last_message_at").eq("company_workspace_id", args.workspaceId).in("role_id", roleIds)
    .order("last_message_at", { ascending: false, nullsFirst: false }).limit(6) : { data: [], error: null };
  if (error) throw error;
  const recentRoleConversations = await Promise.all((conversations ?? []).map(async (conversation: any) => {
    const { data, error: messageError } = await args.admin.from("company_messages").select("id,role,content,created_at,slack_thread_id")
      .eq("conversation_id", conversation.id).in("message_type", ["chat", "slack"])
      .is("metadata->companyEventUiDuplicateOf", null).lt("id", args.anchor).order("id", { ascending: false }).limit(4);
    if (messageError) throw messageError;
    return { roleId: conversation.role_id, conversationId: conversation.id, complete: false,
      messages: (data ?? []).reverse().map((m: any) => ({ id: m.id, role: m.role, createdAt: m.created_at,
        threadId: m.slack_thread_id, content: m.content.slice(0, 2400), complete: m.content.length <= 2400 })) };
  }));
  const { data: sent, error: sentError } = await args.admin.from("company_messages").select("role_id,content,created_at,slack_thread_id")
    .eq("company_workspace_id", args.workspaceId).eq("role", "assistant")
    .contains("metadata", { companyMessageBatch: { channelDbId: args.channelDbId } })
    .not("metadata->companyMessageReceipt", "is", null).gte("created_at", new Date(now.getTime() - 14 * 86400000).toISOString())
    .order("id", { ascending: false }).limit(24);
  if (sentError) throw sentError;
  return { asOf: now.toISOString(), origin: "Harper-initiated recruiting outreach", recipientScope: "Approved organization Slack audience; the execution actor is not an addressee",
    referenceCoverage: "Bounded recent Role excerpts and delivered proactive messages, not exhaustive history; retrieve more with read_conversation_history(roleId=...).",
    recentRoleConversations, recentDeliveredProactiveMessages: (sent ?? []).map((m: any) => ({ ...m, content: m.content.slice(0, 3000) })),
    acquisitionRequests: roles.filter(r => r.promotionDemand).map(r => ({ roleId: r.roleId, request: r.promotionDemand })),
  };
}

export async function runCompanyProactiveReview(args: {
  user: User; conversation: OrgAgentConversationRow; anchorMessageId: number; jobId: string;
  actionContext: Record<string, unknown>; responseLocale?: "ko" | "en" | "auto";
}) {
  if (!isCompanyProactiveReviewEnabled()) throw new OrgAgentWebActionSupersededError();
  const admin: any = getSupabaseAdmin();
  const workspaceId = args.conversation.company_workspace_id;
  await assertOrgWorkspacePermission({ admin, user: args.user, workspaceId, permission: "manage_candidates" });
  const { data: channel, error } = await admin.from("company_slack_channels").select("id,slack_channel_id,is_enabled")
    .eq("id", args.actionContext.channelDbId).eq("company_workspace_id", workspaceId).single();
  if (error) throw error;
  if (!channel.is_enabled || !await isHarperSlackAudienceAllowed({ workspaceId, channelId: channel.slack_channel_id }))
    throw new OrgAgentWebActionSupersededError();
  const { data: committed, error: committedError } = await admin.from("company_messages").select("id,metadata")
    .eq("company_workspace_id", workspaceId).contains("metadata", { webActionJobId: args.jobId })
    .eq("role", "assistant").not("metadata->companyMessageBatch", "is", null).order("id");
  if (committedError) throw committedError;
  if (committed?.length) return { outcome: "completed_message" as const, progressMessageId: null,
    terminalMessageId: Number(committed[0].id), batchId: committed[0].metadata.companyMessageBatch.batchId };
  const assertCanContinue = async () => {
    if (!args.actionContext.deadlineAt || Date.now() >= Date.parse(String(args.actionContext.deadlineAt))) throw new OrgAgentWebActionSupersededError();
    const { data: newer, error: newerError } = await admin.from("company_messages").select("id")
      .eq("company_workspace_id", workspaceId).eq("role", "user").in("message_type", ["chat", "slack"])
      .gt("id", args.anchorMessageId).limit(1);
    if (newerError) throw newerError;
    if (newer?.length) throw new OrgAgentWebActionSupersededError();
  };
  await assertCanContinue();
  const context = await buildOrgAgentPromptContext({ admin, user: args.user, conversation: args.conversation,
    beforeMessageId: args.anchorMessageId, currentUserMessageId: args.anchorMessageId, includeSharedConversation: true,
    readAudience: "company_safe", scopeKey: `proactive:${channel.id}` });
  const awareness = await loadCompanyProactiveAwareness({ admin, workspaceId, channelDbId: channel.id,
    roles: context.roles, anchor: args.anchorMessageId });
  const audience: CompanyMessageAudience = { channelDbId: channel.id, channelId: channel.slack_channel_id, jobId: args.jobId };
  let thinkingLogs: OrgAgentThinkingLog[] = [];
  const result = await runOrgAgentToolLoop({ admin, user: args.user, conversation: args.conversation, context,
    actorId: args.user.id, actorLabel: "Harper scheduled recruiter", currentUserMessageId: args.anchorMessageId,
    companyMessageAudience: audience, model: ORG_AGENT_SOL_MODEL, responseLocale: args.responseLocale ?? "auto",
    allowSilentCompletion: true, backgroundOrigin: "scheduled_review", capabilityMode: "full", source: "slack",
    readAudience: "company_safe", scopeKey: `proactive:${channel.id}`, slackThreadId: null, mentions: [],
    userLabel: "Harper-initiated recruiting assignment", userMessage: buildCompanyProactiveReviewPrompt(awareness),
    onToolStatus: (log) => { thinkingLogs = upsertOrgAgentThinkingLog(thinkingLogs, log); },
    assertCanContinue, signal: AbortSignal.timeout(240000) });
  let batch = result.state.companyMessageBatch;
  if (!batch && result.reply.trim()) {
    await assertCanContinue();
    batch = await commitCompanyMessages({ admin, audience, actorId: args.user.id, workspaceId,
      conversationId: args.conversation.id, sourceMessageId: args.anchorMessageId, model: result.model,
      messages: [{ ref: "reply", text: result.reply }] });
  }
  await saveCompanyMessageBatchThinkingLogs({ admin, workspaceId, batch, thinkingLogs });
  if (!batch) return { outcome: "completed_silent" as const, progressMessageId: null, terminalMessageId: null };
  return { outcome: "completed_message" as const, progressMessageId: null, terminalMessageId: batch.messageIds[0], batchId: batch.batchId };
}
