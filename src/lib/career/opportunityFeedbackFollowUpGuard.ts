import { TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST } from "@/lib/talentOnboarding/onboarding";
import type { TalentAdminClient } from "@/lib/talentOnboarding/server";

const USER_AUTHORED_CHAT_MESSAGE_TYPES = [
  "chat",
  TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST,
];

// Opportunity feedback notes also use role="user", so message type is the
// authoritative boundary between an action log and a real user chat turn.

export async function fetchLatestUserAuthoredChatMessageId(args: {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_messages")
    .select("id")
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .eq("role", "user")
    .in("message_type", USER_AUTHORED_CHAT_MESSAGE_TYPES)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read latest user chat message");
  }

  return typeof data?.id === "number" ? data.id : null;
}

export async function hasUserAuthoredChatMessageAfter(args: {
  admin: TalentAdminClient;
  after: string;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_messages")
    .select("id")
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .eq("role", "user")
    .in("message_type", USER_AUTHORED_CHAT_MESSAGE_TYPES)
    .gt("created_at", args.after)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read newer user chat message");
  }

  return Boolean(data);
}
