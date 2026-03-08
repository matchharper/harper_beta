import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export const TALENT_FIRST_VISIT_TEXT = [
  "처음 방문하신걸 환영합니다.",
  "",
  "<< 하퍼는 숨은 글로벌/딥테크 기회를 먼저 제안하고, 후보자 관점에서 조건 협상을 도와주는 장점이 있습니다. >>",
  "",
  "대화를 시작하기에 앞서, 회원님의 기본 정보를 파악하고 더 좋은 기회를 찾아드리기 위해서 몇 가지 정보를 알려주시면 그걸 기반으로 시작해보겠습니다.",
  "",
  "제출을 해주신다음에는 5~10분 정도의 대화가 시작됩니다.",
  "",
  "대화는 평균 10분 정도 소요되며, 그 전에도 언제든지 원할 때 중지할 수 있습니다. 다음에 다시 접속하셔서 더 많은 내용을 알려주세요.",
].join("\n");

export type TalentConversationRow = {
  id: string;
  user_id: string;
  stage: "profile" | "chat" | "completed";
  title: string | null;
  resume_file_name: string | null;
  resume_text: string | null;
  resume_links: string[] | null;
  relief_nudge_sent: boolean | null;
  created_at: string;
  updated_at: string;
};

export type TalentUserProfileRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  profile_picture: string | null;
  resume_file_name: string | null;
  resume_storage_path: string | null;
  resume_text: string | null;
  resume_links: string[] | null;
  created_at: string;
  updated_at: string;
};

export type TalentMessageRow = {
  id: number;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  message_type: string | null;
  created_at: string;
};

export const TALENT_RESUME_BUCKET = "talent-resumes";
export const TALENT_PENDING_QUESTION_PREFIX = "__PENDING_Q__::";

export function isPendingQuestionContent(content: string | null | undefined) {
  if (!content) return false;
  return content.startsWith(TALENT_PENDING_QUESTION_PREFIX);
}

export function stripPendingQuestionPrefix(content: string) {
  if (!isPendingQuestionContent(content)) return content;
  return content.slice(TALENT_PENDING_QUESTION_PREFIX.length).trim();
}

function readEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getTalentSupabaseAdmin() {
  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  }

  return createClient(supabaseUrl, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function toTalentDisplayName(user: User) {
  return (
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    (typeof user.email === "string" ? user.email.split("@")[0] : null) ??
    "Candidate"
  );
}

export async function ensureTalentUserRecord(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  user: User;
}) {
  const { admin, user } = args;
  const payload = {
    user_id: user.id,
    email: user.email ?? null,
    name: toTalentDisplayName(user),
    profile_picture: user.user_metadata?.avatar_url ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("talent_users")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    throw new Error(error.message ?? "Failed to upsert talent_users");
  }
}

export async function fetchMessages(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
}) {
  const { admin, conversationId } = args;
  const { data, error } = await admin
    .from("talent_messages")
    .select(
      "id, conversation_id, user_id, role, content, message_type, created_at"
    )
    .eq("conversation_id", conversationId)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_messages");
  }

  return (data ?? []) as TalentMessageRow[];
}

export async function fetchRecentMessages(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
  limit?: number;
}) {
  const { admin, conversationId, limit = 24 } = args;
  const { data, error } = await admin
    .from("talent_messages")
    .select(
      "id, conversation_id, user_id, role, content, message_type, created_at"
    )
    .eq("conversation_id", conversationId)
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message ?? "Failed to load recent talent_messages");
  }

  return ((data ?? []) as TalentMessageRow[]).reverse();
}

export async function countUserChatTurns(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
}) {
  const { admin, conversationId } = args;
  const { count, error } = await admin
    .from("talent_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .eq("message_type", "chat");

  if (error) {
    throw new Error(error.message ?? "Failed to count user chat turns");
  }

  return count ?? 0;
}

export async function fetchTalentUserProfile(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  userId: string;
}) {
  const { admin, userId } = args;
  const { data, error } = await admin
    .from("talent_users")
    .select(
      "user_id, email, name, profile_picture, resume_file_name, resume_storage_path, resume_text, resume_links, created_at, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_users profile");
  }

  return (data ?? null) as TalentUserProfileRow | null;
}

export async function getTalentResumeSignedUrl(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  storagePath: string | null | undefined;
  expiresIn?: number;
}) {
  const { admin, storagePath, expiresIn = 3600 } = args;
  if (!storagePath) return null;

  const { data, error } = await admin.storage
    .from(TALENT_RESUME_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    return null;
  }
  return data?.signedUrl ?? null;
}
