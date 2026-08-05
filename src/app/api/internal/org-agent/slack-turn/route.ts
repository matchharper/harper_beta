import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { runOrgAgentChat } from "@/lib/org/agent/chat";
import {
  decryptHarperSlackToken,
  postHarperSlackMessage,
  syncHarperSlackThreadContext,
} from "@/lib/org/slackHarper";
import { getSlackOrgAgentModel } from "@/lib/org/agent/modelConfig";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const maxDuration = 180;
export const runtime = "nodejs";

const clean = (value: unknown) => String(value ?? "").trim();

type RecoveredSlackReply = {
  responseMessageId: number;
  responseProposalId: string | null;
  responseText: string;
  slackResponseTs: string | null;
  userMessageId: number;
};

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
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json().catch(() => ({}))) as { jobId?: string };
    const jobId = clean(body.jobId);
    if (!jobId)
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: job, error: jobError } = await (
      admin.from("slack_reply_jobs" as any) as any
    )
      .select("*")
      .eq("id", jobId)
      .single();
    if (jobError) throw jobError;
    if (job.status === "completed")
      return NextResponse.json({ duplicate: true, ok: true });

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

    if (!responseText || (!responseMessageId && !responseProposalId)) {
      let userMessageId = Number(job.user_message_id || 0);
      if (recovered) {
        responseText = recovered.responseText;
        responseMessageId = recovered.responseMessageId;
        responseProposalId = recovered.responseProposalId;
        userMessageId = recovered.userMessageId;
      } else {
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
          mentions: [],
          message: prompt,
          messageType: "slack",
          messageUserId: null,
          model: getSlackOrgAgentModel(),
          slackAssistantUserId: integration.slack_bot_user_id,
          slackThreadId: thread.id,
          slackUserId,
          slackUserMessageTs: messageTs,
          user: authData.user,
          userMessageMetadata: {
            historyTruncated,
            slackUserName,
            source: "org_agent_slack_user",
          },
          workspaceId: channel.company_workspace_id,
        });
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
      const { error: cacheError } = await (
        admin.from("slack_reply_jobs" as any) as any
      )
        .update({
          response_message_id: responseMessageId || null,
          response_proposal_id: responseProposalId,
          response_text: responseText,
          updated_at: new Date().toISOString(),
          user_message_id: userMessageId,
        })
        .eq("id", job.id);
      if (cacheError) throw cacheError;
    }

    if (!slackResponseTs) {
      const posted = await postHarperSlackMessage({
        channelId,
        clientMessageId: job.id,
        text: responseText,
        threadTs,
        token,
      });
      slackResponseTs = clean(posted.ts);
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
      return NextResponse.json({ ok: true });
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
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[org-agent/slack-turn]", error);
    return toInternalApiErrorResponse(error, "Failed to run Slack agent turn");
  }
}
