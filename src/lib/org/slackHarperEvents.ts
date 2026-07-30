import "server-only";

import { storeHarperSlackThreadEvent } from "@/lib/org/slackHarper";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export type SlackEventEnvelope = {
  api_app_id?: string;
  event?: {
    bot_id?: string;
    channel?: string;
    event_ts?: string;
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
  if (event.bot_id || event.subtype) return { ignored: "bot_or_subtype" };

  const { data: integration, error: integrationError } = await (
    admin.from("company_slack_integrations" as any) as any
  )
    .select("company_workspace_id, slack_bot_user_id")
    .eq("slack_team_id", teamId)
    .eq("status", "active")
    .maybeSingle();
  if (integrationError) throw integrationError;
  if (!integration) return { ignored: "installation_not_found" };

  const { data: channel, error: channelError } = await (
    admin.from("company_slack_channels" as any) as any
  )
    .select("*")
    .eq("company_workspace_id", integration.company_workspace_id)
    .eq("slack_channel_id", channelId)
    .eq("is_enabled", true)
    .maybeSingle();
  if (channelError) throw channelError;
  if (!channel) return { ignored: "channel_not_enabled" };

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

  if (isMention && channel.respond_to_mentions) {
    triggerKind = "mention";
    if (!thread) {
      const { data, error } = await (
        admin.from("company_slack_threads" as any) as any
      )
        .upsert(
          {
            channel_id: channel.id,
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
    }
  } else if (
    event.type === "message" &&
    event.thread_ts &&
    channel.reply_to_harper_threads
  ) {
    if (!thread?.created_by_harper) return { ignored: "unmanaged_thread" };
    triggerKind = "thread_reply";
  } else if (event.type === "message" && event.thread_ts && thread) {
    await storeHarperSlackThreadEvent({
      content: clean(event.text),
      slackMessageTs: messageTs,
      slackUserId: clean(event.user) || null,
      threadId: thread.id,
      workspaceId: integration.company_workspace_id,
    });
    return { ignored: "mention_required", stored: true };
  } else {
    return { ignored: "unsupported_event" };
  }

  const prompt = clean(event.text)
    .replaceAll(`<@${integration.slack_bot_user_id}>`, "")
    .trim();
  if (!prompt) return { ignored: "empty_prompt" };
  if (!thread) throw new Error("Slack thread was not resolved");

  const { data: existing, error: existingError } = await (
    admin.from("slack_reply_jobs" as any) as any
  )
    .select("id")
    .eq("slack_event_id", eventId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { duplicate: true };

  const { error: jobError } = await (
    admin.from("slack_reply_jobs" as any) as any
  ).insert({
    prompt,
    slack_event_id: eventId,
    slack_message_ts: messageTs,
    slack_user_id: clean(event.user) || null,
    thread_id: thread.id,
    trigger_kind: triggerKind,
  });
  if (jobError) {
    if ((jobError as { code?: string }).code === "23505")
      return { duplicate: true };
    throw jobError;
  }
  return { queued: true };
}
