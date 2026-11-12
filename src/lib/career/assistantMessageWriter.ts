import { parseRecommendJobPostingStatusLog } from "@/lib/talentOnboarding/recommendJobPostingStatus";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { toTalentMessageResponse, type TalentMessageRow, type TalentMessageResponse } from "@/lib/talentOnboarding/models";
import { withIsMobile } from "@/lib/requestDevice";
import { CAREER_TURN_ACTIVITY, readCareerTurnEvents, type CareerTurnEvent } from "./turnDisplay";

/** A stable public activity row, followed by an append-only final reply.
 * Activity never enters model history or rolling summaries. The UI groups both
 * by replyId; a completed reply therefore remains new to append-ID readers.
 */
export async function createCareerAssistantMessageWriter(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  replyId: string;
  startedAt: string;
  isMobile?: boolean | null;
  check?: () => Promise<unknown>;
  /** Direct transport; transient text never needs a DB round trip to be visible. */
  onLiveMessage?: (message: Omit<TalentMessageResponse, "id"> & { id: string }) => void;
}) {
  const table = () => args.admin.from("talent_messages");
  const { data: previous, error } = await table().select("*")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
    .eq("message_type", CAREER_TURN_ACTIVITY)
    .eq("payload->>careerTextReplyId", args.replyId)
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  let row = previous as TalentMessageRow | null;
  const previousPayload = row?.payload as Record<string, unknown> | undefined;
  const startedAt = typeof previousPayload?.workStartedAt === "string" ? previousPayload.workStartedAt : args.startedAt;
  let events = readCareerTurnEvents(previousPayload?.workEvents).slice(0, typeof previousPayload?.workCommittedEventCount === "number" ? previousPayload.workCommittedEventCount : undefined);
  let segment = "";
  let segmentStartedAt: string | undefined;
  let segmentChunks: Array<{ text: string; createdAt: string }> = [];
  let logs: string[] = Array.isArray(row?.thinking_logs) ? row.thinking_logs.filter((log): log is string => typeof log === "string") : [];
  let seenLogs: string[] = [];
  let lastWriteAt = 0;
  let finished = false;
  let writes: Promise<unknown> = Promise.resolve();
  const appendLogs = (next: string[]) => {
    for (let i = seenLogs.length; i < next.length; i++) {
      if (!parseRecommendJobPostingStatusLog(next[i])) events.push({ id: `tool:${events.length}`, kind: "tool", text: next[i], createdAt: new Date().toISOString() });
      logs.push(next[i]);
    }
    seenLogs = [...next];
  };
  const snapshot = (completed: boolean, includeSegment = true) => ({
    careerTextReplyId: args.replyId,
    workStartedAt: startedAt,
    workAttemptStartedAt: args.startedAt,
    workCompletedAt: completed ? new Date().toISOString() : null,
    workPending: !completed,
    workCommittedEventCount: events.length,
    workEvents: [...events, ...(includeSegment && segment ? [{ id: `message:${events.length}`, kind: "message", text: segment, createdAt: segmentStartedAt, chunks: [...segmentChunks] } satisfies CareerTurnEvent] : [])],
  });
  const save = (completed: boolean, check = true) => {
    const payload = snapshot(completed);
    const thinking_logs = [...logs];
    const operation = writes.then(async () => {
      if (check && (await args.check?.()) === false) return null;
      const values = { content: "", thinking_logs, payload: payload as TalentMessageRow["payload"] };
      let query = row
        ? table().update(values).eq("id", row.id).eq("user_id", args.userId).eq("conversation_id", args.conversationId)
        : table().insert(withIsMobile({ ...values, conversation_id: args.conversationId, user_id: args.userId, role: "assistant", message_type: CAREER_TURN_ACTIVITY }, args.isMobile));
      const expectedAttempt = (row?.payload as Record<string, unknown> | undefined)?.workAttemptStartedAt;
      if (row && typeof expectedAttempt === "string") query = query.eq("payload->>workAttemptStartedAt", expectedAttempt);
      const result = await query.select("*").single();
      if (result.error || !result.data) throw result.error ?? new Error("Could not save Career activity");
      row = result.data as TalentMessageRow;
      lastWriteAt = Date.now();
      return row;
    });
    // Projection errors cannot poison later writes or replay external work.
    writes = operation.catch(() => undefined);
    return operation;
  };
  const display = async () => {
    lastWriteAt = Date.now();
    return save(false).catch(error => {
      console.warn("[career] Could not save turn display", args.replyId, error);
      return null;
    });
  };
  const live = () => {
    const message = toTalentMessageResponse({ id: 0, user_id: args.userId,
      conversation_id: args.conversationId, role: "assistant", content: "",
      message_type: CAREER_TURN_ACTIVITY, created_at: startedAt, thinking_logs: logs,
      payload: snapshot(false) as TalentMessageRow["payload"] });
    // The live UI already receives text as it arrives. Chunk timestamps remain
    // in the durable receipt for history playback, not every network frame.
    args.onLiveMessage?.({ ...message, workEvents: message.workEvents?.map(({ chunks: _chunks, ...event }) => event), id: `live:${args.replyId}` });
  };
  return {
    start: async () => { if (args.onLiveMessage) { live(); return null; } return display(); },
    async delta(text: string, nextLogs: string[]) {
      if (finished) return null;
      appendLogs(nextLogs);
      if (!segment) segmentStartedAt = new Date().toISOString();
      segmentChunks.push({ text, createdAt: new Date().toISOString() });
      segment += text;
      if (args.onLiveMessage) { live(); return null; }
      return Date.now() - lastWriteAt >= 1000 ? display() : null;
    },
    async progress(text: string, nextLogs: string[]) {
      if (finished) return null;
      appendLogs(nextLogs);
      events.push({ id: `message:${events.length}`, kind: "message", text, createdAt: segmentStartedAt ?? new Date().toISOString(),
        ...(segment === text ? { chunks: [...segmentChunks] } : {}) });
      segment = "";
      segmentStartedAt = undefined;
      segmentChunks = [];
      live();
      return display();
    },
    async finish(text: string, nextLogs: string[], payload?: Record<string, unknown>, completedEvents: CareerTurnEvent[] = []) {
      appendLogs(nextLogs);
      for (const event of completedEvents) if (!events.some(existing => existing.id === event.id)) events.push(event);
      await writes;
      if ((await args.check?.()) === false) return null;
      // The final row contains the display snapshot too, so paginated history
      // can render it even when the older activity row is outside the page.
      const { data: existing, error: readError } = await table().select("*")
        .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
        .eq("message_type", "chat").eq("payload->>careerTextReplyId", args.replyId)
        .order("id", { ascending: false }).limit(1).maybeSingle();
      if (readError) throw readError;
      let final = existing as TalentMessageRow | null;
      if (!final) {
        const result = await table().insert(withIsMobile({
          conversation_id: args.conversationId, user_id: args.userId, role: "assistant",
          message_type: "chat", content: text, thinking_logs: logs,
          payload: { ...payload, ...snapshot(true, false),
            ...(segment ? { workFinalEvent: { id: `message:${events.length}`, kind: "message", text: segment, createdAt: segmentStartedAt, chunks: [...segmentChunks] } } : {}) } as TalentMessageRow["payload"],
        }, args.isMobile)).select("*").single();
        if (result.error || !result.data) throw result.error ?? new Error("Could not save Career reply");
        final = result.data as TalentMessageRow;
      }
      finished = true;
      segment = "";
      segmentStartedAt = undefined;
      segmentChunks = [];
      // Live-only replies never created a durable activity. Their final row
      // already carries the complete display snapshot; do not create an empty one.
      if (row) await save(true, false).catch(() => undefined);
      return final;
    },
    async suspend(nextLogs: string[] = []) {
      if (finished) return row;
      appendLogs(nextLogs);
      await writes;
      // A host deadline hands the same turn to its durable continuation; it
      // does not finish the user-visible work or append a final reply.
      const saved = await save(false);
      finished = true;
      return saved;
    },
    async interrupt() {
      if (finished) return row;
      await writes;
      if (!row && !segment && !events.length && !logs.length) return null;
      finished = true;
      return save(true, false);
    },
    async logs(nextLogs: string[]) {
      if (finished) return null;
      appendLogs(nextLogs);
      if (args.onLiveMessage) { live(); return null; }
      return display();
    },
  };
}
