import type { SupabaseClient } from "@supabase/supabase-js";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { z } from "zod";
import { assertCareerTurnActive } from "../turnCancellation.server";

const record = z.record(z.unknown());
export const operationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable(),
  kind: z.string(),
  parent_id: z.string().uuid().nullable(),
  idempotency_key: z.string(),
  status: z.string(),
  revision: z.number(),
  request: record,
  result: record,
  provider_refs: record,
  created_at: z.string(),
  updated_at: z.string(),
});
export type ExternalOperation = z.infer<typeof operationSchema>;
export type ExternalToolContext = {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  userMessageId?: number;
  workId?: string;
  workRevision?: number;
  claimId?: string;
  requestId: string;
  signal?: AbortSignal;
  /** Request budget; yielding observation preserves the already dispatched run. */
  deadlineAt?: number;
  /** Set only by the authenticated viewer endpoint, never from model arguments. */
  controlSource?: "user";
};
const client = (admin: TalentAdminClient) => admin as unknown as SupabaseClient;
export const assertExternalToolActive = (context: ExternalToolContext) =>
  assertCareerTurnActive({ ...context, sourceMessageId: context.userMessageId });
export async function readOperation(
  context: Pick<ExternalToolContext, "admin" | "userId">,
  id: string
) {
  const { data, error } = await client(context.admin)
    .from("talent_external_operations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("id", z.string().uuid().parse(id))
    .maybeSingle();
  if (error) throw new Error("External operation unavailable");
  return data ? operationSchema.parse(data) : null;
}
export async function listOperations(
  context: Pick<ExternalToolContext, "admin" | "userId">,
  filter: { conversationId?: string; parentId?: string; kind?: string }
) {
  let query = client(context.admin)
    .from("talent_external_operations")
    .select("*")
    .eq("user_id", context.userId)
    .order("created_at", { ascending: false });
  if (filter.conversationId)
    query = query.eq("conversation_id", filter.conversationId);
  if (filter.parentId) query = query.eq("parent_id", filter.parentId);
  if (filter.kind) query = query.eq("kind", filter.kind);
  const { data, error } = await query;
  if (error) throw new Error("External operations unavailable");
  return z.array(operationSchema).parse(data ?? []);
}
export async function createOperation(
  context: ExternalToolContext,
  args: {
    kind: string;
    parentId?: string;
    idempotencyKey: string;
    request: Record<string, unknown>;
  }
) {
  await assertExternalToolActive(context);
  const { data, error } = await client(context.admin).rpc(
    "create_talent_external_operation",
    {
      p_user_id: context.userId,
      p_conversation_id: context.conversationId,
      p_kind: args.kind,
      p_parent_id: args.parentId ?? null,
      p_idempotency_key: args.idempotencyKey,
      p_request: {
        ...args.request,
        source_message_id: context.userMessageId ?? null,
        work_id: context.workId ?? null,
      },
    }
  );
  if (error)
    throw new Error(
      "External operation could not be reserved; read its current state before retrying"
    );
  return operationSchema.parse(Array.isArray(data) ? data[0] : data);
}
export async function updateOperation(
  context: Pick<ExternalToolContext, "admin" | "userId">,
  operation: ExternalOperation,
  changes: Partial<
    Pick<ExternalOperation, "status" | "result" | "request" | "provider_refs">
  >
) {
  const { data, error } = await client(context.admin)
    .from("talent_external_operations")
    .update({
      ...changes,
      revision: operation.revision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", operation.id)
    .eq("user_id", context.userId)
    .eq("revision", operation.revision)
    .select("*")
    .maybeSingle();
  if (error || !data)
    throw new Error("External operation changed; read its current state");
  return operationSchema.parse(data);
}
/** References prove ownership, not the meaning of consent. The conversation model judges that meaning. */
export async function readAuthorizationMessages(
  context: ExternalToolContext,
  refs: number[]
) {
  const ids = [...new Set(refs)];
  if (!ids.length) return [];
  const { data, error } = await context.admin
    .from("talent_messages")
    .select("id,content,payload")
    .eq("user_id", context.userId)
    .eq("role", "user")
    .in("id", ids);
  if (error || data?.length !== ids.length)
    throw new Error(
      "Authorization message is unavailable or belongs to another user"
    );
  return data.map((row) => ({
    id: row.id,
    content: row.content,
    payload: row.payload,
  }));
}
