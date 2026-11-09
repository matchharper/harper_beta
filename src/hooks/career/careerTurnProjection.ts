import type { CareerMessage } from "@/components/career/types";
import type { CareerWorkActivity } from "@/lib/career/work/activity";
import { CAREER_TURN_ACTIVITY, type CareerTurnEvent } from "@/lib/career/turnDisplay";

export type CareerTurnSnapshot = {
  activities?: CareerWorkActivity[];
  turns?: CareerMessage[];
  activeInvocationIds?: string[];
  latestMessageId: number | null;
  pendingInputMessageIds?: number[];
};

/** Keep inputs waiting behind an existing turn pending until delivery is known.
 * A pending response or HTTP admission alone does not mean the input is blocked. */
export function projectCareerInputDelivery(messages: CareerMessage[], snapshot?: CareerTurnSnapshot) {
  const pendingIds = new Set(snapshot?.pendingInputMessageIds);
  return messages.map(message => {
    if (message.role !== "user") return message;
    const id = Number(message.id);
    const covered = snapshot?.pendingInputMessageIds !== undefined &&
      Number.isFinite(id) && id <= (snapshot.latestMessageId ?? 0);
    const inputPending = !message.turnStopped && (pendingIds.has(id) ||
      (!covered && Boolean(message.inputPending)));
    return inputPending === Boolean(message.inputPending) ? message : { ...message, inputPending };
  });
}

/** Reconcile each reply through independent polling and final-row arrival.
 * Public output is then partitioned at user inputs, preserving chronology.
 */
export function createCareerTurnProjection() {
  const observed = new Map<string, CareerMessage>();
  const finalTimes = new Map<string, string>();
  const seenInHistory = new Set<string>();
  return (messages: CareerMessage[], snapshot?: CareerTurnSnapshot, deletedReplyIds: readonly string[] = []) => {
    const deletedReplies = new Set(deletedReplyIds);
    // Explicit deletion wins over retained output and late work/history polls.
    for (const replyId of deletedReplies) {
      observed.delete(replyId);
      finalTimes.delete(replyId);
      seenInHistory.delete(replyId);
    }
    messages = messages.filter(message =>
      !(message.workReplyId && deletedReplies.has(message.workReplyId)) &&
      !(message.browserSession && message.artifactReplyId && deletedReplies.has(message.artifactReplyId))
    );
    const groups = new Map<string, CareerMessage>();
    for (const message of messages) if (message.workReplyId) seenInHistory.add(message.workReplyId);
    for (const activity of snapshot?.activities ?? []) {
      if (activity.ownerReplyId) continue;
      const replyId = `invocation:${activity.id}`;
      if (deletedReplies.has(replyId)) continue;
      const prior = observed.get(replyId);
      groups.set(replyId, prior ? { ...prior, workStartedAt: prior.workStartedAt ?? activity.startedAt, thinkingLogs: activity.logs, ...(activity.events ? { workEvents: activity.events } : {}) } : {
        id: `activity:${replyId}`, role: "assistant", content: "", messageType: CAREER_TURN_ACTIVITY,
        createdAt: activity.startedAt ?? activity.createdAt ?? "",
        workStartedAt: activity.startedAt, workReplyId: replyId, workPending: true,
        thinkingLogs: activity.logs, workEvents: activity.events,
      });
    }
    for (const message of [...messages, ...(snapshot?.turns ?? [])]) {
      if (!message.workReplyId || deletedReplies.has(message.workReplyId)) continue;
      const prior = groups.get(message.workReplyId) ?? observed.get(message.workReplyId);
      const isActivity = message.messageType === CAREER_TURN_ACTIVITY;
      if (!isActivity && message.workPending === false) finalTimes.set(message.workReplyId, message.createdAt);
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
    const delegatedEvents = new Map<string, CareerTurnEvent[]>();
    const delegated = new Map<string, string[]>();
    for (const activity of snapshot?.activities ?? []) {
      if (activity.ownerReplyId && activity.events) {
        delegatedEvents.set(activity.ownerReplyId, [...(delegatedEvents.get(activity.ownerReplyId) ?? []), ...activity.events]);
        continue;
      }
      if (activity.ownerReplyId) delegated.set(activity.ownerReplyId, [...(delegated.get(activity.ownerReplyId) ?? []), ...activity.logs]);
    }
    for (const [replyId, message] of groups) {
      groups.set(replyId, { ...message, workBackgroundLogs: delegated.get(replyId) ?? [],
        ...(delegatedEvents.has(replyId) ? { workEvents: [...new Map([...(message.workEvents ?? []), ...delegatedEvents.get(replyId)!].map(event => [event.id, event])).values()] } : {}),
        ...(delegated.has(replyId) || delegatedEvents.has(replyId) ? { workPending: true } : {}) });
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
    const bundled = rows.map(message => {
      const artifacts = message.workReplyId ? artifactsByReply.get(message.workReplyId) : undefined;
      return artifacts ? { ...message, workArtifacts: artifacts.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || Number(a.id) - Number(b.id)) } : message;
    });
    const inputs = messages.filter(message => message.role === "user" && !message.inputPending);
    return bundled.flatMap(message => {
      if (!message.workReplyId) return [message];
      const start = message.workStartedAt ?? message.createdAt;
      const end = message.workPending ? undefined : message.workCompletedAt ?? finalTimes.get(message.workReplyId) ?? message.createdAt;
      const boundaries = inputs.filter(input => Date.parse(input.createdAt) > Date.parse(start) &&
        (!end || Date.parse(input.createdAt) <= Date.parse(end)))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      if (!boundaries.length) return [message];
      const bucket = (time: string) => boundaries.filter(input => Date.parse(input.createdAt) <= Date.parse(time)).length;
      const finalBucket = bucket(finalTimes.get(message.workReplyId) ?? end ?? boundaries.at(-1)!.createdAt);
      const events = message.workEvents ?? (message.thinkingLogs ?? []).map((text, index) => ({ id: `tool:${index}`, kind: "tool" as const, text, createdAt: start }));
      const preview = message.workFinalEvent;
      const priorChunks = preview?.chunks?.filter(chunk => bucket(chunk.createdAt) < finalBucket) ?? [];
      const priorText = priorChunks.map(chunk => chunk.text).join("");
      const finalContent = priorText && preview && message.content.startsWith(preview.text)
        ? message.content.slice(priorText.length) : message.content;
      const displayEvents = preview && priorChunks.length
        ? [...events, { ...preview, chunks: priorChunks }] : events;
      const segments = Array.from({ length: boundaries.length + 1 }, (_, index): CareerMessage[] => {
        const last = index === boundaries.length;
        const ownEvents = displayEvents.flatMap(event => {
          if ("chunks" in event && Array.isArray(event.chunks) && event.chunks.length) {
            const chunks = event.chunks.filter(chunk => bucket(chunk.createdAt) === index);
            return chunks.length ? [{ ...event, text: chunks.map(chunk => chunk.text).join(""), chunks }] : [];
          }
          return bucket(event.createdAt ?? start) === index ? [event] : [];
        });
        const artifacts = message.workArtifacts?.filter(artifact => bucket(artifact.createdAt) === index);
        const hasFinal = message.messageType === "chat" && index === finalBucket;
        if (!ownEvents.length && !artifacts?.length && !hasFinal && !(last && message.workPending)) return [];
        return [{ ...message,
          workSegmentId: index ? `${message.workReplyId}:${boundaries[index - 1].clientRequestId ?? boundaries[index - 1].id}` : message.workReplyId,
          id: hasFinal ? message.id : `segment:${message.workReplyId}:${index ? boundaries[index - 1].clientRequestId ?? boundaries[index - 1].id : "start"}`,
          createdAt: index ? boundaries[index - 1].createdAt : start,
          content: hasFinal ? finalContent : "",
          messageType: hasFinal ? "chat" : CAREER_TURN_ACTIVITY,
          workEvents: ownEvents, thinkingLogs: [], workArtifacts: artifacts,
          workBackgroundLogs: last ? message.workBackgroundLogs : [],
          workStartedAt: index ? boundaries[index - 1].createdAt : start,
          workCompletedAt: last ? message.workCompletedAt : boundaries[index].createdAt,
          workPending: last && message.workPending, typing: last && message.typing,
        }];
      }).flat();
      // When work ends before a final chat message, its activity owns the footer.
      const lastSegment = segments.at(-1);
      if (lastSegment && message.messageType === CAREER_TURN_ACTIVITY && !message.workPending) {
        lastSegment.id = message.id;
      }
      return segments;
    }).sort((a, b) => Number(Boolean(a.inputPending)) - Number(Boolean(b.inputPending)) ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      (a.role === "user" ? 0 : 1) - (b.role === "user" ? 0 : 1));
  };
}
