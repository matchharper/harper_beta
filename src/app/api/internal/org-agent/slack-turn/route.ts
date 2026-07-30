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
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const maxDuration = 180;
export const runtime = "nodejs";

const clean = (value: unknown) => String(value ?? "").trim();

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

    if (!responseText || !responseMessageId) {
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
          source: "org_agent_slack",
        },
        mentions: [],
        message: prompt,
        messageType: "slack",
        messageUserId: null,
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
      responseText = result.assistantMessage.content;
      responseMessageId = result.assistantMessage.id;
      await (admin.from("slack_reply_jobs" as any) as any)
        .update({
          response_message_id: responseMessageId,
          response_text: responseText,
          updated_at: new Date().toISOString(),
          user_message_id: result.userMessage.id,
        })
        .eq("id", job.id);
    }

    const posted = await postHarperSlackMessage({
      channelId,
      clientMessageId: job.id,
      text: responseText,
      threadTs,
      token,
    });
    const now = new Date().toISOString();
    await Promise.all([
      (admin.from("company_messages" as any) as any)
        .update({
          slack_message_ts: posted.ts,
        })
        .eq("id", responseMessageId),
      (admin.from("company_slack_threads" as any) as any)
        .update({
          created_by_harper: true,
          updated_at: now,
        })
        .eq("id", thread.id),
      (admin.from("slack_reply_jobs" as any) as any)
        .update({
          completed_at: now,
          locked_at: null,
          locked_by: null,
          slack_response_ts: posted.ts,
          status: "completed",
          updated_at: now,
        })
        .eq("id", job.id),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[org-agent/slack-turn]", error);
    return toInternalApiErrorResponse(error, "Failed to run Slack agent turn");
  }
}
