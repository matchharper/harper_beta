import { applicationQuestionMessages } from "./questionHistory";
import { createHash } from "node:crypto";
import type { Json } from "@/types/database.types";
import {
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";
import { parseSimulationSession, type SimulationSession } from "./session";
import { expirePreparation } from "./preparationStore";
import type { SessionRecord, SessionStoreArgs } from "./sessionStore";

type ActivityRow = {
  created?: boolean;
  id: string;
  message_id: number;
  payload: unknown;
  created_at: string;
};
type Rpc = (
  name: string,
  input: Record<string, unknown>
) => Promise<{
  data: unknown;
  error: { message: string; code?: string } | null;
}>;
export function activityRecord(
  row: ActivityRow,
  store: Pick<SessionStoreArgs, "userId" | "conversationId">
) {
  const state = parseSimulationSession(row.payload);
  if (!state?.activity) throw new Error("Invalid application activity");
  return {
    messageId: row.message_id,
    state,
    created: row.created === true,
    // Transport projection only: the stored anchor contains an activity reference.
    message: toTalentMessageResponse({
      id: row.message_id,
      user_id: store.userId,
      conversation_id: store.conversationId,
      role: "assistant",
      message_type: "simulation_session",
      content: "",
      payload: state as unknown as Json,
      created_at: row.created_at,
    }),
  };
}
export async function activityOperation(
  args: SessionStoreArgs & {
    operation: "read" | "touch" | "begin" | "save" | "resume";
    record?: SessionRecord;
    state?: SimulationSession;
    key?: string;
    messageId?: number;
  }
) {
  const { data, error } = await (
    args.admin.rpc.bind(args.admin) as unknown as Rpc
  )("write_application_activity", {
    p_user_id: args.userId,
    p_conversation_id: args.conversationId,
    p_operation: args.operation === "touch" ? "read" : args.operation,
    p_message_id: args.record?.messageId ?? args.messageId ?? null,
    p_revision: args.record?.state.revision ?? null,
    p_payload: args.state ?? null,
    p_key: args.key
      ? createHash("sha256").update(args.key).digest("hex")
      : null,
    p_offer_id: args.state?.activity?.offerId ?? null,
  });
  if (error)
    throw Object.assign(new Error(error.message), { code: error.code });
  if (!data) return null;
  const record = activityRecord(data as ActivityRow, args);
  if (args.operation !== "touch") return record;
  const state = expirePreparation(record.state);
  if (JSON.stringify(state) === JSON.stringify(record.state)) return record;
  if(state.status === "ended" && record.state.browser?.sessionId) {
    const {stopApplicationBrowser,agentsRequest}=await import("./agentsApi");
    await stopApplicationBrowser(record.state.browser);
    await agentsRequest(`sessions/${record.state.browser.sessionId}`,undefined,"DELETE").catch(()=>{});
  }
  return activityOperation({
    ...args,
    operation: "save",
    record,
    state,
    key: `expire:${record.state.revision}`,
  });
}
export function activityOutputMessages(
  record: SessionRecord,
  store: Pick<SessionStoreArgs, "userId" | "conversationId">
) {
  return [...applicationQuestionMessages(record.state), ...Object.entries(record.state.activity?.outputs ?? {}).map(
    ([id, output]) => ({
      ...toTalentMessageResponse({
        id: Number(id),
        user_id: store.userId,
        conversation_id: store.conversationId,
        role: "assistant",
        message_type: output.messageType,
        content: output.content,
        payload: output.payload as Json,
        created_at: output.createdAt,
      } as TalentMessageRow),
      applicationActivity: {
        activityId: record.state.sessionId,
        revision: record.state.revision,
        view: output.messageType,
        runId: (output.payload as { runId?: string })?.runId,
      },
    })
  )];
}
