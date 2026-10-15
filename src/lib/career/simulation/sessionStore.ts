import { activityOperation } from "./activityStore";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";
import { type SimulationSession, ACTION_CARD_TYPE } from "./session";
import type { Json } from "@/types/database.types";
export type SessionRecord = { messageId: number; state: SimulationSession };
export type SessionStoreArgs = {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
};
export async function sessionOperation(
  args: SessionStoreArgs & {
    operation: "read" | "touch" | "begin" | "save" | "resume";
    record?: SessionRecord;
    state?: SimulationSession;
    key?: string;
    messageId?: number;
  }
) {
  return activityOperation(args);
}
export async function saveSession(
  args: SessionStoreArgs,
  record: SessionRecord,
  state: SimulationSession,
  key: string
) {
  const result = await sessionOperation({
    ...args,
    operation: "save",
    record,
    state,
    key,
  });
  if (!result) throw new Error("Simulation session disappeared");
  return result;
}
export async function persistSimulationProposal(
  args: SessionStoreArgs,
  record: SessionRecord,
  replyId: number
) {
  const p = record.state.proposal;
  if (!p || record.state.status !== "active") return null;
  const payload = {
    sessionMessageId: record.messageId,
    revision: record.state.revision,
    actionId: p.actionId,
    replyId,
  };
  const { data, error } = await args.admin
    .from("talent_messages")
    .insert({
      user_id: args.userId,
      conversation_id: args.conversationId,
      role: "assistant",
      message_type: ACTION_CARD_TYPE,
      content: p.title,
      payload: payload as unknown as Json,
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    const existing = await args.admin
      .from("talent_messages")
      .select("*")
      .eq("user_id", args.userId)
      .eq("conversation_id", args.conversationId)
      .eq("message_type", ACTION_CARD_TYPE)
      .contains("payload", {
        sessionMessageId: record.messageId,
        revision: record.state.revision,
      })
      .single();
    if (existing.data)
      return toTalentMessageResponse(existing.data as TalentMessageRow);
  }
  if (error || !data) throw new Error("Failed to save next action card");
  return toTalentMessageResponse(data as TalentMessageRow);
}
