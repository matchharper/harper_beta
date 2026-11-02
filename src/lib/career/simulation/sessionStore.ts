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
  let base = record;
  let next = state;
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await sessionOperation({ ...args, operation: "save", record: base, state: next, key });
      if (!result) throw new Error("Simulation session disappeared");
      return result;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Session revision conflict" || attempt >= 3) throw error;
      // Inspection may finish during a resume save or an answer submission. Only
      // merge that independent observation; a changed answer/document/browser
      // still requires the caller to reread, so no user work is overwritten.
      const latest = await sessionOperation({ ...args, operation: "read", messageId: record.messageId });
      if (!latest) throw error;
      const merged = mergeConcurrentInspection(base.state, next, latest.state);
      if (!merged) throw error;
      base = latest;
      next = merged;
    }
  }
}
export function mergeConcurrentInspection(before: SimulationSession, desired: SimulationSession, current: SimulationSession): SimulationSession | null {
  const observation = (s: SimulationSession) => ({ form: s.applicationForm, formId: s.applicationFormId, inspection: s.applicationInspection, url: s.applicationUrl });
  const rest = (s: SimulationSession) => {
    const { applicationForm: _form, applicationFormId: _formId, applicationInspection: _inspection, applicationUrl: _url, revision: _revision, lastActivityAt: _time, ...value } = s;
    return value;
  };
  if (JSON.stringify(rest(before)) !== JSON.stringify(rest(current)) ||
      JSON.stringify(observation(before)) !== JSON.stringify(observation(desired))) return null;
  return { ...desired, revision: current.revision, lastActivityAt: current.lastActivityAt,
    applicationForm: current.applicationForm, applicationFormId: current.applicationFormId,
    applicationInspection: current.applicationInspection, applicationUrl: current.applicationUrl };
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
