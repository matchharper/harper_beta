import type { OrgAgentMessageMetadata } from "@/lib/org/agent/types";

const DAY_IN_MS = 24 * 60 * 60 * 1_000;

function localDayStart(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate()
  ).getTime();
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  }).format(value);
}

export function formatOrgChatMessageTime(createdAt: string, now = new Date()) {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "";

  const dayDifference = Math.round(
    (localDayStart(now) - localDayStart(created)) / DAY_IN_MS
  );
  if (dayDifference <= 0) return formatTime(created);
  if (dayDifference === 1) return `어제 ${formatTime(created)}`;
  return `${dayDifference}일 전`;
}

/**
 * Whether a Harper reply answers a team member's message, so its "thought for"
 * time can start at that message. Turns Harper started itself (a schedule, a
 * background event, a candidate agent's message) answer none: counting from the
 * last team message would show minutes or hours Harper never spent.
 */
export function orgAgentReplyAnswersTeamMessage(
  metadata: OrgAgentMessageMetadata | null | undefined
) {
  const trigger = metadata?.agentTurn?.trigger;
  if (trigger) return trigger === "direct_message";
  const record = (metadata ?? {}) as Record<string, unknown>;
  if (record.webActionJobId || record.scheduleId) return false;
  return record.source !== "agent_contact" && record.source !== "org_agent_web_action";
}
