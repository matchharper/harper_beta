import { InternalApiError } from "@/lib/internalApi";
import { buildCareerTextChatDebugPrompt } from "@/lib/career/debugPrompts";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import type { CareerLlmMapExample } from "./types";

/**
 * Rebuilds one real text-chat input for the chosen talent, read-only, so the map can
 * show what its data blocks actually contain. No model call or write happens here.
 */
export async function buildCareerLlmMapExample(email: string): Promise<CareerLlmMapExample> {
  const admin = getTalentSupabaseAdmin();
  const { data: talent, error } = await admin
    .from("talent_users")
    .select("user_id")
    .eq("email", email)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!talent?.user_id) throw new InternalApiError(404, `${email}에 해당하는 talent_user가 없습니다.`);

  const { data: conversation, error: conversationError } = await admin
    .from("talent_conversations")
    .select("id")
    .eq("user_id", talent.user_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conversationError) throw new Error(conversationError.message);
  if (!conversation?.id) throw new InternalApiError(404, `${email}의 Career 대화가 없습니다.`);

  const payload = await buildCareerTextChatDebugPrompt({
    admin,
    conversationId: conversation.id,
    timeZone: "Asia/Seoul",
    userId: talent.user_id,
  });
  return {
    email,
    conversationId: conversation.id,
    builtAt: new Date().toISOString(),
    blocks: payload.promptBlocks.map(block => ({ key: block.key, text: block.text })),
    history: (payload.messages ?? []).map(message => `[${message.role}]\n${message.content}`).join("\n\n"),
  };
}
