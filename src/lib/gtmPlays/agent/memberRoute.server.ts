import "server-only";

import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { ASHLEY_INBOX_VIA, type AshleyThreadContext } from "@/lib/career/mailStartedTurn";
import type { ConversationMessage, HistoryEntry } from "./conversation";

/**
 * After sign-up, a reply to an Ashley mail belongs to Harper, not Ashley (design §2: 가입 전까지는 Ashley, 가입 뒤는 하퍼).
 * The member email path (email/runtime/reply.ts processEmailReply) cannot take it: it reads the mail from Resend by
 * the inbound event's provider id, and these mails were read from Ashley's Gmail. So the mail goes into the member's
 * Harper chat as an inbound mail (role user, type mail). For a member past onboarding (or continuing Career after
 * a delivered contact, as the chat route admits them: api/talent/chat/route.ts), it goes in through the chat's own
 * durable request (admit_career_request, once per mail) and Harper answers it there right away (Shaun 11/23 "바로
 * 처리"): the request queues Harper's turn, which is dispatched now. That turn acts toward no one
 * (career/mailStartedTurn.ts); Ashley tells the person in the mail thread once Harper's answer is there
 * (ashleyAgent.ts sendMemberRedirects). A member still in onboarding has no such turn (its chat runs on the
 * onboarding path): the mail is only recorded, and Harper reads it when they come back.
 */

const BODY_MAX = 20_000;
/** Ashley's mail that goes with it for Harper (HistoryEntry texts are capped already), and the roles listed at most. */
const THREAD_MAIL_MAX = 4_000;
const THREAD_POSTINGS_MAX = 8;

export type MemberRouteDeps = {
  /** The Harper member signed in with this address; null when none. Throws when two accounts share it. */
  findMember(address: string): Promise<{ userId: string } | null>;
  conversationId(userId: string): Promise<string>;
  alreadyRouted(userId: string, messageId: string): Promise<boolean>;
  /** The address's mail history (conversation.server.ts history), for the Ashley mail it answers. */
  threadHistory(message: ConversationMessage): Promise<HistoryEntry[]>;
  /** Whether the member's chat takes durable turns (onboarding done, or continuing Career after a delivered contact). */
  careerReady(userId: string, conversationId: string): Promise<boolean>;
  /** The mail as the chat's durable request (one per clientRequestId), which queues Harper's turn. */
  admitMail(row: MemberMailRow): Promise<void>;
  /** The mail as a plain chat row (no turn): a member still in onboarding. */
  insertMail(row: MemberMailRow): Promise<void>;
  /** Hands the queued turn to Harper's runner now (a failure is logged: the turn stays queued and a later tick hands it again). */
  dispatch(userId: string, conversationId: string): Promise<void>;
};

type MemberMailRow = { userId: string; conversationId: string; content: string; payload: Record<string, unknown> };

/** The chat request's identity of a routed mail (admit_career_request keeps one row per identity). */
export const memberMailRequestId = (messageId: string) => `gtm-agent-mail:${messageId}`;

/**
 * What Harper reads with the mail (payload.ashleyThread; career/mailStartedTurn.ts ashleyInboxMailForModel): the last
 * mail from Ashley's mailbox in its thread before it, and the roles her mails there named. null: none found.
 */
export function ashleyThreadContext(entries: readonly HistoryEntry[], message: Pick<ConversationMessage, "occurredAt" | "rootMailId">): AshleyThreadContext | null {
  const at = Date.parse(message.occurredAt);
  const ours = entries.filter((entry) => entry.author !== "counterpart" && entry.kind !== "company" && Date.parse(entry.at) <= at
    && (!message.rootMailId || entry.threadKey === message.rootMailId));
  const last = ours[ours.length - 1];
  if (!last) return null;
  const seen = new Set<string>();
  const postings = ours.flatMap((entry) => entry.postings).filter((posting) => {
    const key = (posting.url ?? `${posting.companyName}|${posting.title}`).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(-THREAD_POSTINGS_MAX).map((posting) => ({
    companyName: posting.companyName, title: posting.title, url: posting.url, ...(posting.roleId ? { roleId: posting.roleId } : {}),
  }));
  return { mail: last.text.trim() ? { subject: last.subject, text: last.text.trim().slice(0, THREAD_MAIL_MAX) } : null, postings };
}

/** The chat text of a routed mail: where it went, then the new text (quotes cut by the reply pipeline). */
export function memberMailContent(message: Pick<ConversationMessage, "subject" | "newText" | "bodyText">) {
  const text = (message.newText.trim() || message.bodyText.trim()).slice(0, BODY_MAX);
  const subject = message.subject.trim();
  return `[Email reply to Ashley's mail${subject ? ` "${subject}"` : ""}, passed to Harper]\n${text}`;
}

export async function routeToMemberWith(deps: MemberRouteDeps, message: ConversationMessage): Promise<"answering" | "recorded" | "already_recorded"> {
  if (message.direction !== "inbound" || message.author !== "counterpart" || message.counterpartKind !== "candidate") {
    throw new Error("routeToMember takes a candidate's inbound mail only");
  }
  const address = message.counterpartEmail.trim().toLowerCase();
  const member = address ? await deps.findMember(address) : null;
  if (!member) throw new Error("No Harper member signed in with this address");
  if (await deps.alreadyRouted(member.userId, message.id)) return "already_recorded";
  const conversationId = await deps.conversationId(member.userId);
  // Without it Harper cannot tell which role "the role" is; a failed read routes the mail anyway.
  const thread = await deps.threadHistory(message).then((entries) => ashleyThreadContext(entries, message), (error) => {
    console.error("[gtm-agent] member mail routed without Ashley's mail", message.id, error instanceof Error ? error.message : String(error));
    return null;
  });
  const row: MemberMailRow = {
    userId: member.userId,
    conversationId,
    content: memberMailContent(message),
    payload: {
      gtmAgentMessageId: message.id, gmailMessageId: message.gmailMessageId, rfcMessageId: message.rfcMessageId,
      subject: message.subject, receivedAt: message.occurredAt, via: ASHLEY_INBOX_VIA, ...(thread ? { ashleyThread: thread } : {}),
    },
  };
  if (!(await deps.careerReady(member.userId, conversationId))) {
    await deps.insertMail(row);
    return "recorded";
  }
  await deps.admitMail({ ...row, payload: { ...row.payload, clientRequestId: memberMailRequestId(message.id) } });
  await deps.dispatch(member.userId, conversationId).catch((error) => {
    console.error("[gtm-agent] member mail recorded, Harper's turn not handed over yet (the Career dispatcher takes it)", member.userId,
      message.id, error instanceof Error ? error.message : String(error));
  });
  return "answering";
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
    async threadHistory(message) {
      const { history } = await import("./conversation.server");
      return history(message.counterpartEmail, message.rootMailId ? { threadKey: message.rootMailId } : {});
    },
    async careerReady(userId, conversationId) {
      const { data, error } = await admin.from("talent_setting").select("is_onboarding_done").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if ((data as { is_onboarding_done?: boolean } | null)?.is_onboarding_done === true) return true;
      const { hasDeliveredCareerContact } = await import("@/lib/career/background/contactHistory");
      return hasDeliveredCareerContact({ admin, userId, conversationId });
    },
    async insertMail(row) {
      const { error } = await db.from("talent_messages").insert({
        conversation_id: row.conversationId, user_id: row.userId, role: "user", content: row.content, message_type: "mail",
        payload: row.payload,
      });
      if (error) throw error;
    },
    async admitMail(row) {
      const { error } = await (admin.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>)(
        "admit_career_request", {
          p_user_id: row.userId, p_conversation_id: row.conversationId, p_content: row.content, p_message_type: "mail",
          p_payload: row.payload, p_is_mobile: null,
        },
      );
      if (error) throw error;
    },
    async dispatch(userId, conversationId) {
      const { publishCareerInvocations } = await import("@/lib/career/work/invocations");
      await publishCareerInvocations({ admin, userId, conversationId });
    },
  };
}

/** For the Ashley reply pipeline (injected there): a signed-up person's reply to an Ashley mail goes to Harper. */
export async function routeToMember(message: ConversationMessage): Promise<void> {
  const { getTalentSupabaseAdmin } = await import("@/lib/talentOnboarding/admin");
  await routeToMemberWith(memberRouteDeps(getTalentSupabaseAdmin()), message);
}
