import { OrgAgentToolInputError } from "./toolAvailability";
import type { OrgAgentThinkingLog } from "./types";
import { finalizeOrgAgentThinkingLogs, hasOrgAgentToolWork } from "./thinkingLogs";

export type CompanyMessagePart = {
  ref: string; text: string; roleId?: string; threadRef?: string; replyTo?: string;
};
/** Supplied by authenticated server code, never model-selected destinations. */
export type CompanyMessageAudience = {
  channelDbId: string; channelId: string; jobId?: string;
};

export function parseCompanyMessages(input: unknown): CompanyMessagePart[] {
  const rows = (input as { messages?: unknown })?.messages;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 12)
    throw new OrgAgentToolInputError("messages must contain 1-12 parts");
  const previous = new Map<string, CompanyMessagePart>();
  return rows.map(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new OrgAgentToolInputError("Invalid message part");
    const part = raw as CompanyMessagePart;
    for (const key of Object.keys(part)) if (!["ref", "text", "roleId", "threadRef", "replyTo"].includes(key))
      throw new OrgAgentToolInputError("Unknown message field");
    if (typeof part.ref !== "string" || !part.ref.trim() || part.ref.length > 80 || previous.has(part.ref))
      throw new OrgAgentToolInputError("Each message needs a unique ref");
    if (typeof part.text !== "string" || !part.text.trim() || part.text.length > 12000)
      throw new OrgAgentToolInputError("Each message needs a body of at most 12000 characters");
    for (const key of ["roleId", "threadRef", "replyTo"] as const)
      if (part[key] !== undefined && (typeof part[key] !== "string" || !part[key]!.trim())) throw new OrgAgentToolInputError(`Invalid ${key}`);
    if (part.threadRef && part.replyTo) throw new OrgAgentToolInputError("Choose threadRef or replyTo");
    const parent = part.replyTo ? previous.get(part.replyTo) : undefined;
    if (part.replyTo && !parent) throw new OrgAgentToolInputError("replyTo must reference an earlier part");
    if (parent?.roleId && part.roleId && part.roleId !== parent.roleId)
      throw new OrgAgentToolInputError("A reply cannot change its parent's Role");
    const parsed = { ...part, ...(parent?.roleId ? { roleId: parent.roleId } : {}) };
    previous.set(part.ref, parsed);
    return parsed;
  });
}

export async function commitCompanyMessages(args: {
  admin: any; audience: CompanyMessageAudience; messages: CompanyMessagePart[];
  actorId: string; workspaceId: string; conversationId: string; sourceMessageId: number; model: string;
}) {
  const { data, error } = await args.admin.rpc("commit_company_message_batch_v1", {
    p_workspace_id: args.workspaceId, p_actor_id: args.actorId,
    p_conversation_id: args.conversationId, p_source_message_id: args.sourceMessageId,
    p_channel_id: args.audience.channelDbId, p_job_id: args.audience.jobId ?? null,
    p_messages: args.messages, p_model: args.model,
  });
  if (error) throw error;
  if (!data?.batchId || !Array.isArray(data.messageIds) || !data.messageIds.length)
    throw new Error("Message batch commit returned no durable messages");
  return { batchId: String(data.batchId), messageIds: data.messageIds.map(Number) };
}

/** Attach the run's existing Working log to its messages, without creating a chat entry for silent runs. */
export async function saveCompanyMessageBatchThinkingLogs(args: {
  admin: any;
  workspaceId: string;
  batch?: { batchId: string; messageIds: number[] };
  thinkingLogs: OrgAgentThinkingLog[];
}) {
  if (!args.batch?.messageIds.length || !args.thinkingLogs.length) return;
  const { error } = await args.admin.from("company_messages")
    .update({ thinking_logs: finalizeOrgAgentThinkingLogs(args.thinkingLogs, hasOrgAgentToolWork(args.thinkingLogs)) })
    .eq("company_workspace_id", args.workspaceId)
    .eq("role", "assistant")
    .contains("metadata", { companyMessageBatch: { batchId: args.batch.batchId } })
    .in("id", args.batch.messageIds);
  if (error) throw error;
}
