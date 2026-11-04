import type { CareerMessage } from "@/components/career/types";
import type { CareerWorkActivity } from "@/lib/career/work/activity";
import { CAREER_TURN_ACTIVITY } from "@/lib/career/turnDisplay";

export type CareerTurnSnapshot = {
  activities?: CareerWorkActivity[];
  turns?: CareerMessage[];
  activeInvocationIds?: string[];
  latestMessageId: number | null;
};

/** One timeline owner per reply. Keep its place through independent polling,
 * final-row arrival and cancellation; never transfer it to a footer component.
 */
export function createCareerTurnProjection() {
  const observed = new Map<string, CareerMessage>();
  const seenInHistory = new Set<string>();
  return (messages: CareerMessage[], snapshot?: CareerTurnSnapshot) => {
    const groups = new Map<string, CareerMessage>();
    for (const message of messages) if (message.workReplyId) seenInHistory.add(message.workReplyId);
    for (const activity of snapshot?.activities ?? []) {
      const replyId = `invocation:${activity.id}`;
      const prior = observed.get(replyId);
      groups.set(replyId, prior ? { ...prior, workStartedAt: prior.workStartedAt ?? activity.startedAt, thinkingLogs: activity.logs } : {
        id: `activity:${replyId}`, role: "assistant", content: "", messageType: CAREER_TURN_ACTIVITY,
        createdAt: activity.startedAt ?? activity.createdAt ?? "",
        workStartedAt: activity.startedAt, workReplyId: replyId, workPending: true,
        thinkingLogs: activity.logs,
      });
    }
    for (const message of [...messages, ...(snapshot?.turns ?? [])]) {
      if (!message.workReplyId) continue;
      const prior = groups.get(message.workReplyId) ?? observed.get(message.workReplyId);
      const isActivity = message.messageType === CAREER_TURN_ACTIVITY;
      // A final reply wins even when an older activity snapshot arrives later.
      const final = prior?.messageType === "chat" && prior.workPending === false ? prior : undefined;
      groups.set(message.workReplyId, isActivity && final ? final : {
        ...prior, ...message,
        createdAt: prior?.createdAt ?? message.createdAt,
        ...(prior?.workPending === false && !prior.content && message.workPending && snapshot?.activeInvocationIds && !snapshot.activeInvocationIds.includes(message.workReplyId.slice(11))
          ? { workPending: false, typing: false, workCompletedAt: prior.workCompletedAt } : {}),
      });
    }
    for (const [id, prior] of observed) {
      // Retain an observed running slot across the poll/history handover.
      if (!groups.has(id) && (prior.workPending || !seenInHistory.has(id))) groups.set(id, prior);
    }
    for (const [id, message] of groups) {
      const invocationId = id.startsWith("invocation:") ? id.slice(11) : null;
      if (message.workPending && invocationId && snapshot?.activeInvocationIds &&
          !snapshot.activeInvocationIds.includes(invocationId) &&
          (typeof message.id !== "number" || (snapshot.latestMessageId ?? 0) >= message.id)) {
        groups.set(id, { ...message, workPending: false, typing: false, workCompletedAt: message.workCompletedAt ?? observed.get(id)?.workCompletedAt ?? new Date().toISOString() });
      }
      observed.set(id, groups.get(id)!);
    }
    const result = messages.filter(message => !message.workReplyId);
    for (const message of [...groups.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const index = result.findIndex(item => item.createdAt > message.createdAt);
      if (index < 0) result.push(message); else result.splice(index, 0, message);
    }
    return result;
  };
}
