import "server-only";

import { storeHarperSlackThreadEvent } from "@/lib/org/slackHarper";
import {
  buildHarperSlackFileFallbackPrompt,
  compactHarperSlackFilesForQueue,
  type HarperSlackFile,
} from "@/lib/org/slackFiles";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { resolveDraftRoleCreationForSlackThread } from "@/lib/org/agent/slackRoleCreation";
import { stripSlackSentUsingAttribution } from "@/lib/org/slackMessageText";

export type SlackEventEnvelope = {
  api_app_id?: string;
  event?: {
    bot_id?: string;
    channel?: string;
    event_ts?: string;
    files?: HarperSlackFile[];
    subtype?: string;
    text?: string;
    thread_ts?: string;
    ts?: string;
    type?: string;
    user?: string;
  };
  event_id?: string;
  team_id?: string;
};

const clean = (value: unknown) => String(value ?? "").trim();

export async function queueHarperSlackEvent(envelope: SlackEventEnvelope) {
  const event = envelope.event;
  const eventId = clean(envelope.event_id);
  const teamId = clean(envelope.team_id);
  const channelId = clean(event?.channel);
  const messageTs = clean(event?.ts || event?.event_ts);
  const admin = getSupabaseAdmin();

  if (event?.type === "app_uninstalled" && teamId) {
    const { error } = await (
      admin.from("company_slack_integrations" as any) as any
    )
      .update({
        status: "revoked",
        updated_at: new Date().toISOString(),
      })
      .eq("slack_team_id", teamId);
    if (error) throw error;
    return { revoked: true };
  }

  if (!event || !eventId || !teamId || !channelId || !messageTs)
    return { ignored: "missing_fields" };
  if (event.bot_id || (event.subtype && event.subtype !== "file_share")) {
    return { ignored: "bot_or_subtype" };
  }

  const { data: channel, error: channelError } = await (
    admin.from("company_slack_channels" as any) as any
  )
    .select("*")
    .eq("slack_team_id", teamId)
    .eq("slack_channel_id", channelId)
    .eq("is_enabled", true)
    .maybeSingle();
  if (channelError) throw channelError;
  if (!channel) return { ignored: "channel_not_enabled" };

  const { data: integration, error: integrationError } = await (
    admin.from("company_slack_integrations" as any) as any
  )
    .select("bot_token_ciphertext, company_workspace_id, slack_bot_user_id")
    .eq("company_workspace_id", channel.company_workspace_id)
    .eq("slack_team_id", teamId)
    .eq("status", "active")
    .maybeSingle();
  if (integrationError) throw integrationError;
  if (!integration) return { ignored: "installation_not_found" };

  const threadTs = clean(event.thread_ts || event.ts);
  const isMention = event.type === "app_mention";
  let triggerKind: "mention" | "thread_reply";
  let thread: Record<string, any> | null = null;
  if (
    event.type === "message" &&
    clean(event.text).includes(`<@${integration.slack_bot_user_id}>`)
  ) {
    return { ignored: "mention_delivered_separately" };
  }
  const prompt = buildHarperSlackFileFallbackPrompt(
    stripSlackSentUsingAttribution(
      clean(event.text).replaceAll(`<@${integration.slack_bot_user_id}>`, "")
    ),
    event.files
  );
  if (!prompt) return { ignored: "empty_prompt" };

  if (isMention || event.thread_ts) {
    const { data, error } = await (
      admin.from("company_slack_threads" as any) as any
    )
      .select("*")
      .eq("channel_id", channel.id)
      .eq("slack_thread_ts", threadTs)
      .maybeSingle();
    if (error) throw error;
    thread = data;
  }
  const draftRoleCreation = thread
    ? await resolveDraftRoleCreationForSlackThread({
        admin,
        slackThreadId: clean(thread.id),
        workspaceId: integration.company_workspace_id,
      })
    : null;

  if (isMention) {
    triggerKind = "mention";
    if (!thread) {
      const { data, error } = await (
        admin.from("company_slack_threads" as any) as any
      )
        .upsert(
          {
            channel_id: channel.id,
            created_by_harper: true,
            role_id: null,
            slack_thread_ts: threadTs,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "channel_id,slack_thread_ts" }
        )
        .select("*")
        .single();
      if (error) throw error;
      thread = data;
    } else if (!thread.created_by_harper) {
      const { data, error } = await (
        admin.from("company_slack_threads" as any) as any
      )
        .update({
          created_by_harper: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", thread.id)
        .select("*")
        .single();
      if (error) throw error;
      thread = data;
    }
  } else if (
    event.type === "message" &&
    event.thread_ts &&
    (channel.reply_to_harper_threads || draftRoleCreation)
  ) {
    if (!thread?.created_by_harper) return { ignored: "unmanaged_thread" };
    triggerKind = "thread_reply";
  } else if (event.type === "message" && event.thread_ts && thread) {
    await storeHarperSlackThreadEvent({
      content: prompt,
      roleId: draftRoleCreation?.roleId,
      slackMessageTs: messageTs,
      slackUserId: clean(event.user) || null,
      threadId: thread.id,
      workspaceId: integration.company_workspace_id,
    });
    return { ignored: "mention_required", stored: true };
  } else {
    return { ignored: "unsupported_event" };
  }

  if (!thread) throw new Error("Slack thread was not resolved");

  if (triggerKind === "thread_reply") {
    await storeHarperSlackThreadEvent({
      content: prompt,
      roleId: draftRoleCreation?.roleId,
      slackMessageTs: messageTs,
      slackUserId: clean(event.user) || null,
      threadId: thread.id,
      workspaceId: integration.company_workspace_id,
    });
  }

  const { data: enqueueData, error: enqueueError } = await (admin.rpc as any)(
    "enqueue_slack_reply_job_v2",
    {
      p_prompt: prompt,
      p_slack_files: compactHarperSlackFilesForQueue(event.files),
      p_slack_event_id: eventId,
      p_slack_message_ts: messageTs,
      p_slack_user_id: clean(event.user) || null,
      p_thread_id: thread.id,
      p_trigger_kind: triggerKind,
    }
  );
  if (enqueueError) throw enqueueError;
  const enqueueResult =
    enqueueData && typeof enqueueData === "object"
      ? (enqueueData as Record<string, unknown>)
      : {};
  if (enqueueResult.duplicate === true) return { duplicate: true };
  return {
    loadingStatus:
      triggerKind === "mention" && clean(integration.bot_token_ciphertext)
        ? {
            botTokenCiphertext: clean(integration.bot_token_ciphertext),
            channelId,
            status: draftRoleCreation
              ? "역할 정보를 정리 중입니다…"
              : "답변 작성 중",
            threadTs,
          }
        : null,
    queued: true,
    supersededJobId: clean(enqueueResult.superseded_job_id) || null,
  };
}
