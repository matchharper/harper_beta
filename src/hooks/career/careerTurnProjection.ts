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
      if (activity.ownerReplyId) continue;
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
    const delegated = new Map<string, string[]>();
    for (const activity of snapshot?.activities ?? []) {
      if (activity.ownerReplyId) delegated.set(activity.ownerReplyId, [...(delegated.get(activity.ownerReplyId) ?? []), ...activity.logs]);
    }
    for (const [replyId, message] of groups) {
      groups.set(replyId, { ...message, workBackgroundLogs: delegated.get(replyId) ?? [],
        ...(delegated.has(replyId) ? { workPending: true } : {}) });
    }
    const result = messages.filter(message => !message.workReplyId);
    for (const message of [...groups.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const index = result.findIndex(item => item.createdAt > message.createdAt);
      if (index < 0) result.push(message); else result.splice(index, 0, message);
    }
    // Artifacts retain their own persisted IDs and controls, but are displayed
    // inside the reply that produced them, between its activity and final text.
    const owners = new Map(result.filter(m => m.workReplyId).map(m => [m.workReplyId!, m]));
    const browserOwners = new Map<string, string>();
    for (const message of messages) {
      if (!message.artifactReplyId || !owners.has(message.artifactReplyId)) continue;
      for (const ref of message.careerForm?.relatedRefs ?? []) {
        // Older browser cards have no reply ID. An explicit form reference can
        // associate them without guessing from timestamps or the nearest reply.
        if (ref.type === "browser_session" && !browserOwners.has(ref.id)) browserOwners.set(ref.id, message.artifactReplyId);
      }
    }
    const artifactsByReply = new Map<string, CareerMessage[]>();
    const rows = result.filter(message => {
      if (!message.browserSession && !message.careerForm) return true;
      const replyId = message.artifactReplyId ?? (message.browserSession ? browserOwners.get(message.browserSession.sessionId) : undefined);
      if (!replyId || !owners.has(replyId)) return true;
      const artifacts = artifactsByReply.get(replyId) ?? [];
      artifacts.push(message);
      artifactsByReply.set(replyId, artifacts);
      return false;
    });
    return rows.map(message => {
      const artifacts = message.workReplyId ? artifactsByReply.get(message.workReplyId) : undefined;
      return artifacts ? { ...message, workArtifacts: artifacts.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || Number(a.id) - Number(b.id)) } : message;
    });
  };
}
