import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { readCareerSourceTextChatModel, resolveCareerTextChatModel } from "./textChatModelConfig";

/** Server events reuse the last server-resolved choice recorded in this conversation. */
export async function readCareerConversationTextChatModel(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
}) {
  const { data, error } = await args.admin.from("talent_messages")
    .select("payload")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
    .not("payload->>careerTextChatModel", "is", null)
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return readCareerSourceTextChatModel(data?.payload) ?? resolveCareerTextChatModel(undefined);
}
