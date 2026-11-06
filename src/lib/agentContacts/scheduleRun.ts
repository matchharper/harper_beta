import type { Query } from "@/lib/career/matching/internalScoring/database";

/**
 * A run woken by one of Harper's own schedules (not tied to an introduction):
 * the tools it gets and where it may talk to the company.
 */

/**
 * Whether such a run may message the company, and where. ORG_AGENT_SCHEDULE_MESSAGES:
 * origin (default; the Slack thread the work was asked in, else the Role's web
 * chat), chat (the Role's web chat), off (the run cannot message the company).
 * An unknown value turns it off.
 */
export type ScheduleRunMessages = "off" | "chat" | "origin";
export function scheduleRunMessages(env: Record<string, string | undefined> = process.env): ScheduleRunMessages {
  const value = (env.ORG_AGENT_SCHEDULE_MESSAGES ?? "").trim().toLowerCase();
  if (value === "" || value === "on" || value === "origin") return "origin";
  return value === "chat" ? "chat" : "off";
}

/**
 * Tools per effect tier (D15). Tier 2 adds the actions a run can complete: a
 * message to a candidate's agent in an existing introduction and publishing an
 * introduced candidate. The run holds no member permission, so search and the
 * scheduled-selection tool (403 or another path) are not offered. Tier 1 has
 * no proposal tool, so it gets the tier 0 tools.
 */
export function scheduleRunTools(tier: number, messages: ScheduleRunMessages = "off") {
  return new Set([
    "read_role",
    "read_conversation_history",
    "get_more_data",
    "get_talents",
    "read_talent",
    "manage_agent_schedule",
    ...(messages === "off" ? [] : ["contact_user"]),
    ...(tier >= 2 ? ["contact_talent", "publish_role_recommendations"] : []),
  ]);
}

/** The schedule that woke this job, when it is one of Harper's own (not an introduction's). */
export async function wokenGeneralSchedule(q: Query, jobId: string) {
  const [job] = await q("SELECT action_context FROM public.company_agent_web_action_jobs WHERE id=$1::uuid", [jobId]);
  if (!job?.action_context?.scheduleId || job.action_context.introductionRootId) return undefined;
  const [schedule] = await q(
    "SELECT id,role_id,target_refs,source FROM public.company_agent_schedules WHERE id=$1::uuid",
    [job.action_context.scheduleId]
  );
  return schedule && !schedule.target_refs?.introductionRootId ? schedule : undefined;
}

export type ScheduleReplyDestination =
  | {
      kind: "slack";
      conversationId: string;
      threadId: string;
      threadRoleId: string | null;
      channelDbId: string;
      slackChannelId: string;
    }
  | { kind: "chat" };

/** The company member's message this schedule answers (older rows: its stored source). */
export function scheduleOriginMessageId(row?: { target_refs?: any; source?: any } | null) {
  return row?.target_refs?.originMessageId ?? (row?.source?.kind === "company" ? row.source.messageId : undefined);
}

/**
 * The Slack thread the schedule was asked in, while that thread can still take
 * this Role's messages; otherwise the Role's web chat. The company's answer
 * there is stored like any other message in that thread or chat.
 */
export async function scheduleReplyDestination(
  q: Query,
  workspaceId: string,
  schedule: Record<string, any>
): Promise<ScheduleReplyDestination> {
  const messageId = scheduleOriginMessageId(schedule);
  if (messageId == null) return { kind: "chat" };
  const [thread] = await q(
    `SELECT m.conversation_id,t.id AS thread_id,t.role_id AS thread_role_id,c.id AS channel_id,c.slack_channel_id
    FROM public.company_messages m
    JOIN public.company_slack_threads t ON t.id=m.slack_thread_id
    JOIN public.company_slack_channels c ON c.id=t.channel_id
    WHERE m.id=$1 AND m.company_workspace_id=$2::uuid AND m.role='user' AND m.message_type='slack'
      AND c.company_workspace_id=$2::uuid AND c.is_enabled AND (t.role_id IS NULL OR t.role_id=$3::uuid)
      AND NOT EXISTS(SELECT 1 FROM public.company_role_notification_channels o WHERE o.role_id=$3::uuid AND o.channel_id=c.id)`,
    [messageId, workspaceId, schedule.role_id]
  );
  return thread
    ? {
        kind: "slack",
        conversationId: thread.conversation_id,
        threadId: thread.thread_id,
        threadRoleId: thread.thread_role_id ?? null,
        channelDbId: thread.channel_id,
        slackChannelId: thread.slack_channel_id,
      }
    : { kind: "chat" };
}

/** Where a run's message goes in this mode; null when the run cannot message the company. */
export async function scheduleRunDestination(
  q: Query,
  workspaceId: string,
  schedule: Record<string, any>,
  messages: ScheduleRunMessages
): Promise<ScheduleReplyDestination | null> {
  if (messages === "off") return null;
  return messages === "origin" ? scheduleReplyDestination(q, workspaceId, schedule) : { kind: "chat" };
}

const TIER_2 =
  "if still useful, you may message a candidate's agent in an existing introduction or publish an introduced candidate. This run cannot start a new search";

/** What the woken run reads about its tier and, when it may, where its message goes. */
export function scheduleRunText(
  schedule: { effect_tier?: unknown; created_by?: unknown },
  destination: ScheduleReplyDestination | null
) {
  const tier = Number(schedule.effect_tier ?? 0);
  const who = schedule.created_by === "user" ? "asked by a company member" : "Harper's own";
  if (!destination)
    return `Effect tier ${tier} (${who}): ${tier >= 2 ? TIER_2 : "look again and message the company only if useful; do not search, contact or publish"}.`;
  const scope =
    tier >= 2
      ? `look again and message the company; ${TIER_2}; if one would help, ask the company`
      : `look again and message the company only if useful${tier === 1 ? "; a change you propose waits for the company's answer" : ""}. Do not search, contact candidates or publish`;
  const where = destination.kind === "slack" ? "the Slack thread where this was asked" : "this Role's web chat";
  return `Effect tier ${tier} (${who}): ${scope}.\nA message to the company (contact_user, one per run) goes to ${where}; the company can answer there.`;
}
