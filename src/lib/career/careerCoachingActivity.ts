import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  toTalentMessageResponse,
  type TalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";
import {
  CAREER_COACHING_ACTIVITY_MESSAGE_TYPE,
  parseCareerCoachingActivity,
  type CareerCoachingActivity,
} from "@/lib/career/careerCoachingActivitySchema";

export {
  CAREER_COACHING_ACTIVITY_MESSAGE_TYPE,
  CAREER_COACHING_ACTIVITY_STATUSES,
  parseCareerCoachingActivity,
  type CareerCoachingActivity,
  type CareerCoachingActivityStatus,
} from "@/lib/career/careerCoachingActivitySchema";

export type CareerCoachingActivityAction =
  | "suggest"
  | "start"
  | "update"
  | "end";

export type CareerCoachingActivityMessageResponse = TalentMessageResponse & {
  coachingActivity: CareerCoachingActivity;
};

function optionalString(value: unknown, maxLength = 500) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}

function normalizeAgenda(value: readonly string[] | null | undefined) {
  if (!value) return null;
  const agenda = value
    .map((item) => item.trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 8);
  return agenda.length > 0 ? agenda : null;
}

export function toCareerCoachingActivityMessageResponse(
  message: TalentMessageRow
): CareerCoachingActivityMessageResponse | null {
  const coachingActivity = parseCareerCoachingActivity(message);
  if (!coachingActivity) return null;
  return {
    ...toTalentMessageResponse(message),
    coachingActivity,
  };
}

export async function fetchCurrentCareerCoachingActivity(args: {
  activityMessageId?: number | null;
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}) {
  if (
    Object.prototype.hasOwnProperty.call(args, "activityMessageId") &&
    !args.activityMessageId
  ) {
    return null;
  }

  if (args.activityMessageId) {
    const { data, error } = await args.admin
      .from("talent_messages")
      .select("*")
      .eq("id", args.activityMessageId)
      .eq("conversation_id", args.conversationId)
      .eq("user_id", args.userId)
      .eq("message_type", CAREER_COACHING_ACTIVITY_MESSAGE_TYPE)
      .maybeSingle();
    if (error) {
      throw new Error(
        error.message ?? "Failed to read career coaching activity"
      );
    }
    const activity = data
      ? parseCareerCoachingActivity(data as TalentMessageRow)
      : null;
    return activity?.status === "ended" ? null : activity;
  }

  const { data, error } = await args.admin
    .from("talent_messages")
    .select("*")
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .eq("message_type", CAREER_COACHING_ACTIVITY_MESSAGE_TYPE)
    .order("id", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(error.message ?? "Failed to read career coaching activity");
  }

  for (const row of (data ?? []) as TalentMessageRow[]) {
    const activity = parseCareerCoachingActivity(row);
    if (activity && activity.status !== "ended") return activity;
  }
  return null;
}

/**
 * Runs before the incoming user message is stored. The database function owns
 * the lock and reads the previous activity timestamp, so the new request cannot
 * accidentally keep an abandoned activity alive.
 */
export async function expireCurrentCareerCoachingActivity(args: {
  activityMessageId: number;
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}): Promise<CareerCoachingActivityMessageResponse | null> {
  const { data, error } = await args.admin.rpc(
    "expire_talent_career_coaching_activity",
    {
      p_activity_message_id: args.activityMessageId,
      p_conversation_id: args.conversationId,
      p_user_id: args.userId,
    }
  );

  if (error) {
    throw new Error(
      error.message ?? "Failed to expire career coaching activity"
    );
  }
  // PostgREST represents `return null` from a composite-returning PostgreSQL
  // function as either JSON null or an object whose composite fields are null.
  // Both mean that the activity is still within its inactivity window.
  if (
    !data ||
    (typeof data === "object" &&
      !Array.isArray(data) &&
      (data as Partial<TalentMessageRow>).id == null &&
      (data as Partial<TalentMessageRow>).message_type == null &&
      (data as Partial<TalentMessageRow>).payload == null)
  ) {
    return null;
  }

  const response = toCareerCoachingActivityMessageResponse(
    data as TalentMessageRow
  );
  if (!response || response.coachingActivity.status !== "ended") {
    throw new Error("Career coaching expiry returned an invalid payload");
  }
  return response;
}

export async function rollbackCareerCoachingCallStart(args: {
  activityMessageId: number;
  admin: TalentAdminClient;
  conversationId: string;
  expectedRevision: number;
  userId: string;
}): Promise<CareerCoachingActivityMessageResponse> {
  const { data, error } = await args.admin.rpc(
    "rollback_talent_career_coaching_call_start",
    {
      p_activity_message_id: args.activityMessageId,
      p_conversation_id: args.conversationId,
      p_expected_revision: args.expectedRevision,
      p_user_id: args.userId,
    }
  );
  if (error || !data) {
    throw new Error(
      error?.message ?? "Failed to roll back career coaching call start"
    );
  }
  const response = toCareerCoachingActivityMessageResponse(
    data as TalentMessageRow
  );
  if (!response || response.coachingActivity.status !== "suggested") {
    throw new Error(
      "Career coaching call rollback returned an invalid payload"
    );
  }
  return response;
}

export async function mutateCareerCoachingActivity(args: {
  action: CareerCoachingActivityAction;
  activityMessageId?: number | null;
  admin: TalentAdminClient;
  agenda?: readonly string[] | null;
  channel?: "chat" | "call" | null;
  conversationId: string;
  expectedRevision?: number | null;
  idempotencyKey?: string | null;
  plannedMinutes?: number | null;
  suggestedMinutes?: number | null;
  topic?: string | null;
  userId: string;
}): Promise<CareerCoachingActivityMessageResponse> {
  const { data, error } = await args.admin.rpc(
    "mutate_talent_career_coaching_activity",
    {
      p_action: args.action,
      p_activity_message_id: args.activityMessageId ?? null,
      p_agenda: normalizeAgenda(args.agenda),
      p_channel: args.channel ?? null,
      p_conversation_id: args.conversationId,
      p_expected_revision: args.expectedRevision ?? null,
      p_idempotency_key: optionalString(args.idempotencyKey, 160),
      p_planned_minutes: args.plannedMinutes ?? null,
      p_suggested_minutes: args.suggestedMinutes ?? null,
      p_topic: optionalString(args.topic, 160),
      p_user_id: args.userId,
    }
  );

  if (error || !data) {
    throw new Error(
      error?.message ?? "Failed to change career coaching activity"
    );
  }

  const response = toCareerCoachingActivityMessageResponse(
    data as TalentMessageRow
  );
  if (!response) {
    throw new Error("Career coaching activity returned an invalid payload");
  }
  return response;
}
