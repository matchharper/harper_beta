import "server-only";

import {
  GMAIL_READONLY_SCOPE, getGmailHeaders, getGmailHistoryId, getGmailMessage, gmailServiceAccountConfigured,
  isGmailNotFoundError, listGmailHistory, listInboxMessageIds, parseGmailMessage, type GmailAccess,
  type ParsedGmailMessage,
} from "@/lib/contentsEngine/gmail";
import { getResendEmail } from "@/lib/email/send";
import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { gtmRead, gtmWrite } from "../db.server";
import { gtmUnsubscribeToken, unsubscribeGtmMail } from "../mailSend.server";
import { cleanEmail } from "./people";
import {
  autoReplyReason, isUnsubscribeSubject, matchAgentBounce, matchAgentReply, matchAgentUnsubscribe, maybeDeliveryReport,
  normalizeMessageId, referencedMessageIds, REPLY_WINDOW_DAYS, replyExcerpt, replyMailboxes, replyReadingTroubles,
  stopRequestIn, type AgentSentMail, type ReplyReadingTrouble,
} from "./replies";
import { readAgentPerson, readAgentSettings, updateAgentPerson } from "./store.server";

/**
 * #5 replies, read from the team's Google Workspace mailboxes (agent/replies.ts has the rules). Agent mails go out
 * through Resend with Reply-To = the sender, so a candidate's answer lands in that person's Gmail. Each dispatcher
 * tick (/api/internal/gtm-agent/dispatch, before the agent's own steps so a reply stops this tick's follow-up)
 * reads, per mailbox (GTM_AGENT_REPLY_MAILBOXES plus the sender):
 * - the messages added since the mailbox's last Gmail history cursor (gtm_agent_mailboxes), or on the first run /
 *   when the cursor is too old the last BACKFILL_DAYS of INBOX (at most BACKFILL_MAX);
 * - each one's headers only (format metadata); the body is read only for a mail that matches an agent mail;
 * - a reply: the person becomes replied as with Ops' "답장 옴" (follow-up stopped, counts in 답장), with the start
 *   of the new text on the person (reply_text) and a timeline line "답장 옴 · 자동 (<mailbox>)". A reply asking not
 *   to be contacted (replies.ts stopRequestIn: "연락하지 마세요", "수신 거부", "unsubscribe", "remove me" …), the first
 *   or a later one, also puts the address on the shared opt-out list and ends the person, with a timeline line that
 *   quotes the words, as Ops' "연락 그만 요청" does.
 * - a mail titled "unsubscribe" (the mailto in every agent mail's List-Unsubscribe header) from an address an agent
 *   mail went to: the address on the opt-out list and the person ended, as the mail's opt-out link does.
 * - a permanent delivery failure report about an agent mail: the mail bounced (as Resend's bounce event), the
 *   address on the shared opt-out list, the person ended.
 * Applying is idempotent: a person moves to replied once (from sent or ended) and gets one opt-out line, so the same
 * Gmail message read again, or read in two mailboxes, changes nothing. The service account reads with domain-wide
 * delegation and the Gmail read-only scope; without it configured, or on any Gmail error, the tick goes on (kept on
 * the mailbox row, shown on /ops by agentHealth), and follow-ups wait until every mailbox reads again
 * (followUpsOnHold).
 */

const AGENT = "agent";
/** The whole sync's time (the tick's own work follows in the same request). */
const SYNC_BUDGET_MS = 25_000;
const BACKFILL_DAYS = 7;
const BACKFILL_MAX = 200;
/** Messages one mailbox reads in one sync at most (the newest ones). */
const MAX_MESSAGES = 300;
/** Gmail reads in parallel per mailbox (well within Gmail's per-user rate). */
const GMAIL_PARALLEL = 4;
/** Agent mails whose RFC Message-ID is asked from Resend per sync (gently: Resend's API rate is shared). */
const MESSAGE_ID_FILLS = 3;
const MESSAGE_ID_FILL_GAP_MS = 500;
/** After this long without a Message-ID from Resend, a mail is matched by its address only. */
const MESSAGE_ID_GIVE_UP_MS = 60 * 60_000;
/** How far back an "unsubscribe" mail finds the agent mail it is about (an opt-out counts however late it comes). */
const UNSUBSCRIBE_WINDOW_DAYS = 400;
/** The reply text read for a stop request (the person row keeps REPLY_EXCERPT_CHARS of it). */
const STOP_CHECK_CHARS = 2_000;
/** Labels whose messages are never replies to read. */
const SKIP_LABELS = new Set(["SENT", "DRAFT", "SPAM", "CHAT"]);

export type MailboxSync = {
  mailbox: string; read: number; replies: number; optOuts: number; bounces: number; automatic: number; error?: string;
};
export type ReplySync = { ran: boolean; reason?: string; mailboxes?: MailboxSync[] };

class SyncTimeout extends Error {
  constructor() {
    super("reply sync ran out of time");
  }
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error ?? "unknown error"));

/** Whether any agent mail went out within the reply window (no Gmail reads otherwise). */
async function recentAgentMail(): Promise<boolean> {
  const [row] = await gtmRead((sql) => sql<Array<{ any: boolean }>>`
    select exists (
      select 1 from public.gtm_mails where campaign = 'agent' and status = 'sent'
        and created_at > now() - make_interval(days => ${REPLY_WINDOW_DAYS}::int)
    ) as any
  `);
  return Boolean(row?.any);
}

/**
 * Agent mails whose RFC Message-ID (what a reply's In-Reply-To names) is not known yet: asked from Resend, a few per
 * sync. A mail Resend has none for after an hour is marked '' and matched by its address only.
 */
async function fillMessageIds(deadline: number) {
  const rows = await gtmRead((sql) => sql<Array<{ id: string; provider_message_id: string; created_at: string | Date }>>`
    select id::text as id, provider_message_id, created_at from public.gtm_mails
    where campaign = 'agent' and status = 'sent' and provider_message_id is not null and rfc_message_id is null
      and created_at > now() - make_interval(days => ${REPLY_WINDOW_DAYS}::int)
    order by created_at desc limit ${MESSAGE_ID_FILLS}::int
  `);
  for (const [index, row] of rows.entries()) {
    if (Date.now() > deadline) return;
    if (index) await new Promise((resolve) => setTimeout(resolve, MESSAGE_ID_FILL_GAP_MS));
    const email = await getResendEmail(row.provider_message_id);
    const id = normalizeMessageId(email.message_id);
    if (!id && Date.now() - new Date(row.created_at).getTime() < MESSAGE_ID_GIVE_UP_MS) continue;
    await gtmWrite((sql) => sql`
      update public.gtm_mails set rfc_message_id = ${id ?? ""} where id = ${row.id}::uuid and rfc_message_id is null
    `);
  }
}

/**
 * The agent mails that may be answered by these senders (sent within `windowDays`, the reply window by default) or
 * name these Message-IDs.
 */
async function agentMailsFor(
  emails: readonly string[], messageIds: readonly string[], windowDays = REPLY_WINDOW_DAYS + BACKFILL_DAYS,
): Promise<AgentSentMail[]> {
  if (!emails.length && !messageIds.length) return [];
  const rows = await gtmRead((sql) => sql<Array<{
    mail_id: string; person_id: string; to_email: string; rfc_message_id: string | null; subject: string;
    created_at: string | Date;
  }>>`
    select m.id::text as mail_id, m.agent_person_id::text as person_id, m.to_email, m.rfc_message_id, m.subject,
      m.created_at
    from public.gtm_mails m
    where m.campaign = 'agent' and m.status = 'sent' and m.agent_person_id is not null
      and ((m.to_email = any(${[...emails]}::text[])
          and m.created_at > now() - make_interval(days => ${windowDays}::int))
        or m.rfc_message_id = any(${[...messageIds]}::text[]))
    order by m.created_at desc limit 500
  `);
  return rows.map((row) => ({
    mailId: row.mail_id, personId: row.person_id, toEmail: row.to_email, rfcMessageId: row.rfc_message_id || null,
    subject: row.subject, sentAt: new Date(row.created_at).toISOString(),
  }));
}

async function readCursor(mailbox: string): Promise<string | null> {
  const [row] = await gtmRead((sql) => sql<Array<{ history_id: string | null }>>`
    select history_id from public.gtm_agent_mailboxes where email = ${mailbox}
  `);
  return row?.history_id ?? null;
}

/** Saves the mailbox's state: the new cursor after a full read, or only the error (the cursor stays) after a failed one. */
async function saveMailbox(mailbox: string, state: { historyId: string } | { error: string }) {
  const historyId = "historyId" in state ? state.historyId : null;
  const error = "error" in state ? state.error.slice(0, 1_000) : null;
  await gtmWrite((sql) => sql`
    insert into public.gtm_agent_mailboxes (email, history_id, last_synced_at, last_error, updated_at)
    values (${mailbox}, ${historyId}, ${historyId ? new Date() : null}, ${error}, now())
    on conflict (email) do update set
      history_id = coalesce(excluded.history_id, gtm_agent_mailboxes.history_id),
      last_synced_at = coalesce(excluded.last_synced_at, gtm_agent_mailboxes.last_synced_at),
      last_error = excluded.last_error, updated_at = now()
  `);
}

/** Runs `work` over `items`, `parallel` at a time, in order of results; stops (throws) when the deadline passes. */
async function mapBounded<T, R>(items: readonly T[], parallel: number, deadline: number, work: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, async () => {
    while (next < items.length) {
      if (Date.now() > deadline) throw new SyncTimeout();
      const index = next++;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}

/** A message read by id; null when Gmail no longer has it (deleted between listing and reading). */
async function readMessage(id: string, access: GmailAccess, format: "full" | "metadata") {
  try {
    return await getGmailMessage(id, access, format);
  } catch (error) {
    if (isGmailNotFoundError(error)) return null;
    throw error;
  }
}

/** The message ids to look at: since the cursor, or the recent INBOX when there is none or it is too old. */
async function listNewMessages(access: GmailAccess, cursor: string | null) {
  if (cursor) {
    try {
      const history = await listGmailHistory(cursor, access);
      return { historyId: history.latestHistoryId, ids: history.messageIds.slice(-MAX_MESSAGES) };
    } catch (error) {
      // Gmail keeps about a week of history: an older cursor is answered 404, and the recent INBOX is read instead.
      if (!isGmailNotFoundError(error)) throw error;
    }
  }
  // The cursor is taken before listing, so nothing that arrives meanwhile is missed next time.
  const historyId = await getGmailHistoryId(access);
  return { historyId, ids: await listInboxMessageIds(`newer_than:${BACKFILL_DAYS}d`, access, BACKFILL_MAX) };
}

type Inbound = { id: string; parsed: ParsedGmailMessage; kind: "reply" | "unsubscribe" | "report" };

/** One mailbox's new messages. `team`: every mailbox read (a teammate's mail in a thread is never the person's). */
async function syncMailbox(mailbox: string, deadline: number, team: ReadonlySet<string>): Promise<MailboxSync> {
  const result: MailboxSync = { mailbox, read: 0, replies: 0, optOuts: 0, bounces: 0, automatic: 0 };
  const access: GmailAccess = {
    mailbox, scopes: [GMAIL_READONLY_SCOPE], signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
  };
  try {
    const listed = await listNewMessages(access, await readCursor(mailbox));
    // Headers only: who sent it, the subject, the reply headers and the automatic-mail markers.
    const heads = await mapBounded(listed.ids, GMAIL_PARALLEL, deadline, (id) => readMessage(id, access, "metadata"));
    result.read = heads.filter(Boolean).length;
    const inbound: Inbound[] = [];
    for (const message of heads) {
      if (!message || message.labelIds?.some((label) => SKIP_LABELS.has(label))) continue;
      const parsed = parseGmailMessage(message);
      if (!parsed.fromEmail || parsed.fromEmail === mailbox || team.has(parsed.fromEmail.toLowerCase())) continue;
      const headers = getGmailHeaders(message);
      if (maybeDeliveryReport({ fromEmail: parsed.fromEmail, headers })) {
        inbound.push({ id: message.id, parsed, kind: "report" });
      } else if (isUnsubscribeSubject(parsed.subject)) {
        // Before the automatic-mail check: a mail app may mark the opt-out mail it sends as automatic.
        inbound.push({ id: message.id, parsed, kind: "unsubscribe" });
      } else if (autoReplyReason({ fromEmail: parsed.fromEmail, subject: parsed.subject, headers })) {
        result.automatic += 1;
      } else {
        inbound.push({ id: message.id, parsed, kind: "reply" });
      }
    }

    // Opt-out mails ("unsubscribe"): the headers say who, nothing else is read.
    const unsubscribes = inbound.filter((item) => item.kind === "unsubscribe");
    if (unsubscribes.length) {
      const mails = await agentMailsFor(
        [...new Set(unsubscribes.map((item) => item.parsed.fromEmail as string))],
        [...new Set(unsubscribes.flatMap((item) => referencedMessageIds(item.parsed.inReplyTo, item.parsed.references)))],
        UNSUBSCRIBE_WINDOW_DAYS,
      );
      for (const item of unsubscribes) {
        if (Date.now() > deadline) throw new SyncTimeout();
        const mail = matchAgentUnsubscribe(item.parsed, mails);
        const subject = item.parsed.subject.trim().slice(0, 60);
        if (mail && await recordOptOut(mail, `제목이 "${subject}"인 메일이 와서 연락 받지 않기 목록에 넣고 끝냈어요 · 자동 (${mailbox})`)) {
          result.optOuts += 1;
        }
      }
    }

    // Replies: matched on the headers, then the matched ones are read in full (the new text for the person, and
    // whether it asks not to be contacted again), oldest first.
    const replies = inbound.filter((item) => item.kind === "reply");
    const replyMails = await agentMailsFor(
      [...new Set(replies.map((item) => item.parsed.fromEmail as string))],
      [...new Set(replies.flatMap((item) => referencedMessageIds(item.parsed.inReplyTo, item.parsed.references)))],
    );
    const matched = [...replies]
      .sort((a, b) => a.parsed.receivedAt.localeCompare(b.parsed.receivedAt))
      .flatMap((item) => {
        const match = matchAgentReply(item.parsed, replyMails);
        return match ? [{ item, mail: match.mail }] : [];
      });
    for (const { item, mail } of matched) {
      if (Date.now() > deadline) throw new SyncTimeout();
      const full = await readMessage(item.id, access, "full");
      if (!full) continue;
      const outcome = await recordReply(mail, parseGmailMessage(full), mailbox);
      if (outcome.replied) result.replies += 1;
      if (outcome.optedOut) result.optOuts += 1;
    }

    // Delivery reports: read in full (the report part says which address failed and whether for good).
    for (const item of inbound.filter((entry) => entry.kind === "report")) {
      if (Date.now() > deadline) throw new SyncTimeout();
      const full = await readMessage(item.id, access, "full");
      const parsed = full ? parseGmailMessage(full) : null;
      if (!parsed?.deliveryFailure) continue;
      const recipient = parsed.deliveryFailure.finalRecipient;
      const mails = await agentMailsFor(recipient ? [recipient] : [], referencedMessageIds(parsed.inReplyTo, parsed.references));
      const mail = matchAgentBounce(parsed.deliveryFailure, parsed, mails);
      if (mail && await recordBounce(mail, parsed, mailbox)) result.bounces += 1;
    }

    await saveMailbox(mailbox, { historyId: listed.historyId });
    return result;
  } catch (error) {
    // The cursor stays where it was, so the next tick reads these messages again (applying is idempotent).
    const message = errorText(error);
    console.warn("[gtm-agent] reply sync", mailbox, message.slice(0, 300));
    await saveMailbox(mailbox, { error: message }).catch(() => undefined);
    return { ...result, error: message.slice(0, 300) };
  }
}

/**
 * A reply to an agent mail: the person replied (once, from sent or ended), and when the reply asks not to be
 * contacted again, opted out (recordOptOut). A later reply in the thread is read for a stop request too.
 */
async function recordReply(mail: AgentSentMail, parsed: ParsedGmailMessage, mailbox: string) {
  const person = await updateAgentPerson(mail.personId, {
    status: "replied", replyText: replyExcerpt(parsed.body) || null, repliedAt: parsed.receivedAt, followupDueAt: null,
  }, { kind: "replied", by: AGENT, note: `답장 옴 · 자동 (${mailbox})` }, ["sent", "ended"]);
  const words = stopRequestIn({ text: replyExcerpt(parsed.body, STOP_CHECK_CHARS), subject: parsed.subject, sentSubject: mail.subject });
  const optedOut = words
    ? await recordOptOut(mail, `답장에 "${words.slice(0, 60)}"라는 말이 있어 연락 받지 않기 목록에 넣고 끝냈어요 · 자동 (${mailbox})`)
    : false;
  return { replied: Boolean(person), optedOut };
}

/**
 * The address an agent mail went to on the shared opt-out list, through the mail's own opt-out (which also marks the
 * mail, as its link does), else directly. Ops' "연락 그만 요청" uses it too.
 */
export async function optOutAgentAddress(mailId: string | null, email: string | null) {
  if (mailId) {
    const result = await unsubscribeGtmMail({ mailId, token: gtmUnsubscribeToken(mailId) });
    if (result.ok) return;
  }
  const address = cleanEmail(email);
  if (!address) return;
  const { error } = await getSupabaseAdmin().from("external_contact_suppressions")
    .upsert({ email_hash: externalEmailHash(address), reason: "unsubscribed", external_intro_request_id: null },
      { onConflict: "email_hash", ignoreDuplicates: true });
  if (error) throw error;
}

/**
 * An opt-out found in a mailbox: the address on the opt-out list, and the person ended (a sent person becomes ended,
 * a replied one keeps its reply) with one "연락 그만" line. Once per person: true when this call added it.
 */
async function recordOptOut(mail: AgentSentMail, note: string): Promise<boolean> {
  const person = await readAgentPerson(mail.personId);
  if (!person || person.events.some((event) => event.kind === "unsubscribed")) return false;
  await optOutAgentAddress(mail.mailId, mail.toEmail);
  const updated = await updateAgentPerson(person.id, {
    ...(person.status === "sent" ? { status: "ended" as const } : {}),
    endedAt: person.endedAt ?? new Date().toISOString(), followupDueAt: null,
  }, { kind: "unsubscribed", by: AGENT, note }, [person.status]);
  return Boolean(updated);
}

/**
 * A permanent bounce of an agent mail reported to a team mailbox: what Resend's bounce event does (the mail marked
 * bounced, the address on the shared opt-out list), and the person ended with a timeline line. True when the
 * person changed.
 */
async function recordBounce(mail: AgentSentMail, parsed: ParsedGmailMessage, mailbox: string): Promise<boolean> {
  const failure = parsed.deliveryFailure;
  const detail = [failure?.status, failure?.diagnosticCode].filter(Boolean).join(" ").slice(0, 500) || null;
  await gtmWrite((sql) => sql`
    update public.gtm_mails set delivery_status = 'bounced', delivery_event_at = ${parsed.receivedAt}::timestamptz,
      delivery_detail = ${detail}
    where id = ${mail.mailId}::uuid and delivery_status is null
  `);
  const address = (failure?.finalRecipient || mail.toEmail).trim().toLowerCase();
  const { error } = await getSupabaseAdmin().from("external_contact_suppressions")
    .upsert({ email_hash: externalEmailHash(address), reason: "bounced", external_intro_request_id: null },
      { onConflict: "email_hash", ignoreDuplicates: true });
  if (error) throw error;
  const person = await updateAgentPerson(mail.personId, { status: "ended", endedAt: new Date().toISOString(), followupDueAt: null },
    { kind: "bounced", by: AGENT, note: `반송 · 자동 (${mailbox})${failure?.status ? ` · ${failure.status}` : ""}` }, ["sent"]);
  return Boolean(person);
}

/**
 * Which mailboxes' replies are not being read right now (replies.ts replyReadingTroubles): a failed last read, never
 * read, or no read for 30 minutes, while agent mail went out within the reply window. Shown on /ops (agentHealth).
 */
export async function readReplyReadingTroubles(now = new Date()): Promise<ReplyReadingTrouble[]> {
  if (!(await recentAgentMail())) return [];
  const settings = await readAgentSettings();
  const mailboxes = replyMailboxes(process.env.GTM_AGENT_REPLY_MAILBOXES, settings.senderEmail);
  const rows = mailboxes.length ? await gtmRead((sql) => sql<Array<{
    email: string; last_synced_at: string | Date | null; last_error: string | null;
  }>>`
    select email, last_synced_at, last_error from public.gtm_agent_mailboxes where email = any(${mailboxes}::text[])
  `) : [];
  return replyReadingTroubles({
    recentMail: true, configured: gmailServiceAccountConfigured(), mailboxes, now,
    states: rows.map((row) => ({
      email: row.email, lastError: row.last_error, lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
    })),
  });
}

/**
 * Whether follow-ups wait (run.server.ts followUps): while a mailbox's replies are not being read, a follow-up could
 * go to someone who already answered or asked to stop, and a person could be ended for "no reaction". They go out
 * again by themselves once every mailbox reads. When this check itself fails, they wait too.
 */
export async function followUpsOnHold(): Promise<boolean> {
  try {
    return (await readReplyReadingTroubles()).length > 0;
  } catch (error) {
    console.warn("[gtm-agent] reply reading check failed; follow-ups wait", errorText(error).slice(0, 300));
    return true;
  }
}

async function syncAll(deadline: number): Promise<ReplySync> {
  if (!gmailServiceAccountConfigured()) return { ran: false, reason: "not_configured" };
  if (!(await recentAgentMail())) return { ran: false, reason: "no_recent_mail" };
  const settings = await readAgentSettings();
  const mailboxes = replyMailboxes(process.env.GTM_AGENT_REPLY_MAILBOXES, settings.senderEmail);
  if (!mailboxes.length) return { ran: false, reason: "no_mailbox" };
  // Best effort: without the Message-ID a reply is still matched by its sender.
  await fillMessageIds(deadline).catch((error) => console.warn("[gtm-agent] reply message ids", errorText(error).slice(0, 300)));
  const team = new Set(mailboxes);
  return { ran: true, mailboxes: await Promise.all(mailboxes.map((mailbox) => syncMailbox(mailbox, deadline, team))) };
}

/**
 * One reply sync over the team mailboxes. Never throws and never takes much longer than its budget: missing
 * configuration, a Gmail auth error or a database error is logged and returned, and the tick goes on.
 */
export async function syncAgentReplies(budgetMs = SYNC_BUDGET_MS): Promise<ReplySync> {
  const deadline = Date.now() + budgetMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<ReplySync>((resolve) => {
    timer = setTimeout(() => resolve({ ran: true, reason: "timeout" }), budgetMs + 5_000);
  });
  try {
    return await Promise.race([syncAll(deadline), late]);
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return { ran: false, reason: "not_migrated" };
    console.error("[gtm-agent] reply sync failed", error);
    return { ran: false, reason: "error" };
  } finally {
    clearTimeout(timer);
  }
}
