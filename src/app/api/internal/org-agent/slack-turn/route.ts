import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { runOrgAgentChat } from "@/lib/org/agent/chat";
import { runOrgRoleCreationChat } from "@/lib/org/agent/roleCreationChat";
import { confirmRoleCreationChoice } from "@/lib/org/agent/roleCreationConfirmation";
import {
  appendMissingInProgressSlackRoleLinks,
  resolveDraftRoleCreationForSlackThread,
} from "@/lib/org/agent/slackRoleCreation";
import {
  findOrgAgentSlackUserMessage,
  toOrgAgentMessage,
  type OrgAgentMessageRow,
} from "@/lib/org/agent/store";
import type { OrgAgentToolDebugEvent } from "@/lib/org/agent/toolDebug";
import type { OrgAgentMessageMetadata } from "@/lib/org/agent/types";
import type { ChatAttachmentPayload } from "@/types/chat";
import { renderOrgAgentCompanyInfoSlackLink } from "@/lib/org/agent/companyInfoMarker";
import {
  summarizeLlmDebugCalls,
  type LlmDebugSummary,
} from "@/lib/llm/debugUsage";
import {
  decryptHarperSlackToken,
  getHarperSlackFileInfo,
  postHarperSlackMessage,
  setHarperSlackThreadStatus,
  syncHarperSlackThreadContext,
} from "@/lib/org/slackHarper";
import {
  buildHarperSlackFileLlmMessage,
  extractHarperSlackFileAttachments,
  mergeHarperSlackFiles,
  needsHarperSlackFileInfo,
  parseQueuedHarperSlackFiles,
  type HarperSlackFile,
} from "@/lib/org/slackFiles";
import {
  getSlackOrgAgentModel,
  type OrgAgentModelId,
} from "@/lib/org/agent/modelConfig";
import {
  buildHarperSlackChoiceBlocks,
  parseHarperSlackChoiceMarkers,
} from "@/lib/org/slackChoiceButtons";
import {
  decideHarperSlackThreadReply,
  shouldRespondToSchedulingThreadReply,
  type SlackReplyRoutingMessage,
} from "@/lib/org/slackReplyRouter";
import {
  postHarperSlackAccessDenied,
  resolveHarperSlackWorkspaceAccess,
} from "@/lib/org/slackMemberAccess";
import {
  extractSlackRoleMarkerIds,
  extractSlackTalentMarkerIds,
  renderSlackOrgLinks,
  selectSlackTalentLinkTargets,
  buildSlackWorkspacePageUrl,
  type SlackRoleLinkTarget,
  type SlackTalentLinkTarget,
  type SlackTalentRecommendationRow,
} from "@/lib/org/slackTalentLinks";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { getPublicSiteUrlFromRequest } from "@/lib/siteUrl";
import { COMPANY_TALENT_REQUEST_BLOCKING_STATUSES } from "@/lib/companyTalentRequests/server";
import { convertMarkdownLinksToSlackMrkdwn } from "@/lib/org/slackMessages";

export const maxDuration = 300;
export const runtime = "nodejs";

const clean = (value: unknown) => String(value ?? "").trim();

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

async function hasActiveCandidateWorkflowInSlackThread(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  slackThreadId: string;
  workspaceId: string;
}) {
  const { data: messages, error: messageError } = await (
    args.admin.from("company_messages" as any) as any
  )
    .select("metadata")
    .eq("company_workspace_id", args.workspaceId)
    .eq("message_type", "slack")
    .eq("role", "assistant")
    .eq("slack_thread_id", args.slackThreadId)
    .order("id", { ascending: false })
    .limit(25);
  if (messageError) throw messageError;

  const metadataRows = (messages ?? []).map((message: any) =>
    object(message.metadata)
  );
  const latestConfirmations = metadataRows[0]?.candidateConnectionConfirmations;
  if (Array.isArray(latestConfirmations) && latestConfirmations.length > 0) {
    return true;
  }

  const contactIds = Array.from(
    new Set(
      metadataRows
        .map((metadata: Record<string, any>) =>
          clean(object(metadata.contactDraftRef).contactId)
        )
        .filter(Boolean)
    )
  );
  if (contactIds.length === 0) return false;

  const { data: activeContacts, error: activeContactError } = await (
    args.admin.from("company_talent_requests" as any) as any
  )
    .select("id")
    .eq("company_workspace_id", args.workspaceId)
    .in("id", contactIds)
    .in("workflow_status", [...COMPANY_TALENT_REQUEST_BLOCKING_STATUSES])
    .limit(1);
  if (activeContactError) throw activeContactError;
  return Boolean(activeContacts?.length);
}

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
  lastError?: string | null;
}) {
  const now = new Date().toISOString();
  const { data, error } = await (
    args.admin.from("slack_reply_jobs" as any) as any
  )
    .update({
      completed_at: now,
      last_error: args.lastError ?? null,
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
  let slackStatusUpdateChain: Promise<void> = Promise.resolve();

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
    let isRoleCreationBootstrap = clean(job.slack_event_id).startsWith(
      "role_creation_bootstrap:"
    );
    let roleCreationBootstrapMessageMetadata: Record<string, unknown> | null =
      null;
    const slackUserId = clean(job.slack_user_id) || null;
    const teamId = clean(integration.slack_team_id);
    const threadTs = clean(thread.slack_thread_ts);
    const token = decryptHarperSlackToken(integration.bot_token_ciphertext);
    if (
      !channelId ||
      !messageTs ||
      !prompt ||
      !slackUserId ||
      !teamId ||
      !threadTs
    )
      throw new Error("Slack reply job payload is invalid");
    const draftRoleCreation = await resolveDraftRoleCreationForSlackThread({
      admin,
      slackThreadId: thread.id,
      workspaceId: channel.company_workspace_id,
    });

    if (draftRoleCreation) {
      let bootstrapMessageQuery = (admin.from("company_messages" as any) as any)
        .select("content, metadata")
        .eq("company_workspace_id", channel.company_workspace_id)
        .eq("message_type", "slack")
        .eq("role", "user")
        .eq("slack_thread_id", thread.id);
      if (isRoleCreationBootstrap) {
        bootstrapMessageQuery = bootstrapMessageQuery.eq(
          "slack_message_ts",
          messageTs
        );
      } else if (batchedPrompt !== prompt) {
        bootstrapMessageQuery = bootstrapMessageQuery
          .contains("metadata", {
            slackRoleCreationBootstrap: { isCurrent: true },
          })
          .order("id", { ascending: false })
          .limit(1);
      } else {
        bootstrapMessageQuery = null;
      }
      if (bootstrapMessageQuery) {
        const { data: bootstrapMessage, error: bootstrapMessageError } =
          await bootstrapMessageQuery.maybeSingle();
        if (bootstrapMessageError) throw bootstrapMessageError;
        const bootstrapMetadata = object(bootstrapMessage?.metadata);
        const bootstrapMarker = object(
          bootstrapMetadata.slackRoleCreationBootstrap
        );
        const bootstrapContent = clean(bootstrapMessage?.content);
        const isCoalescedBootstrap =
          !isRoleCreationBootstrap &&
          bootstrapMarker.isCurrent === true &&
          Boolean(bootstrapContent) &&
          (batchedPrompt === bootstrapContent ||
            batchedPrompt.startsWith(`${bootstrapContent}\n\n`));
        if (isRoleCreationBootstrap || isCoalescedBootstrap) {
          isRoleCreationBootstrap = true;
          roleCreationBootstrapMessageMetadata = bootstrapMetadata;
        }
      }
    }

    const shouldPrimeDirectMentionStatus =
      phase === "respond" &&
      clean(job.trigger_kind) === "mention" &&
      !clean(job.response_text) &&
      !Number(job.response_message_id || 0) &&
      !clean(job.response_proposal_id) &&
      !clean(job.slack_response_ts);
    if (shouldPrimeDirectMentionStatus) {
      try {
        await setHarperSlackThreadStatus({
          channelId,
          status: draftRoleCreation
            ? "역할 정보를 정리 중입니다…"
            : "답변 작성 중",
          threadTs,
          token,
        });
        pendingSlackStatus = { channelId, threadTs, token };
      } catch (error) {
        // A loading-state failure must not block the company-side LLM reply.
        console.warn("[org-agent/slack-turn:set-early-mention-status]", error);
      }
    }

    const slackAccess = await resolveHarperSlackWorkspaceAccess({
      slackUserId,
      token,
      workspaceId: channel.company_workspace_id,
    });
    if (!slackAccess.allowed || !slackAccess.member.canManageCandidates) {
      if (pendingSlackStatus) {
        await setHarperSlackThreadStatus({
          ...pendingSlackStatus,
          status: "",
        }).catch((statusError) =>
          console.warn(
            "[org-agent/slack-turn:clear-access-denied-status]",
            statusError
          )
        );
        pendingSlackStatus = null;
      }
      const denialReason = slackAccess.allowed
        ? "insufficient_role"
        : slackAccess.reason;
      try {
        await postHarperSlackAccessDenied({
          access: slackAccess,
          channelId,
          reason: denialReason,
          slackUserId,
          token,
        });
      } catch (error) {
        // Authorization remains fail-closed even if Slack cannot deliver the
        // best-effort private explanation.
        console.warn("[org-agent/slack-turn:access-denied-message]", error);
      }
      await markSlackReplyJobIgnored({
        admin,
        jobId: job.id,
        lastError: `slack_access_denied:${denialReason}`,
      });
      if (phase === "respond") {
        return NextResponse.json({
          accessDenied: true,
          ok: true,
          outcome: "completed",
          phase: "reply",
          replyElapsedSeconds: elapsedSeconds(requestStartedAt),
        });
      }
      return NextResponse.json({
        accessDenied: true,
        ignored: true,
        ok: true,
        outcome: "ignored",
        phase: "routing",
        routingDecision: "ignore",
        routingElapsedSeconds: elapsedSeconds(requestStartedAt),
        routingMode: "workspace_membership",
      });
    }

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
      } else if (draftRoleCreation) {
        routingMode = "role_creation_thread_bypass";
      } else if (clean(job.trigger_kind) === "thread_reply") {
        const activeCandidateWorkflow =
          await hasActiveCandidateWorkflowInSlackThread({
            admin,
            slackThreadId: thread.id,
            workspaceId: channel.company_workspace_id,
          });
        if (activeCandidateWorkflow) {
          routingMode = "candidate_workflow_bypass";
        } else {
          const routingMessages = await loadSlackReplyRoutingMessages({
            admin,
            messageTs,
            prompt,
            slackThreadId: thread.id,
            slackUserId,
          });
          if (shouldRespondToSchedulingThreadReply(routingMessages)) {
            routingMode = "scheduling_thread_bypass";
          } else {
            routingDecision = await decideHarperSlackThreadReply(
              routingMessages,
              {
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
              }
            );
            routingMode = "model";
          }
        }
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
        if (!pendingSlackStatus) {
          try {
            await setHarperSlackThreadStatus({
              channelId,
              status: isRoleCreationBootstrap
                ? "역할 정보를 정리 중입니다…"
                : "답변 작성 중",
              threadTs,
              token,
            });
            pendingSlackStatus = { channelId, threadTs, token };
          } catch (error) {
            // A loading-state failure must not block the company-side LLM reply.
            console.warn("[org-agent/slack-turn:set-status]", error);
          }
        }

        const actorUserId = slackAccess.member.companyUserId;
        if (!actorUserId)
          throw new Error("Slack caller has no Harper member account");
        const { data: authData, error: authError } =
          await admin.auth.admin.getUserById(actorUserId);
        if (authError || !authData.user)
          throw authError || new Error("Slack caller account not found");

        let slackUserName: string | null = null;
        let historyTruncated = false;
        let bootstrapAttachments: ChatAttachmentPayload[] = [];
        let bootstrapFileErrors: string[] = [];
        let bootstrapMarkerMetadata:
          | NonNullable<OrgAgentMessageMetadata["slackRoleCreationBootstrap"]>
          | undefined;
        let isSyntheticBootstrapMessage = false;
        if (isRoleCreationBootstrap && draftRoleCreation) {
          const bootstrapMetadata = object(
            roleCreationBootstrapMessageMetadata
          );
          const bootstrapMarker = object(
            bootstrapMetadata.slackRoleCreationBootstrap
          );
          isSyntheticBootstrapMessage = bootstrapMarker.isCurrent === true;
          if (isSyntheticBootstrapMessage) {
            const sourceMessageId = Number(bootstrapMarker.sourceMessageId);
            const contextMessageCount = Number(
              bootstrapMarker.contextMessageCount
            );
            if (
              Number.isSafeInteger(sourceMessageId) &&
              sourceMessageId > 0 &&
              Number.isSafeInteger(contextMessageCount) &&
              contextMessageCount > 0 &&
              clean(bootstrapMarker.sourceKey) &&
              clean(bootstrapMarker.sourceSlackThreadId)
            ) {
              bootstrapMarkerMetadata = {
                contextMessageCount,
                isCurrent: true,
                sourceKey: clean(bootstrapMarker.sourceKey),
                sourceMessageId,
                sourceSlackThreadId: clean(bootstrapMarker.sourceSlackThreadId),
              };
            }
            bootstrapAttachments = Array.isArray(
              bootstrapMetadata.roleCreationAttachments
            )
              ? (bootstrapMetadata.roleCreationAttachments as ChatAttachmentPayload[])
              : [];
            bootstrapFileErrors = Array.isArray(
              bootstrapMetadata.slackFileErrors
            )
              ? bootstrapMetadata.slackFileErrors
                  .map(clean)
                  .filter(Boolean)
                  .slice(0, 10)
              : [];
          }
        }
        let pendingUserFiles: HarperSlackFile[] = parseQueuedHarperSlackFiles(
          job.batched_slack_files ?? job.slack_files
        );
        try {
          const synced = await syncHarperSlackThreadContext({
            botUserId: clean(integration.slack_bot_user_id),
            channelId,
            currentMessageTs: messageTs,
            currentSlackUserId: slackUserId,
            roleId: draftRoleCreation?.roleId || clean(thread.role_id) || null,
            scopes: integration.scopes,
            threadId: thread.id,
            threadTs,
            token,
            workspaceId: channel.company_workspace_id,
          });
          slackUserName = synced.currentSlackUserName;
          historyTruncated = synced.historyTruncated;
          pendingUserFiles.push(...synced.pendingUserFiles);
        } catch (error) {
          // A Slack history/rate-limit failure should not make the mention
          // unusable. Stored Events API messages remain available as context.
          console.warn("[org-agent/slack-turn:thread-sync]", error);
        }

        const slackFileErrors: string[] = [];
        let slackFileAttachments: Awaited<
          ReturnType<typeof extractHarperSlackFileAttachments>
        >["attachments"] = bootstrapAttachments;
        slackFileErrors.push(...bootstrapFileErrors);
        if (pendingUserFiles.length > 0) {
          pendingUserFiles = mergeHarperSlackFiles(pendingUserFiles);
          const grantedScopes = Array.isArray(integration.scopes)
            ? integration.scopes.map(clean)
            : [];
          if (!grantedScopes.includes("files:read")) {
            slackFileErrors.push(
              "Slack 파일을 읽을 권한이 없어요. Workspace 관리자가 Harper Slack 앱을 다시 연결해 주세요."
            );
          } else {
            const resolvedFiles: HarperSlackFile[] = [];
            for (const file of pendingUserFiles) {
              if (!needsHarperSlackFileInfo(file)) {
                resolvedFiles.push(file);
                continue;
              }
              const fileId = clean(file.id);
              if (!fileId) {
                slackFileErrors.push(
                  `${clean(file.name || file.title) || "Slack 파일"}: 파일 정보를 확인하지 못했어요.`
                );
                continue;
              }
              try {
                resolvedFiles.push(
                  await getHarperSlackFileInfo({ fileId, token })
                );
              } catch (error) {
                slackFileErrors.push(
                  `${clean(file.name || file.title || fileId)}: ${error instanceof Error ? error.message : "파일 정보를 확인하지 못했어요."}`
                );
              }
            }
            const extracted = await extractHarperSlackFileAttachments({
              files: resolvedFiles,
              token,
            });
            slackFileAttachments = extracted.attachments;
            slackFileErrors.push(...extracted.errors);
          }
        }

        const sharedMessageMetadata: OrgAgentMessageMetadata = {
          ...(slackFileAttachments.length > 0
            ? {
                attachments: slackFileAttachments.map((attachment) => ({
                  kind: attachment.kind,
                  mime: attachment.mime,
                  name: attachment.name,
                  size: attachment.size,
                  truncated: attachment.truncated,
                })),
                slackFileAttachments,
              }
            : {}),
          ...(slackFileErrors.length > 0 ? { slackFileErrors } : {}),
          ...(bootstrapMarkerMetadata
            ? { slackRoleCreationBootstrap: bootstrapMarkerMetadata }
            : {}),
          historyTruncated,
          slackUserName,
          source: isButtonChoice
            ? "org_agent_slack_button_choice"
            : isRoleCreationBootstrap
              ? "org_role_creation_slack_bootstrap"
              : "org_agent_slack_user",
          ...(isButtonChoice && clean(job.choice_source_job_id)
            ? { slackChoiceSourceJobId: clean(job.choice_source_job_id) }
            : {}),
        };
        const llmUserMessage = buildHarperSlackFileLlmMessage({
          attachments: slackFileAttachments,
          errors: slackFileErrors,
          message:
            isRoleCreationBootstrap && !isSyntheticBootstrapMessage
              ? prompt
              : batchedPrompt,
        });
        let roleConfirmationResult: Awaited<
          ReturnType<typeof runOrgRoleCreationChat>
        > | null = null;
        if (
          draftRoleCreation &&
          isButtonChoice &&
          clean(job.choice_source_job_id)
        ) {
          const { data: sourceJob, error: sourceJobError } = await (
            admin.from("slack_reply_jobs" as any) as any
          )
            .select("response_message_id, response_text")
            .eq("id", clean(job.choice_source_job_id))
            .maybeSingle();
          if (sourceJobError) throw sourceJobError;
          const sourceMessageId = Number(sourceJob?.response_message_id || 0);
          const parsedChoices = parseHarperSlackChoiceMarkers(
            clean(sourceJob?.response_text)
          ).choices;
          const choiceIndex = parsedChoices.findIndex(
            (choice) => choice.userMessage === prompt
          );
          if (sourceMessageId && choiceIndex >= 0) {
            const { data: sourceMessage, error: sourceMessageError } = await (
              admin.from("company_messages" as any) as any
            )
              .select("conversation_id, metadata")
              .eq("id", sourceMessageId)
              .eq("role_id", draftRoleCreation.roleId)
              .maybeSingle();
            if (sourceMessageError) throw sourceMessageError;
            const roleCreation = object(
              object(sourceMessage?.metadata).roleCreation
            );
            const confirmationChoice = Array.isArray(roleCreation.choices)
              ? object(roleCreation.choices[choiceIndex])
              : {};
            const decision =
              confirmationChoice.value === "yes" ||
              confirmationChoice.value === "no"
                ? confirmationChoice.value
                : null;
            const actionId = clean(confirmationChoice.actionId);
            if (decision && actionId) {
              const confirmed = await confirmRoleCreationChoice({
                actionId,
                assistantMessageMetadata: { slackReplyJobId: job.id },
                decision,
                messageId: sourceMessageId,
                messageType: "slack",
                roleId: draftRoleCreation.roleId,
                slackAssistantUserId: integration.slack_bot_user_id,
                slackThreadId: thread.id,
                slackUserId,
                user: authData.user,
                workspaceId: channel.company_workspace_id,
              });
              let currentUserMessage = await findOrgAgentSlackUserMessage({
                admin,
                slackMessageTs: messageTs,
                slackThreadId: thread.id,
                workspaceId: channel.company_workspace_id,
              });
              if (!currentUserMessage) {
                const { data: confirmationUser, error: confirmationUserError } =
                  await (admin.from("company_messages" as any) as any)
                    .select(
                      "id, conversation_id, company_workspace_id, role_id, company_user_id, role, content, message_type, model, status, mentions, thinking_logs, metadata, created_at"
                    )
                    .eq("conversation_id", sourceMessage?.conversation_id)
                    .eq("role", "user")
                    .contains("metadata", {
                      roleCreationConfirmation: {
                        actionId,
                        decision,
                        kind: "user",
                        sourceMessageId,
                      },
                    })
                    .maybeSingle();
                if (confirmationUserError) throw confirmationUserError;
                currentUserMessage = confirmationUser
                  ? toOrgAgentMessage(confirmationUser as OrgAgentMessageRow)
                  : null;
              }
              if (confirmed.assistantMessage && currentUserMessage) {
                roleConfirmationResult = {
                  assistantMessage: confirmed.assistantMessage,
                  conversationId: clean(sourceMessage?.conversation_id),
                  kind: "message",
                  model: getSlackOrgAgentModel() as OrgAgentModelId,
                  roleId: draftRoleCreation.roleId,
                  userMessage: currentUserMessage,
                };
              }
            }
          }
        }
        const emitSlackAgentEvent = (event: string, data: unknown) => {
          if (event === "tool_status") {
            const progress = object(data);
            const id = clean(progress.id);
            const label = clean(progress.label);
            const status = clean(progress.status);
            const target = pendingSlackStatus
              ? { ...pendingSlackStatus }
              : null;
            if (
              target &&
              label &&
              id !== "context" &&
              id !== "response" &&
              (status === "running" || status === "done" || status === "error")
            ) {
              const nextStatus =
                status === "running" ? label : "답변 작성 중";
              slackStatusUpdateChain = slackStatusUpdateChain
                .then(async () => {
                  await setHarperSlackThreadStatus({
                    ...target,
                    status: nextStatus,
                  });
                })
                .catch((error) => {
                  console.warn(
                    "[org-agent/slack-turn:set-tool-status]",
                    error
                  );
                });
            }
          }
          if (!verbose) return;
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
        };
        const result =
          roleConfirmationResult ??
          (draftRoleCreation
            ? await runOrgRoleCreationChat({
                assistantMessageMetadata: {
                  slackReplyJobId: job.id,
                  source: "org_role_creation_slack",
                },
                attachments: slackFileAttachments,
                emit: emitSlackAgentEvent,
                llmUserMessage,
                mentions: [],
                message: prompt,
                messageType: "slack",
                messageUserId: actorUserId,
                model: getSlackOrgAgentModel(),
                roleId: draftRoleCreation.roleId,
                slackAssistantUserId: integration.slack_bot_user_id,
                slackThreadId: thread.id,
                slackUserId,
                slackUserMessageTs: messageTs,
                surface: "slack",
                user: authData.user,
                userMessageMetadata: sharedMessageMetadata,
                workspaceId: channel.company_workspace_id,
              })
            : await runOrgAgentChat({
                assistantMessageMetadata: {
                  slackReplyJobId: job.id,
                  source: "org_agent_slack",
                },
                attachments: slackFileAttachments,
                debug: verbose,
                emit: emitSlackAgentEvent,
                mentions: [],
                llmUserMessage,
                message: prompt,
                messageType: "slack",
                messageUserId: null,
                model: getSlackOrgAgentModel(),
                roleId: clean(thread.role_id) || null,
                slackAssistantUserId: integration.slack_bot_user_id,
                slackExecutionContext: {
                  channelDbId: channel.id,
                  channelId,
                  publicSiteUrl: getPublicSiteUrlFromRequest(req),
                  slackUserId,
                  sourceKey: job.id,
                  token,
                },
                slackThreadId: thread.id,
                slackUserId,
                slackUserMessageTs: messageTs,
                signal: slackTurnSignal,
                user: authData.user,
                userMessageMetadata: sharedMessageMetadata,
                workspaceId: channel.company_workspace_id,
              }));
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
      const companyInfoUrl = buildSlackWorkspacePageUrl({
        page: "team",
        publicSiteUrl: getPublicSiteUrlFromRequest(req),
        workspaceId: channel.company_workspace_id,
      });
      let slackResponseText: string;
      try {
        let preferredRoleId = clean(thread.role_id) || null;
        if (!preferredRoleId && responseMessageId) {
          const { data: responseMessage, error: responseMessageError } = await (
            admin.from("company_messages" as any) as any
          )
            .select("role_id, metadata")
            .eq("id", responseMessageId)
            .eq("company_workspace_id", channel.company_workspace_id)
            .maybeSingle();
          if (responseMessageError) throw responseMessageError;
          preferredRoleId =
            clean(responseMessage?.role_id) ||
            clean(object(responseMessage?.metadata).preferredRoleId) ||
            null;
        }
        const targets = await loadSlackOrgLinkTargets({
          admin,
          message: parsedSlackResponse.text,
          preferredRoleId,
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
      slackResponseText = renderOrgAgentCompanyInfoSlackLink(
        slackResponseText,
        companyInfoUrl
      ).text;
      if (!draftRoleCreation) {
        try {
          slackResponseText = await appendMissingInProgressSlackRoleLinks({
            admin,
            message: slackResponseText,
            workspaceId: channel.company_workspace_id,
          });
        } catch (error) {
          // A missing-link safeguard must not block the main Slack reply.
          console.warn("[org-agent/slack-turn:role-creation-links]", error);
        }
      }
      // A model pass may normalize a valid Slack link back to web Markdown.
      // Slack does not render `[label](url)`, so normalize HTTP links at the
      // final delivery boundary after every generated and appended fragment.
      slackResponseText = convertMarkdownLinksToSlackMrkdwn(slackResponseText);
      const deliveredSlackText =
        slackResponseText || "다음 행동을 선택해 주세요.";
      const slackBlocks = buildHarperSlackChoiceBlocks({
        choices: parsedSlackResponse.choices,
        sourceJobId: job.id,
        text: deliveredSlackText,
      });
      // Keep progress updates ordered before the final reply. Slack clears the
      // assistant thread status automatically after chat.postMessage.
      await slackStatusUpdateChain;
      const posted = await postHarperSlackMessage({
        // Use an explicit mrkdwn Block Kit section for every reply. The
        // top-level text remains a notification/accessibility fallback.
        blocks: slackBlocks,
        channelId,
        clientMessageId: job.id,
        text: deliveredSlackText,
        threadTs,
        token,
        unfurlLinks: false,
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
