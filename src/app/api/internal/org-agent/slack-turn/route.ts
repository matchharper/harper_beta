import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { runOrgAgentChat } from "@/lib/org/agent/chat";
import type { OrgAgentToolDebugEvent } from "@/lib/org/agent/toolDebug";
import {
  summarizeLlmDebugCalls,
  type LlmDebugSummary,
} from "@/lib/llm/debugUsage";
import {
  decryptHarperSlackToken,
  postHarperSlackMessage,
  setHarperSlackThreadStatus,
  syncHarperSlackThreadContext,
} from "@/lib/org/slackHarper";
import { getSlackOrgAgentModel } from "@/lib/org/agent/modelConfig";
import {
  buildHarperSlackChoiceBlocks,
  formatHarperSlackToolUsage,
  parseHarperSlackChoiceMarkers,
} from "@/lib/org/slackChoiceButtons";
import {
  decideHarperSlackThreadReply,
  type SlackReplyRoutingMessage,
} from "@/lib/org/slackReplyRouter";
import {
  extractSlackRoleMarkerIds,
  extractSlackTalentMarkerIds,
  renderSlackOrgLinks,
  selectSlackTalentLinkTargets,
  type SlackRoleLinkTarget,
  type SlackTalentLinkTarget,
  type SlackTalentRecommendationRow,
} from "@/lib/org/slackTalentLinks";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { getPublicSiteUrlFromRequest } from "@/lib/siteUrl";

export const maxDuration = 180;
export const runtime = "nodejs";

const clean = (value: unknown) => String(value ?? "").trim();

type SlackTurnPhase = "all" | "respond" | "route";
const SLACK_JOB_CANCELLATION_POLL_MS = 500;
const SLACK_JOB_SUPERSEDED_REASON = "superseded_by_new_thread_message";

class SlackReplyJobSupersededError extends Error {
  constructor() {
    super("Slack reply job was superseded by a newer thread message");
    this.name = "SlackReplyJobSupersededError";
  }
}

function elapsedSeconds(startedAt: number) {
  return Math.round(performance.now() - startedAt) / 1_000;
}

function verboseLlmUsagePayload(
  verbose: boolean,
  llmUsage: LlmDebugSummary | null
) {
  return verbose && llmUsage ? { llmUsage } : {};
}

type RecoveredSlackReply = {
  responseMessageId: number;
  responseProposalId: string | null;
  responseText: string;
  slackResponseTs: string | null;
  userMessageId: number;
};

function supersededSlackTurnResponse(startedAt: number) {
  return NextResponse.json({
    ok: true,
    outcome: "superseded",
    phase: "cancelled",
    elapsedSeconds: elapsedSeconds(startedAt),
  });
}

async function assertSlackReplyJobCurrent(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  jobId: string;
}) {
  const { data, error } = await (
    args.admin.from("slack_reply_jobs" as any) as any
  )
    .select("last_error, status")
    .eq("id", args.jobId)
    .single();
  if (error) throw error;
  if (
    clean(data.status) === "ignored" &&
    clean(data.last_error) === SLACK_JOB_SUPERSEDED_REASON
  ) {
    throw new SlackReplyJobSupersededError();
  }
}

function watchSlackReplyJob(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  jobId: string;
}) {
  const controller = new AbortController();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const poll = async () => {
    if (stopped || controller.signal.aborted) return;
    try {
      const { data, error } = await (
        args.admin.from("slack_reply_jobs" as any) as any
      )
        .select("last_error, status")
        .eq("id", args.jobId)
        .single();
      if (error) throw error;
      if (stopped) return;
      if (
        clean(data.status) === "ignored" &&
        clean(data.last_error) === SLACK_JOB_SUPERSEDED_REASON
      ) {
        controller.abort(new SlackReplyJobSupersededError());
        return;
      }
    } catch (error) {
      console.warn("[org-agent/slack-turn:cancellation-watch]", error);
    }
    if (!stopped && !controller.signal.aborted) {
      timer = setTimeout(poll, SLACK_JOB_CANCELLATION_POLL_MS);
    }
  };

  timer = setTimeout(poll, SLACK_JOB_CANCELLATION_POLL_MS);
  return {
    signal: controller.signal,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

async function markSlackReplyJobIgnored(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  jobId: string;
}) {
  const now = new Date().toISOString();
  const { data, error } = await (
    args.admin.from("slack_reply_jobs" as any) as any
  )
    .update({
      completed_at: now,
      last_error: null,
      locked_at: null,
      locked_by: null,
      status: "ignored",
      updated_at: now,
    })
    .eq("id", args.jobId)
    .in("status", ["queued", "processing", "retry"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    await assertSlackReplyJobCurrent(args);
    throw new Error("Slack reply job is no longer active");
  }
}

async function discardSupersededSlackReply(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  jobId: string;
}) {
  const { data: job, error: jobError } = await (
    args.admin.from("slack_reply_jobs" as any) as any
  )
    .select("last_error, status, slack_response_ts")
    .eq("id", args.jobId)
    .maybeSingle();
  if (jobError) throw jobError;
  if (
    !job ||
    clean(job.status) !== "ignored" ||
    clean(job.last_error) !== SLACK_JOB_SUPERSEDED_REASON ||
    job.slack_response_ts
  ) {
    return;
  }

  const { data: messages, error: messagesError } = await (
    args.admin.from("company_messages" as any) as any
  )
    .select("id, conversation_id")
    .eq("role", "assistant")
    .eq("message_type", "slack")
    .is("slack_message_ts", null)
    .contains("metadata", { slackReplyJobId: args.jobId });
  if (messagesError) throw messagesError;

  const { error: clearJobError } = await (
    args.admin.from("slack_reply_jobs" as any) as any
  )
    .update({
      response_message_id: null,
      response_proposal_id: null,
      response_text: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.jobId)
    .eq("status", "ignored")
    .eq("last_error", SLACK_JOB_SUPERSEDED_REASON)
    .is("slack_response_ts", null);
  if (clearJobError) throw clearJobError;

  const { error: proposalError } = await (
    args.admin.from("company_agent_update_proposals" as any) as any
  )
    .delete()
    .eq("status", "draft")
    .contains("message_metadata", { slackReplyJobId: args.jobId });
  if (proposalError) throw proposalError;

  const staleMessages = (messages ?? []) as Array<{
    conversation_id: string;
    id: number;
  }>;
  if (staleMessages.length === 0) return;
  const { error: deleteError } = await (
    args.admin.from("company_messages" as any) as any
  )
    .delete()
    .in(
      "id",
      staleMessages.map((message) => message.id)
    );
  if (deleteError) throw deleteError;

  for (const conversationId of new Set(
    staleMessages.map((message) => message.conversation_id)
  )) {
    const { data: latest, error: latestError } = await (
      args.admin.from("company_messages" as any) as any
    )
      .select("id, created_at")
      .eq("conversation_id", conversationId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    const { error: conversationError } = await (
      args.admin.from("company_conversations" as any) as any
    )
      .update({
        last_message_at: latest?.created_at ?? null,
        last_message_id: latest?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
    if (conversationError) throw conversationError;
  }
}

async function loadSlackOrgLinkTargets(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  message: string;
  preferredRoleId?: string | null;
  workspaceId: string;
}): Promise<{
  roleTargets: SlackRoleLinkTarget[];
  talentTargets: SlackTalentLinkTarget[];
}> {
  const markedRoleIds = new Set(extractSlackRoleMarkerIds(args.message));
  const talentIds = extractSlackTalentMarkerIds(args.message);
  if (markedRoleIds.size === 0 && talentIds.length === 0) {
    return { roleTargets: [], talentTargets: [] };
  }

  const { data: roleData, error: roleError } = await (
    args.admin.from("company_roles" as any) as any
  )
    .select("role_id")
    .eq("company_workspace_id", args.workspaceId)
    .eq("source_type", "internal")
    .not("is_expired", "is", true);
  if (roleError) throw roleError;
  const roleIds = ((roleData ?? []) as Array<{ role_id: string }>).map(
    (row) => row.role_id
  );
  const roleTargets = roleIds
    .filter((roleId) => markedRoleIds.has(roleId.toLowerCase()))
    .map((roleId) => ({ roleId }));
  if (roleIds.length === 0 || talentIds.length === 0) {
    return { roleTargets, talentTargets: [] };
  }

  const { data, error } = await (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select("id, talent_id, role_id, recommended_at")
    .in("talent_id", talentIds)
    .in("role_id", roleIds)
    .order("recommended_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1_000);
  if (error) throw error;

  return {
    roleTargets,
    talentTargets: selectSlackTalentLinkTargets({
      preferredRoleId: args.preferredRoleId,
      rows: (data ?? []).map(
        (row: {
          id: string;
          recommended_at: string;
          role_id: string;
          talent_id: string;
        }): SlackTalentRecommendationRow => ({
          recommendationId: row.id,
          recommendedAt: row.recommended_at,
          roleId: row.role_id,
          talentId: row.talent_id,
        })
      ),
    }),
  };
}

async function loadSlackReplyRoutingMessages(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  messageTs: string;
  prompt: string;
  slackThreadId: string;
  slackUserId: string | null;
}) {
  const { data, error } = await (
    args.admin.from("company_messages" as any) as any
  )
    .select("content, role, slack_message_ts, slack_user_id")
    .eq("slack_thread_id", args.slackThreadId)
    .eq("message_type", "slack")
    .lte("slack_message_ts", args.messageTs)
    .order("slack_message_ts", { ascending: false })
    .limit(10);
  if (error) throw error;

  const rows = (
    (data ?? []) as Array<{
      content: string;
      role: string;
      slack_message_ts: string | null;
      slack_user_id: string | null;
    }>
  ).reverse();
  const messages: SlackReplyRoutingMessage[] = rows.map((row) => ({
    content: clean(row.content),
    role: row.role === "assistant" ? "assistant" : "user",
    slackUserId: clean(row.slack_user_id) || null,
  }));
  if (!rows.some((row) => clean(row.slack_message_ts) === args.messageTs)) {
    messages.push({
      content: args.prompt,
      role: "user",
      slackUserId: args.slackUserId,
    });
  }
  return messages.slice(-10);
}

async function recoverPersistedSlackReply(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  jobId: string;
  messageTs: string;
  slackThreadId: string;
  workspaceId: string;
}): Promise<RecoveredSlackReply | null> {
  const [proposalResult, assistantResult, userResult] = await Promise.all([
    (args.admin.from("company_agent_update_proposals" as any) as any)
      .select(
        "id, presentation_text, created_by_user_message_id, presented_message_id, status"
      )
      .eq("workspace_id", args.workspaceId)
      .eq("slack_thread_id", args.slackThreadId)
      .in("status", ["draft", "pending"])
      .contains("message_metadata", { slackReplyJobId: args.jobId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (args.admin.from("company_messages" as any) as any)
      .select("id, content, slack_message_ts")
      .eq("company_workspace_id", args.workspaceId)
      .eq("slack_thread_id", args.slackThreadId)
      .eq("message_type", "slack")
      .eq("role", "assistant")
      .contains("metadata", { slackReplyJobId: args.jobId })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (args.admin.from("company_messages" as any) as any)
      .select("id")
      .eq("company_workspace_id", args.workspaceId)
      .eq("slack_thread_id", args.slackThreadId)
      .eq("slack_message_ts", args.messageTs)
      .eq("message_type", "slack")
      .eq("role", "user")
      .limit(1)
      .maybeSingle(),
  ]);

  if (proposalResult.error) throw proposalResult.error;
  if (assistantResult.error) throw assistantResult.error;
  if (userResult.error) throw userResult.error;

  const proposal = proposalResult.data as {
    created_by_user_message_id: number | null;
    id: string;
    presentation_text: string | null;
    presented_message_id: number | null;
    status: string;
  } | null;
  const proposalText = clean(proposal?.presentation_text);
  const proposalUserMessageId = Number(
    proposal?.created_by_user_message_id || 0
  );
  if (proposal && proposalText && proposalUserMessageId) {
    const proposalMessage = assistantResult.data as {
      id: number;
      slack_message_ts: string | null;
    } | null;
    return {
      responseMessageId: Number(proposal.presented_message_id || 0),
      responseProposalId: proposal.id,
      responseText: proposalText,
      slackResponseTs:
        proposal.status === "pending" &&
        Number(proposal.presented_message_id || 0) ===
          Number(proposalMessage?.id || 0)
          ? clean(proposalMessage?.slack_message_ts) || null
          : null,
      userMessageId: proposalUserMessageId,
    };
  }

  const assistant = assistantResult.data as {
    content: string;
    id: number;
    slack_message_ts: string | null;
  } | null;
  const userMessageId = Number(userResult.data?.id || 0);
  const assistantText = clean(assistant?.content);
  if (assistant && assistantText && userMessageId) {
    return {
      responseMessageId: Number(assistant.id),
      responseProposalId: null,
      responseText: assistantText,
      slackResponseTs: clean(assistant.slack_message_ts) || null,
      userMessageId,
    };
  }
  return null;
}

async function loadPersistedSlackToolUsage(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  responseMessageId: number;
  responseProposalId: string | null;
  workspaceId: string;
}) {
  if (args.responseProposalId) {
    const { data, error } = await (
      args.admin.from("company_agent_update_proposals" as any) as any
    )
      .select("message_metadata")
      .eq("id", args.responseProposalId)
      .eq("workspace_id", args.workspaceId)
      .maybeSingle();
    if (error) throw error;
    return formatHarperSlackToolUsage(data?.message_metadata);
  }
  if (!args.responseMessageId) return null;
  const { data, error } = await (
    args.admin.from("company_messages" as any) as any
  )
    .select("metadata")
    .eq("id", args.responseMessageId)
    .eq("company_workspace_id", args.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return formatHarperSlackToolUsage(data?.metadata);
}

export async function POST(req: NextRequest) {
  const requestStartedAt = performance.now();
  const toolCalls: OrgAgentToolDebugEvent[] = [];
  let llmUsage: LlmDebugSummary | null = null;
  let verbose = false;
  let pendingSlackStatus: {
    channelId: string;
    threadTs: string;
    token: string;
  } | null = null;
  let slackTurnSignal: AbortSignal | null = null;
  let stopSlackJobWatch: (() => void) | null = null;
  let activeAdmin: ReturnType<typeof getSupabaseAdmin> | null = null;
  let activeJobId = "";

  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json().catch(() => ({}))) as {
      jobId?: string;
      phase?: string;
      verbose?: boolean;
    };
    verbose = body.verbose === true;
    const jobId = clean(body.jobId);
    const phase = (clean(body.phase) || "all") as SlackTurnPhase;
    if (!jobId)
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    if (phase !== "all" && phase !== "route" && phase !== "respond") {
      return NextResponse.json(
        { error: "phase must be all, route, or respond" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    activeAdmin = admin;
    const { data: job, error: jobError } = await (
      admin.from("slack_reply_jobs" as any) as any
    )
      .select("*")
      .eq("id", jobId)
      .single();
    if (jobError) throw jobError;
    activeJobId = clean(job.id);
    if (
      job.status === "ignored" &&
      clean(job.last_error) === SLACK_JOB_SUPERSEDED_REASON
    ) {
      await discardSupersededSlackReply({ admin, jobId: job.id });
      return supersededSlackTurnResponse(requestStartedAt);
    }
    if (job.status === "completed") {
      if (phase === "route") {
        return NextResponse.json({
          ok: true,
          outcome: "respond",
          phase: "routing",
          routingDecision: "respond",
          routingElapsedSeconds: elapsedSeconds(requestStartedAt),
          routingMode: "completed_job",
        });
      }
      if (phase === "respond") {
        return NextResponse.json({
          duplicate: true,
          ok: true,
          outcome: "completed",
          phase: "reply",
          replyElapsedSeconds: elapsedSeconds(requestStartedAt),
          ...(verbose && { toolCalls }),
        });
      }
      return NextResponse.json({ duplicate: true, ok: true });
    }
    if (job.status === "ignored") {
      if (phase === "route") {
        return NextResponse.json({
          ok: true,
          outcome: "ignored",
          phase: "routing",
          routingDecision: "ignore",
          routingElapsedSeconds: elapsedSeconds(requestStartedAt),
          routingMode: "completed_job",
        });
      }
      if (phase === "respond") {
        return NextResponse.json({
          duplicate: true,
          ok: true,
          outcome: "ignored",
          phase: "reply",
          replyElapsedSeconds: elapsedSeconds(requestStartedAt),
          ...(verbose && { toolCalls }),
        });
      }
      return NextResponse.json({ duplicate: true, ok: true });
    }

    const jobWatch = watchSlackReplyJob({ admin, jobId: job.id });
    slackTurnSignal = jobWatch.signal;
    stopSlackJobWatch = jobWatch.stop;

    const hasCachedJobResponse = Boolean(
      clean(job.response_text) &&
      (Number(job.response_message_id || 0) || clean(job.response_proposal_id))
    );
    const isFreshRoutingPhase =
      phase === "route" &&
      Number(job.attempt_count || 0) <= 1 &&
      !hasCachedJobResponse;
    if (isFreshRoutingPhase) {
      const messageTs = clean(job.slack_message_ts);
      const prompt = clean(job.prompt);
      const slackThreadId = clean(job.thread_id);
      const slackUserId = clean(job.slack_user_id) || null;
      if (!messageTs || !prompt || !slackThreadId) {
        throw new Error("Slack reply job payload is invalid");
      }

      let routingDecision: "ignore" | "respond" | "uncertain" = "respond";
      let routingMode = "mention_bypass";
      if (clean(job.trigger_kind) === "thread_reply") {
        const routingMessages = await loadSlackReplyRoutingMessages({
          admin,
          messageTs,
          prompt,
          slackThreadId,
          slackUserId,
        });
        routingDecision = await decideHarperSlackThreadReply(routingMessages, {
          onDebugCall: verbose
            ? (call) => {
                llmUsage = summarizeLlmDebugCalls([call]);
                console.info("[org-agent/slack-turn:llm]", {
                  jobId: job.id,
                  ...llmUsage,
                });
              }
            : undefined,
          signal: slackTurnSignal,
        });
        routingMode = "model";
      }
      slackTurnSignal.throwIfAborted();
      await assertSlackReplyJobCurrent({ admin, jobId: job.id });

      const routingElapsedSeconds = elapsedSeconds(requestStartedAt);
      if (routingDecision !== "respond") {
        await markSlackReplyJobIgnored({ admin, jobId: job.id });
        return NextResponse.json({
          ignored: true,
          ok: true,
          outcome: "ignored",
          phase: "routing",
          routingDecision,
          routingElapsedSeconds,
          routingMode,
          ...verboseLlmUsagePayload(verbose, llmUsage),
        });
      }
      return NextResponse.json({
        ok: true,
        outcome: "respond",
        phase: "routing",
        routingDecision,
        routingElapsedSeconds,
        routingMode,
        ...verboseLlmUsagePayload(verbose, llmUsage),
      });
    }

    const { data: thread, error: threadError } = await (
      admin.from("company_slack_threads" as any) as any
    )
      .select("*")
      .eq("id", job.thread_id)
      .single();
    if (threadError) throw threadError;

    const { data: channel, error: channelError } = await (
      admin.from("company_slack_channels" as any) as any
    )
      .select("*")
      .eq("id", thread.channel_id)
      .eq("is_enabled", true)
      .single();
    if (channelError) throw channelError;

    const { data: integration, error: integrationError } = await (
      admin.from("company_slack_integrations" as any) as any
    )
      .select("*")
      .eq("company_workspace_id", channel.company_workspace_id)
      .eq("status", "active")
      .single();
    if (integrationError) throw integrationError;

    const channelId = clean(channel.slack_channel_id);
    const messageTs = clean(job.slack_message_ts);
    const prompt = clean(job.prompt);
    const batchedPrompt = clean(job.batched_prompt) || prompt;
    const isButtonChoice = clean(job.trigger_kind) === "button_choice";
    const slackUserId = clean(job.slack_user_id) || null;
    const teamId = clean(integration.slack_team_id);
    const threadTs = clean(thread.slack_thread_ts);
    const token = decryptHarperSlackToken(integration.bot_token_ciphertext);
    if (!channelId || !messageTs || !prompt || !teamId || !threadTs)
      throw new Error("Slack reply job payload is invalid");

    let responseText = clean(job.response_text);
    let responseMessageId = Number(job.response_message_id || 0);
    let responseProposalId = clean(job.response_proposal_id) || null;
    const recovered = await recoverPersistedSlackReply({
      admin,
      jobId: job.id,
      messageTs,
      slackThreadId: thread.id,
      workspaceId: channel.company_workspace_id,
    });
    let slackResponseTs =
      clean(job.slack_response_ts) || recovered?.slackResponseTs || null;

    if (phase !== "respond") {
      let routingDecision: "ignore" | "respond" | "uncertain" = "respond";
      let routingMode = "mention_bypass";
      const hasPersistedResponse = Boolean(
        responseText && (responseMessageId || responseProposalId)
      );
      if (recovered || hasPersistedResponse) {
        routingMode = "persisted_response";
      } else if (clean(job.trigger_kind) === "thread_reply") {
        const routingMessages = await loadSlackReplyRoutingMessages({
          admin,
          messageTs,
          prompt,
          slackThreadId: thread.id,
          slackUserId,
        });
        routingDecision = await decideHarperSlackThreadReply(routingMessages, {
          onDebugCall: verbose
            ? (call) => {
                llmUsage = summarizeLlmDebugCalls([call]);
                console.info("[org-agent/slack-turn:llm]", {
                  jobId: job.id,
                  ...llmUsage,
                });
              }
            : undefined,
          signal: slackTurnSignal,
        });
        routingMode = "model";
      }
      slackTurnSignal.throwIfAborted();
      await assertSlackReplyJobCurrent({ admin, jobId: job.id });

      const routingElapsedSeconds = elapsedSeconds(requestStartedAt);
      if (routingDecision !== "respond") {
        await markSlackReplyJobIgnored({ admin, jobId: job.id });
        return NextResponse.json({
          ignored: true,
          ok: true,
          outcome: "ignored",
          phase: "routing",
          routingDecision,
          routingElapsedSeconds,
          routingMode,
          ...verboseLlmUsagePayload(verbose, llmUsage),
        });
      }
      if (phase === "route") {
        return NextResponse.json({
          ok: true,
          outcome: "respond",
          phase: "routing",
          routingDecision,
          routingElapsedSeconds,
          routingMode,
          ...verboseLlmUsagePayload(verbose, llmUsage),
        });
      }
    }

    if (!responseText || (!responseMessageId && !responseProposalId)) {
      let userMessageId = Number(job.user_message_id || 0);
      if (recovered) {
        responseText = recovered.responseText;
        responseMessageId = recovered.responseMessageId;
        responseProposalId = recovered.responseProposalId;
        userMessageId = recovered.userMessageId;
      } else {
        try {
          await setHarperSlackThreadStatus({
            channelId,
            status: "답변을 작성 중입니다…",
            threadTs,
            token,
          });
          pendingSlackStatus = { channelId, threadTs, token };
        } catch (error) {
          // A loading-state failure must not block the company-side LLM reply.
          console.warn("[org-agent/slack-turn:set-status]", error);
        }

        let actorUserId = clean(integration.installed_by_user_id);
        if (!actorUserId) {
          const { data: member, error } = await (
            admin.from("company_user_workspace" as any) as any
          )
            .select("company_user_id")
            .eq("company_workspace_id", channel.company_workspace_id)
            .in("role", ["owner", "admin", "member"])
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          actorUserId = clean(member?.company_user_id);
        }
        if (!actorUserId)
          throw new Error("Slack installation has no service actor");
        const { data: authData, error: authError } =
          await admin.auth.admin.getUserById(actorUserId);
        if (authError || !authData.user)
          throw authError || new Error("Service actor not found");

        let slackUserName: string | null = null;
        let historyTruncated = false;
        try {
          const synced = await syncHarperSlackThreadContext({
            botUserId: clean(integration.slack_bot_user_id),
            channelId,
            currentMessageTs: messageTs,
            currentSlackUserId: slackUserId,
            scopes: integration.scopes,
            threadId: thread.id,
            threadTs,
            token,
            workspaceId: channel.company_workspace_id,
          });
          slackUserName = synced.currentSlackUserName;
          historyTruncated = synced.historyTruncated;
        } catch (error) {
          // A Slack history/rate-limit failure should not make the mention
          // unusable. Stored Events API messages remain available as context.
          console.warn("[org-agent/slack-turn:thread-sync]", error);
        }

        const result = await runOrgAgentChat({
          assistantMessageMetadata: {
            slackReplyJobId: job.id,
            source: "org_agent_slack",
          },
          debug: verbose,
          emit: verbose
            ? (event, data) => {
                if (event === "tool_debug") {
                  const toolCall = data as OrgAgentToolDebugEvent;
                  toolCalls.push(toolCall);
                  console.info("[org-agent/slack-turn:tool]", {
                    jobId: job.id,
                    ...toolCall,
                  });
                } else if (event === "llm_debug") {
                  llmUsage = data as LlmDebugSummary;
                  console.info("[org-agent/slack-turn:llm]", {
                    jobId: job.id,
                    ...llmUsage,
                  });
                }
              }
            : undefined,
          mentions: [],
          llmUserMessage: batchedPrompt,
          message: prompt,
          messageType: "slack",
          messageUserId: null,
          model: getSlackOrgAgentModel(),
          slackAssistantUserId: integration.slack_bot_user_id,
          slackThreadId: thread.id,
          slackUserId,
          slackUserMessageTs: messageTs,
          signal: slackTurnSignal,
          user: authData.user,
          userMessageMetadata: {
            historyTruncated,
            slackUserName,
            source: isButtonChoice
              ? "org_agent_slack_button_choice"
              : "org_agent_slack_user",
            ...(isButtonChoice && clean(job.choice_source_job_id)
              ? { slackChoiceSourceJobId: clean(job.choice_source_job_id) }
              : {}),
          },
          workspaceId: channel.company_workspace_id,
        });
        slackTurnSignal.throwIfAborted();
        await assertSlackReplyJobCurrent({ admin, jobId: job.id });
        if (result.kind === "slack_proposal_draft") {
          responseText = result.presentationText;
          responseProposalId = result.proposalId;
          responseMessageId = 0;
        } else {
          responseText = result.assistantMessage.content;
          responseMessageId = result.assistantMessage.id;
          responseProposalId = null;
        }
        userMessageId = result.userMessage.id;
      }
      const { data: cachedJob, error: cacheError } = await (
        admin.from("slack_reply_jobs" as any) as any
      )
        .update({
          response_message_id: responseMessageId || null,
          response_proposal_id: responseProposalId,
          response_text: responseText,
          updated_at: new Date().toISOString(),
          user_message_id: userMessageId,
        })
        .eq("id", job.id)
        .in("status", ["queued", "processing", "retry"])
        .select("id")
        .maybeSingle();
      if (cacheError) throw cacheError;
      if (!cachedJob) {
        await assertSlackReplyJobCurrent({ admin, jobId: job.id });
        throw new Error("Slack reply job is no longer active");
      }
    }

    // response_text is the generation cutoff used by the enqueue RPC. Once it
    // is cached, a later Slack message starts a separate turn.
    slackTurnSignal.throwIfAborted();
    await assertSlackReplyJobCurrent({ admin, jobId: job.id });
    stopSlackJobWatch?.();
    stopSlackJobWatch = null;

    if (!slackResponseTs) {
      const parsedSlackResponse = parseHarperSlackChoiceMarkers(responseText);
      let toolUsageText: string | null = null;
      try {
        toolUsageText = await loadPersistedSlackToolUsage({
          admin,
          responseMessageId,
          responseProposalId,
          workspaceId: channel.company_workspace_id,
        });
      } catch (error) {
        // Debug context must never block the actual Slack reply.
        console.warn("[org-agent/slack-turn:tool-usage]", error);
      }
      let slackResponseText: string;
      try {
        const targets = await loadSlackOrgLinkTargets({
          admin,
          message: parsedSlackResponse.text,
          preferredRoleId: clean(thread.role_id) || null,
          workspaceId: channel.company_workspace_id,
        });
        slackResponseText = renderSlackOrgLinks({
          message: parsedSlackResponse.text,
          publicSiteUrl: getPublicSiteUrlFromRequest(req),
          ...targets,
          workspaceId: channel.company_workspace_id,
        });
      } catch (error) {
        // A dynamic-link lookup failure must not block the company-side LLM
        // reply or expose private role or talent markers in Slack.
        console.warn("[org-agent/slack-turn:org-links]", error);
        slackResponseText = renderSlackOrgLinks({
          message: parsedSlackResponse.text,
          publicSiteUrl: getPublicSiteUrlFromRequest(req),
          roleTargets: [],
          talentTargets: [],
          workspaceId: channel.company_workspace_id,
        });
      }
      const deliveredSlackText = slackResponseText || "선택해 주세요.";
      const slackBlocks = buildHarperSlackChoiceBlocks({
        choices: parsedSlackResponse.choices,
        sourceJobId: job.id,
        text: deliveredSlackText,
        toolUsageText,
      });
      const posted = await postHarperSlackMessage({
        ...(parsedSlackResponse.choices.length > 0 || toolUsageText
          ? { blocks: slackBlocks }
          : {}),
        channelId,
        clientMessageId: job.id,
        text: deliveredSlackText,
        threadTs,
        token,
      });
      slackResponseTs = clean(posted.ts);
      // Slack automatically clears the thread status after the app replies.
      pendingSlackStatus = null;
    }
    if (!slackResponseTs) throw new Error("Slack response has no timestamp");
    const now = new Date().toISOString();
    if (responseProposalId) {
      const { data: activatedData, error: activatedError } = await (
        admin.rpc as any
      )("activate_slack_company_agent_update_proposal_v1", {
        p_proposal_id: responseProposalId,
        p_slack_bot_user_id: clean(integration.slack_bot_user_id),
        p_slack_message_ts: slackResponseTs,
      });
      if (activatedError) throw activatedError;
      const activated =
        activatedData && typeof activatedData === "object"
          ? (activatedData as Record<string, unknown>)
          : {};
      if (clean(activated.status) !== "pending") {
        throw new Error(
          `Slack proposal activation failed: ${clean(activated.status) || "unknown"}`
        );
      }
      responseMessageId = Number(activated.presented_message_id || 0);
      if (!responseMessageId) {
        throw new Error("Activated Slack proposal has no assistant message");
      }
    }
    if (!responseProposalId) {
      const { data: finalizedData, error: finalizedError } = await (
        admin.rpc as any
      )("finalize_slack_company_agent_reply_v1", {
        p_job_id: job.id,
        p_slack_bot_user_id: clean(integration.slack_bot_user_id),
        p_slack_message_ts: slackResponseTs,
      });
      if (finalizedError) throw finalizedError;
      const finalized =
        finalizedData && typeof finalizedData === "object"
          ? (finalizedData as Record<string, unknown>)
          : {};
      if (clean(finalized.status) !== "completed") {
        throw new Error(
          `Slack reply finalization failed: ${clean(finalized.status) || "unknown"}`
        );
      }
      responseMessageId = Number(finalized.response_message_id || 0);
      if (!responseMessageId) {
        throw new Error("Finalized Slack reply has no assistant message");
      }
      return NextResponse.json({
        ok: true,
        outcome: "completed",
        phase: "reply",
        replyElapsedSeconds: elapsedSeconds(requestStartedAt),
        ...(verbose && { toolCalls }),
        ...verboseLlmUsagePayload(verbose, llmUsage),
      });
    }
    const { error: threadUpdateError } = await (
      admin.from("company_slack_threads" as any) as any
    )
      .update({
        created_by_harper: true,
        updated_at: now,
      })
      .eq("id", thread.id);
    if (threadUpdateError) throw threadUpdateError;

    // Mark the job completed last. If the worker dies before this update, the
    // persisted message timestamp above lets the retry skip chat.postMessage.
    const { error: completionError } = await (
      admin.from("slack_reply_jobs" as any) as any
    )
      .update({
        completed_at: now,
        locked_at: null,
        locked_by: null,
        slack_response_ts: slackResponseTs,
        response_message_id: responseMessageId,
        status: "completed",
        updated_at: now,
      })
      .eq("id", job.id);
    if (completionError) throw completionError;
    return NextResponse.json({
      ok: true,
      outcome: "completed",
      phase: "reply",
      replyElapsedSeconds: elapsedSeconds(requestStartedAt),
      ...(verbose && { toolCalls }),
      ...verboseLlmUsagePayload(verbose, llmUsage),
    });
  } catch (error) {
    if (pendingSlackStatus) {
      await setHarperSlackThreadStatus({
        ...pendingSlackStatus,
        status: "",
      }).catch((statusError) =>
        console.warn("[org-agent/slack-turn:clear-status]", statusError)
      );
    }
    if (
      error instanceof SlackReplyJobSupersededError ||
      slackTurnSignal?.aborted
    ) {
      if (activeAdmin && activeJobId) {
        await discardSupersededSlackReply({
          admin: activeAdmin,
          jobId: activeJobId,
        }).catch((discardError) =>
          console.warn(
            "[org-agent/slack-turn:discard-superseded]",
            discardError
          )
        );
      }
      return supersededSlackTurnResponse(requestStartedAt);
    }
    console.error("[org-agent/slack-turn]", error);
    return toInternalApiErrorResponse(error, "Failed to run Slack agent turn");
  } finally {
    stopSlackJobWatch?.();
  }
}
