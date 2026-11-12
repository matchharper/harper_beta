import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentConversationRow, TalentMessageRow, TalentSettingRow } from "@/lib/talentOnboarding/models";
import type { TalentConversationSummaryRow } from "@/lib/talentOnboarding/conversationSummary";
import type { fetchActiveTalentGmailIntegration } from "@/lib/integrations/gmail";
import type { CareerInboxSnapshot } from "./work/inbox";

type Gmail = Awaited<ReturnType<typeof fetchActiveTalentGmailIntegration>>;
export type CareerChatInputs = {
  conversation: TalentConversationRow;
  setting: TalentSettingRow | null;
  gmail: Gmail;
  summary: TalentConversationSummaryRow | null;
  messages: TalentMessageRow[];
};
type Entry = CareerChatInputs & { settingRevision: string; gmailRevision: string;
  historyRevision?: string; summaryId?: string; cursor: number; expiresAt: number };
// Share across session/chat route bundles in a warm server. Expiry bounds memory,
// while DB source revisions (in the existing preparation RPC) enforce freshness.
const host = globalThis as typeof globalThis & { __careerChatInputs?: Map<string, Entry> };
const cache = host.__careerChatInputs ??= new Map<string, Entry>();
const retentionMs = 5 * 60_000;
const keyFor = (userId: string, conversationId: string) => `${userId}:${conversationId}`;
function cached(userId: string, conversationId: string) {
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
  return cache.get(keyFor(userId, conversationId));
}
function revisions(entry?: Entry) {
  return entry ? { settingRevision: entry.settingRevision, gmailRevision: entry.gmailRevision,
    historyRevision: entry.historyRevision, summaryId: entry.summaryId, cursor: entry.cursor } : {};
}
function merge(userId: string, conversationId: string, previous: Entry | undefined, data: any): CareerChatInputs {
  const messages = data.resetHistory ? data.messages : [...(previous?.messages ?? []), ...(data.messages ?? [])];
  const value: Entry = {
    conversation: data.conversation,
    setting: Object.hasOwn(data, "setting") ? data.setting : previous!.setting,
    gmail: Object.hasOwn(data, "gmail") ? data.gmail : previous!.gmail,
    settingRevision: data.settingRevision, gmailRevision: data.gmailRevision,
    historyRevision: data.historyRevision ?? previous?.historyRevision,
    summaryId: data.summaryId ?? previous?.summaryId,
    summary: data.resetHistory ? data.summary : previous?.summary ?? null,
    messages,
    cursor: messages.reduce((max: number, row: TalentMessageRow) => Math.max(max, row.id), data.resetHistory ? 0 : previous?.cursor ?? 0),
    expiresAt: Date.now() + retentionMs,
  };
  // Concurrent readers can replace the cache with an older snapshot. That is
  // safe: each later RPC validates revisions and reads everything after its cursor.
  cache.set(keyFor(userId, conversationId), value);
  console.info("[career-input-cache]", JSON.stringify({ userId, conversationId,
    settingReused: !Object.hasOwn(data, "setting"), gmailReused: !Object.hasOwn(data, "gmail"),
    historyReset: data.resetHistory ?? null, appendedMessages: data.messages?.length ?? 0 }));
  return structuredClone(value);
}

export async function readCareerChatInputs(args: { admin: TalentAdminClient; userId: string; conversationId: string; history?: boolean }) {
  const startedAt = Date.now();
  const previous = cached(args.userId, args.conversationId);
  const { data, error } = await (args.admin.rpc as any)("read_career_chat_inputs", {
    p_user_id: args.userId, p_conversation_id: args.conversationId, p_cached: revisions(previous), p_history: args.history ?? true,
  });
  if (error) throw error;
  console.info("[career-input-read]", JSON.stringify({ kind: "session-or-route", elapsedMs: Date.now() - startedAt }));
  return merge(args.userId, args.conversationId, previous, data);
}

export async function readCareerInboxContext(args: { admin: TalentAdminClient; userId: string; conversationId: string }, invocationId: string) {
  const startedAt = Date.now();
  const previous = cached(args.userId, args.conversationId);
  const { data, error } = await (args.admin.rpc as any)("read_career_inbox_context", {
    p_user_id: args.userId, p_conversation_id: args.conversationId, p_invocation_id: invocationId, p_cached: revisions(previous),
  });
  if (error) throw error;
  console.info("[career-input-read]", JSON.stringify({ kind: "inbox", invocationId, elapsedMs: Date.now() - startedAt }));
  return { inbox: data.inbox as CareerInboxSnapshot, context: merge(args.userId, args.conversationId, previous, data.context) };
}
