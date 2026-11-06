import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

/** Confirmed Career delivery is an existing conversation, not interview completion. */
export async function hasDeliveredCareerContact(args: {
  admin: TalentAdminClient;
  userId: string;
  replyAlias?: string;
  conversationId?: string;
}) {
  if (args.conversationId) {
    const { data, error } = await args.admin.from("talent_messages").select("id")
      .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
      .eq("role", "assistant").eq("message_type", "mail")
      .not("payload->>discoveryRunId", "is", null).order("id", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return false;
    // An explicit later onboarding submission owns the interview again.
    const resumed = await args.admin.from("talent_messages").select("id")
      .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
      .eq("role", "user").eq("message_type", "profile_submit")
      .order("id", { ascending: false }).limit(1).maybeSingle();
    if (resumed.error) throw resumed.error;
    return !resumed.data || Number(resumed.data.id) < Number(data.id);
  }
  let query = (args.admin.from as any)("career_email_messages").select("id")
    .eq("talent_id", args.userId).eq("direction", "outbound")
    .eq("status", "sent").eq("mail_type", "career_agent");
  if (args.replyAlias) query = query.contains("metadata", { replyTo: args.replyAlias });
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
