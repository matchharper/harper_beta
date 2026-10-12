import type { Json } from "@/types/database.types";
import {
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";
import {
  parseSimulationSession,
  endSimulationSession,
  SESSION_IDLE_MS,
  type SimulationSession,
} from "./session";
import type { SessionRecord, SessionStoreArgs } from "./sessionStore";
import { devSessionTransaction, devSessionOperation } from "./devSessionStore";

export function expirePreparation(s: SimulationSession, now = Date.now()) {
  const next = structuredClone(s);
  if (next.status !== "active") return next;
  if (next.browser && ["queued", "running"].includes(next.browser.status)) return next;
  for (const batch of next.activity?.batches ?? []) {
    if (batch.continuation === "running" && now - Date.parse(batch.continuationStartedAt ?? next.lastActivityAt) > 10 * 60_000)
      batch.continuation = "failed";
  }
  const generation = next.preparation?.generation;
  if (generation?.status === "running") {
    if (now - Date.parse(generation.startedAt ?? "") > 10 * 60_000) {
      generation.status = "failed";
      next.lastActivityAt = new Date(now).toISOString();
    }
    return next;
  }
  if (next.analysisStatus === "running") {
    if (now - Date.parse(next.analysisStartedAt) > 10 * 60_000) {
      next.analysisStatus = "failed";
      next.lastActivityAt = new Date(now).toISOString();
    }
    return next;
  }
  return now - Date.parse(next.lastActivityAt) > SESSION_IDLE_MS
    ? endSimulationSession(next, "expired", new Date(now).toISOString())
    : next;
}
// The development adapter stores new preparation payloads in existing messages too,
// so a Next.js reload does not erase answers. Production uses the locked session RPC.
export async function preparationDevelopmentOperation(
  args: SessionStoreArgs & {
    operation: "read" | "touch" | "begin" | "save" | "resume";
    record?: SessionRecord;
    state?: SimulationSession;
    key?: string;
    messageId?: number;
  }
) {
  return devSessionTransaction(args.userId, args.conversationId, async () => {
    if (
      (args.operation === "begin" || args.operation === "resume") &&
      devSessionOperation({
        userId: args.userId,
        conversationId: args.conversationId,
        operation: "read",
      })
    )
      throw new Error("Another simulation is active");
    const { data: conversation, error: conversationError } = await args.admin
      .from("talent_conversations")
      .select("id,career_coaching_activity_message_id")
      .eq("id", args.conversationId)
      .eq("user_id", args.userId)
      .single();
    if (conversationError || !conversation)
      throw new Error("Conversation unavailable");
    const query = args.admin
      .from("talent_messages")
      .select("*")
      .eq("conversation_id", args.conversationId)
      .eq("user_id", args.userId)
      .eq("message_type", "simulation_session");
    const id = args.record?.messageId ?? args.messageId;
    const { data: row, error } = await (
      id
        ? query.eq("id", id)
        : query
            .eq("payload->>status", "active")
            .contains("payload", { preparation: { version: 1 } })
    )
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const current = parseSimulationSession(row?.payload);
    if (args.operation === "begin") {
      if (current) {
        if ((row!.payload as Record<string, unknown>).startKey === args.key)
          return result(row! as TalentMessageRow);
        throw new Error("An active simulation already exists");
      }
      if (conversation.career_coaching_activity_message_id)
        throw new Error("Finish coaching before switching");
      if (!args.state?.preparation)
        throw new Error("Preparation state required");
      const { data, error: insertError } = await args.admin
        .from("talent_messages")
        .insert({
          user_id: args.userId,
          conversation_id: args.conversationId,
          role: "assistant",
          message_type: "simulation_session",
          content: "Apply with Harper",
          payload: {
            ...args.state,
            startKey: args.key,
            mutationKeys: [],
          } as unknown as Json,
        })
        .select("*")
        .single();
      if (insertError || !data)
        throw insertError ?? new Error("Unable to create preparation");
      return result(data as TalentMessageRow);
    }
    if (!row || !current?.preparation) return null;
    if (args.operation === "read") return result(row as TalentMessageRow);
    const payload = row.payload as Record<string, unknown>;
    const keys = (payload.mutationKeys ?? []) as string[];
    if (args.key && keys.includes(args.key))
      return result(row as TalentMessageRow);
    if (args.operation !== "resume" && current.status !== "active")
      throw new Error("Session has ended");
    if (args.operation === "resume") {
      if (conversation.career_coaching_activity_message_id)
        throw new Error("Finish coaching before resuming");
      const { data: active, error: activeError } = await args.admin
        .from("talent_messages")
        .select("id")
        .eq("user_id", args.userId)
        .eq("conversation_id", args.conversationId)
        .eq("message_type", "simulation_session")
        .eq("payload->>status", "active")
        .neq("id", row.id)
        .limit(1);
      if (activeError || active?.length)
        throw new Error("Another mode is active");
    }
    if (
      (args.operation === "save" || args.operation === "resume") &&
      args.record?.state.revision !== current.revision
    )
      throw new Error("Session revision conflict");
    let state =
      args.operation === "touch" ? expirePreparation(current) : args.state!;
    if (!state || state.sessionId !== current.sessionId)
      throw new Error("Invalid session update");
    if (args.operation === "resume")
      state = { ...current, status: "active", endReason: null, endedAt: null };
    const next = {
      ...state,
      revision: current.revision + 1,
      lastActivityAt: new Date().toISOString(),
      startKey: payload.startKey,
      mutationKeys: args.key ? [...keys, args.key] : keys,
    };
    const { data, error: saveError } = await args.admin
      .from("talent_messages")
      .update({ payload: next as unknown as Json })
      .eq("id", row.id)
      .eq("user_id", args.userId)
      .eq("payload->>revision", String(current.revision))
      .select("*")
      .maybeSingle();
    if (saveError || !data)
      throw saveError ?? new Error("Session revision conflict");
    return result(data as TalentMessageRow);
  });
}
function result(row: TalentMessageRow) {
  return {
    messageId: row.id,
    state: parseSimulationSession(row.payload)!,
    message: toTalentMessageResponse(row),
  };
}
