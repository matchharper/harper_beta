import "server-only";

import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { ConversationMessage } from "./conversation";

/**
 * After sign-up, a reply to an Ashley mail belongs to Harper, not Ashley (design §2: 가입 전까지는 Ashley, 가입 뒤는 하퍼).
 * The member email path (email/runtime/reply.ts processEmailReply) cannot take it: it reads the mail from Resend by
 * the inbound event's provider id, and these mails were read from Ashley's Gmail. So the mail is recorded in the
 * member's Harper chat, as the member path records an inbound mail (role user, type mail), and nothing is sent: Harper
 * picks it up the next time it runs for them (their chat, a scheduled check).
 */

const BODY_MAX = 20_000;

export type MemberRouteDeps = {
  /** The Harper member signed in with this address; null when none. Throws when two accounts share it. */
  findMember(address: string): Promise<{ userId: string } | null>;
  conversationId(userId: string): Promise<string>;
  alreadyRouted(userId: string, messageId: string): Promise<boolean>;
  insertMail(row: { userId: string; conversationId: string; content: string; payload: Record<string, unknown> }): Promise<void>;
};

/** The chat text of a routed mail: where it went, then the new text (quotes cut by the reply pipeline). */
export function memberMailContent(message: Pick<ConversationMessage, "subject" | "newText" | "bodyText">) {
  const text = (message.newText.trim() || message.bodyText.trim()).slice(0, BODY_MAX);
  const subject = message.subject.trim();
  return `[Email reply to Ashley's mail${subject ? ` "${subject}"` : ""}, passed to Harper]\n${text}`;
}

export async function routeToMemberWith(deps: MemberRouteDeps, message: ConversationMessage): Promise<"recorded" | "already_recorded"> {
  if (message.direction !== "inbound" || message.author !== "counterpart" || message.counterpartKind !== "candidate") {
    throw new Error("routeToMember takes a candidate's inbound mail only");
  }
  const address = message.counterpartEmail.trim().toLowerCase();
  const member = address ? await deps.findMember(address) : null;
  if (!member) throw new Error("No Harper member signed in with this address");
  if (await deps.alreadyRouted(member.userId, message.id)) return "already_recorded";
  await deps.insertMail({
    userId: member.userId,
    conversationId: await deps.conversationId(member.userId),
    content: memberMailContent(message),
    payload: {
      gtmAgentMessageId: message.id, gmailMessageId: message.gmailMessageId, rfcMessageId: message.rfcMessageId,
      subject: message.subject, receivedAt: message.occurredAt, via: "ashley_inbox",
    },
  });
  return "recorded";
}

export function memberRouteDeps(admin: TalentAdminClient): MemberRouteDeps {
  // jsonb paths are not in the generated Database types.
  const db = admin as unknown as { from: (table: string) => any };
  return {
    async findMember(address) {
      const { data, error } = await admin.from("talent_users").select("user_id")
        .ilike("email", address.replace(/[\\%_]/g, "\\$&")).is("deleted_at", null).limit(2);
      if (error) throw error;
      if ((data ?? []).length > 1) throw new Error("Two Harper accounts share this address");
      return data?.[0] ? { userId: String(data[0].user_id) } : null;
    },
    async conversationId(userId) {
      // The member email path's own choice of conversation (latest, or a new chat one).
      const { ensureEmailConversation } = await import("@/lib/email/runtime/store");
      return ensureEmailConversation(admin, userId);
    },
    async alreadyRouted(userId, messageId) {
      const { data, error } = await db.from("talent_messages").select("id").eq("user_id", userId).eq("message_type", "mail")
        .eq("payload->>gtmAgentMessageId", messageId).limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
    async insertMail(row) {
      const { error } = await db.from("talent_messages").insert({
        conversation_id: row.conversationId, user_id: row.userId, role: "user", content: row.content, message_type: "mail",
        payload: row.payload,
      });
      if (error) throw error;
    },
  };
}

/** For the Ashley reply pipeline (injected there): a signed-up person's reply to an Ashley mail goes to Harper. */
export async function routeToMember(message: ConversationMessage): Promise<void> {
  const { getTalentSupabaseAdmin } = await import("@/lib/talentOnboarding/admin");
  await routeToMemberWith(memberRouteDeps(getTalentSupabaseAdmin()), message);
}
