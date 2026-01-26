// lib/messages.ts
import { supabase } from "@/lib/supabase";
import type { ChatMessage } from "@/types/chat";

const ID_ROLE = ["user", "assistant"] as const;
const ROLE_ID = {
  user: 0 as const,
  assistant: 1 as const,
} as const;

type ScopeParams =
  | { queryId: string; candidId?: never }
  | { candidId: string; queryId?: never };

type FetchMessageParams = ScopeParams & { userId: string };

export async function fetchMessages(params: FetchMessageParams) {
  let q = supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: true });

  if ("queryId" in params && params.queryId)
    q = q.eq("query_id", params.queryId);
  if ("candidId" in params && params.candidId)
    q = q.eq("candid_id", params.candidId);

  const { data, error } = await q;
  if (error) throw error;

  return (
    data?.map((r: any) => ({
      id: r.id,
      role: ID_ROLE[r.role ?? 0],
      content: r.content ?? "",
      createdAt: r.created_at,
    })) ?? []
  );
}

type InsertMessageParams = ScopeParams & {
  userId: string;
  role: "user" | "assistant";
  content: string;
};

export async function insertMessage(args: InsertMessageParams) {
  const payload: any = {
    user_id: args.userId,
    role: ROLE_ID[args.role],
    content: args.content,
  };

  if ("queryId" in args) payload.query_id = args.queryId;
  if ("candidId" in args) payload.candid_id = args.candidId;

  const { data, error } = await supabase
    .from("messages")
    .insert(payload)
    .select("id, role, content, created_at")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    role: ID_ROLE[data.role ?? 0],
    content: data.content ?? "",
  } satisfies ChatMessage;
}

export async function updateMessageContent(args: {
  id: number;
  content: string;
}) {
  const { error } = await supabase
    .from("messages")
    .update({ content: args.content })
    .eq("id", args.id);

  if (error) throw error;
}
