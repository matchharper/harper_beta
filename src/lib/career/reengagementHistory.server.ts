import "server-only";

import { stripCareerReengagementActions } from "@/lib/career/reengagementActions";
import type { TalentAdminClient } from "@/lib/talentOnboarding/server";

export const CAREER_REENGAGEMENT_HISTORY_LIMIT = 3;
export const CAREER_REENGAGEMENT_MESSAGE_PAYLOAD = {
  kind: "session_reengagement",
} as const;

const normalizeHistoryMessage = (value: unknown) => {
  const content =
    typeof value === "string" ? stripCareerReengagementActions(value) : "";
  return content.replace(/\s+/g, " ").trim().slice(0, 2000);
};

export async function fetchCareerReengagementHistory(args: {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_messages")
    .select("id, content")
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .eq("role", "assistant")
    .eq("message_type", "chat")
    .contains("payload", CAREER_REENGAGEMENT_MESSAGE_PAYLOAD)
    .order("id", { ascending: false })
    .limit(CAREER_REENGAGEMENT_HISTORY_LIMIT);

  if (error) {
    throw new Error(
      error.message ?? "Failed to load recent career re-engagement history"
    );
  }

  return (data ?? [])
    .slice()
    .reverse()
    .map((row) => normalizeHistoryMessage(row.content))
    .filter(Boolean);
}
