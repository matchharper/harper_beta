import "server-only";

import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { ASHLEY_NOTE } from "./ashleyAgent";
import type { ConversationStore } from "./conversation";
import type { AgentEvent } from "./types";
import { history } from "./conversation.server";
import {
  MAIL_CONVERSATION_PAYLOAD_KEY,
  introQuestions,
  moveMailConversation,
  type MailPosting,
  type SignupMoveDeps,
  type SignupNext,
} from "./signupMove";

/** The entry record Harper's prompt reads ("들어온 이유"), shared with /jobs sign-ups (officialJobs/index.ts). */
const ENTRY_EVENT = "official_jobs_signup_intent";
// gtm_* tables and jsonb paths are not in the generated Database types.
type Untyped = { from: (table: string) => any };
const untyped = (admin: TalentAdminClient) => admin as unknown as Untyped;

/** The reply pipeline's ConversationStore.history (conversation.server.ts): every mail with one address, time order. */
function conversationHistory(): ConversationStore["history"] | null {
  return history;
}

export function signupMoveDeps(admin: TalentAdminClient, history: ConversationStore["history"] | null, locale: "ko" | "en"): SignupMoveDeps {
  const db = untyped(admin);
  return {
    async readMail(mailId) {
      const { data, error } = await db.from("gtm_mails").select("id,campaign,audience,status,provider_message_id,to_email,postings")
        .eq("id", mailId).maybeSingle();
      if (error) throw error;
      const row = data as { id: string; campaign: string; audience: string; status: string; provider_message_id: string | null;
        to_email: string | null; postings: MailPosting[] | null } | null;
      const wentOut = row && (row.status === "sent" || (row.status === "sending" && Boolean(row.provider_message_id?.trim())));
      if (!row || row.campaign !== "agent" || row.audience !== "candidate" || !wentOut || !row.to_email) return null;
      return { id: row.id, toEmail: row.to_email, postings: Array.isArray(row.postings) ? row.postings : [] };
    },
    async readAccount(userId) {
      // From Auth itself, not the request's token: the verified flag must be the real one.
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) throw error;
      return data.user ? { email: data.user.email ?? null, emailConfirmed: Boolean(data.user.email_confirmed_at) } : null;
    },
    history,
    async conversationId(userId, preferred) {
      if (preferred) {
        const { data, error } = await admin.from("talent_conversations").select("id").eq("id", preferred).eq("user_id", userId).maybeSingle();
        if (error) throw error;
        if (data) return String(data.id);
      }
      const { data, error } = await admin.from("talent_conversations").select("id").eq("user_id", userId)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (data) return String(data.id);
      // A brand-new account: the same row /api/talent/session would create, so onboarding continues on it.
      const now = new Date().toISOString();
      const { data: inserted, error: insertError } = await admin.from("talent_conversations")
        .insert({ user_id: userId, stage: "profile", relief_nudge_sent: false, created_at: now, updated_at: now }).select("id").single();
      if (insertError) throw insertError;
      return String(inserted.id);
    },
    async movedAlready(userId, address) {
      const { data, error } = await db.from("talent_messages").select("id").eq("user_id", userId).eq("message_type", "system")
        .eq(`payload->${MAIL_CONVERSATION_PAYLOAD_KEY}->>address`, address).limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
    async insertBlock(row) {
      const { error } = await db.from("talent_messages").insert({
        conversation_id: row.conversationId, user_id: row.userId, role: "assistant", content: row.content,
        message_type: "system", payload: row.payload,
      });
      if (error) throw error;
    },
    async intentSummaries(userId, source) {
      const { data, error } = await db.from("talent_activity_events").select("summary").eq("talent_id", userId)
        .eq("event_type", ENTRY_EVENT).eq("source", source).limit(20);
      if (error) throw error;
      return ((data ?? []) as Array<{ summary: string | null }>).map((row) => row.summary ?? "");
    },
    async recordIntent(row) {
      const { insertTalentActivityEvent } = await import("@/lib/talentOnboarding/activityEvents");
      await insertTalentActivityEvent({
        admin, userId: row.userId, conversationId: row.conversationId, eventType: ENTRY_EVENT, source: row.source,
        summary: row.summary, changedDomains: ["official_job_intent", "onboarding"], impactLevel: "high",
      });
    },
    async offeredPostings(mailId) {
      const { data, error } = await db.from("gtm_agent_people").select("events").eq("mail_id", mailId).limit(1).maybeSingle();
      if (error) throw error;
      const events = Array.isArray((data as { events?: unknown } | null)?.events) ? (data as { events: AgentEvent[] }).events : [];
      return [...new Set(events.flatMap((event) => (event?.kind === "note" && event.note?.startsWith(ASHLEY_NOTE.searched) && Array.isArray(event.postings)
        ? event.postings.filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url)) : [])))].slice(0, 8);
    },
    async addPosting(userId, url) {
      const { gtmImportablePostingUrl } = await import("../candidateMail.server");
      const importable = gtmImportablePostingUrl(url);
      if (!importable) return;
      const { importCareerJobLink } = await import("@/lib/career/jobLinkImportServer");
      try {
        await importCareerJobLink({ admin, talentId: userId, url: importable, savedStage: null, preserveExistingProgress: true, locale });
      } catch (error) {
        // Closed, blocked or unreadable postings are expected, as in the mail claim.
        const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
        if (!/closed|unavailable|blocked|Test-only|job_details_required/i.test(message)) throw error;
      }
    },
  };
}

/**
 * The sign-up hook (auth bootstrap, onboarding submit, the mail link's claim): records why the person came and moves
 * the mail conversation into Harper when the account is the mail's recipient. Never throws: sign-up must go on.
 */
export async function runGtmSignupMove(args: {
  admin: TalentAdminClient; userId: string; mailId: string; next: SignupNext; locale: "ko" | "en"; conversationId?: string | null;
}) {
  try {
    const deps = signupMoveDeps(args.admin, conversationHistory(), args.locale);
    const moved = await moveMailConversation(deps, args);
    // The mail's own recipient joined: the join is recorded on the pairs whose company was promised "once they join,
    // I'll connect you", and Ashley's tick tells the company (ashleyAgent.ts tellJoinedCompanies; no person needed).
    if (moved.status !== "not_found" && moved.status !== "other_address") {
      const { noteJoinedRelays } = await import("./ashleyHandoff.server");
      await noteJoinedRelays(args.mailId);
    }
    return moved;
  } catch (error) {
    console.error("[gtm-agent] signup move failed", args.mailId, error);
    return null;
  }
}

/** Questions the person asked a customer company through Ashley, for that company's 09:00 Slack intro. */
export async function readGtmIntroQuestions(admin: TalentAdminClient, talentIds: readonly string[]) {
  const rows: Array<{ talent_id: string; source: string | null; summary: string | null }> = [];
  // Chunked like the intro's own id filters, so the request URL stays short.
  for (let start = 0; start < talentIds.length; start += 80) {
    const { data, error } = await untyped(admin).from("talent_activity_events").select("talent_id,source,summary")
      .in("talent_id", talentIds.slice(start, start + 80)).eq("event_type", ENTRY_EVENT).like("source", "gtm_agent_mail:%")
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    rows.push(...((data ?? []) as Array<{ talent_id: string; source: string | null; summary: string | null }>));
  }
  return introQuestions(rows);
}
