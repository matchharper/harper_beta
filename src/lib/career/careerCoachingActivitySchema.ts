export const CAREER_COACHING_ACTIVITY_MESSAGE_TYPE = "career_coaching_activity";

export const CAREER_COACHING_ACTIVITY_STATUSES = [
  "suggested",
  "active",
  "ended",
] as const;

export type CareerCoachingActivityStatus =
  (typeof CAREER_COACHING_ACTIVITY_STATUSES)[number];

export type CareerCoachingActivity = {
  activityId: string;
  agenda: string[];
  channel: "chat" | "call" | null;
  createdAt: string;
  endedAt: string | null;
  messageId: number;
  plannedMinutes: number | null;
  revision: number;
  startedAt: string | null;
  status: CareerCoachingActivityStatus;
  suggestedMinutes: number | null;
  topic: string;
  updatedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown, maxLength = 500) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}

function optionalMinutes(value: unknown) {
  const minutes = Number(value);
  return Number.isSafeInteger(minutes) && minutes >= 5 && minutes <= 120
    ? minutes
    : null;
}

function isStatus(value: unknown): value is CareerCoachingActivityStatus {
  return CAREER_COACHING_ACTIVITY_STATUSES.includes(
    value as CareerCoachingActivityStatus
  );
}

function parseAgenda(value: unknown) {
  if (!Array.isArray(value) || value.length > 8) return null;
  const agenda = value
    .map((item) => optionalString(item, 240))
    .filter((item): item is string => Boolean(item));
  return agenda.length === value.length ? agenda : null;
}

export function parseCareerCoachingActivity(message: {
  id: number;
  message_type: string | null;
  payload?: unknown;
}): CareerCoachingActivity | null {
  if (message.message_type !== CAREER_COACHING_ACTIVITY_MESSAGE_TYPE) {
    return null;
  }

  const payload = asRecord(message.payload);
  if (!payload || payload.kind !== CAREER_COACHING_ACTIVITY_MESSAGE_TYPE) {
    return null;
  }

  const activityId = optionalString(payload.activityId, 80);
  const topic = optionalString(payload.topic, 160);
  const createdAt = optionalString(payload.createdAt, 80);
  const updatedAt = optionalString(payload.updatedAt, 80);
  const revision = Number(payload.revision);
  const suggestedMinutes = optionalMinutes(payload.suggestedMinutes);
  const plannedMinutes = optionalMinutes(payload.plannedMinutes);
  const agenda = parseAgenda(payload.agenda);
  const channel =
    payload.channel === "chat" || payload.channel === "call"
      ? payload.channel
      : null;

  if (
    !activityId ||
    !topic ||
    !createdAt ||
    !updatedAt ||
    !isStatus(payload.status) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !agenda
  ) {
    return null;
  }

  const startedAt = optionalString(payload.startedAt, 80);
  const endedAt = optionalString(payload.endedAt, 80);
  if (
    payload.status === "suggested" &&
    (suggestedMinutes === null ||
      plannedMinutes !== null ||
      agenda.length > 0 ||
      channel !== null ||
      startedAt !== null ||
      endedAt !== null)
  ) {
    return null;
  }
  if (
    payload.status === "active" &&
    (plannedMinutes === null ||
      !channel ||
      agenda.length < 1 ||
      startedAt === null ||
      endedAt !== null)
  ) {
    return null;
  }
  if (payload.status === "ended" && endedAt === null) return null;

  return {
    activityId,
    agenda,
    channel,
    createdAt,
    endedAt,
    messageId: message.id,
    plannedMinutes,
    revision,
    startedAt,
    status: payload.status,
    suggestedMinutes,
    topic,
    updatedAt,
  };
}
