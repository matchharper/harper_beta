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
import { GTM_HARPER_ORIGIN } from "../shared";
import { cleanEmail } from "./people";
import { settleAnsweredByHuman, storeInbound, threadMessagesFor } from "./conversation.server";
import {
  addressSearches, autoReplyReason, cutQuotedText, isUnsubscribeSubject, matchAgentBounce, matchAgentUnsubscribe,
  matchHumanReply, matchInboundReply, maybeDeliveryReport, normalizeMessageId, OTHER_SENDER_REASON, referencedMessageIds,
  REPLY_ALERT_CHARS, REPLY_WINDOW_DAYS, replyAlertText, replyExcerpt, replyMailboxes, replyReadingTroubles,
  type AgentSentMail, type InboundMatch, type ReplyReadingTrouble,
} from "./replies";
import { handOffOtherSender, rememberReplyAlertThread } from "./ashleyHandoff.server";
import { latestDailyReportTs, postToGtmTalent } from "./slack.server";
import { readAgentPerson, readAgentSettings, updateAgentPerson } from "./store.server";
import type { AgentPerson } from "./types";

/**
 * #5 replies, read from the team's Google Workspace mailboxes (agent/replies.ts has the rules). Agent mails go out
 * through Resend with Reply-To = the sender, so a candidate's answer lands in that person's Gmail. Each dispatcher
 * tick (/api/internal/gtm-agent/dispatch, before the agent's own steps so a reply stops this tick's follow-up)
 * reads, per mailbox (GTM_AGENT_REPLY_MAILBOXES plus the sender):
 * - the messages added since the mailbox's last Gmail history cursor (gtm_agent_mailboxes), or on the first run /
 *   when the cursor is too old the last BACKFILL_DAYS of INBOX and SENT (at most BACKFILL_MAX); once per mailbox
 *   (conversation_backfilled_at) also every mail from or to an agent mail's recipient in the last
 *   CONVERSATION_BACKFILL_DAYS, so the replies from before the conversation table are stored too;
 * - each one's headers only (format metadata); the body is read only for a mail threaded to an agent mail. Any
 *   other mail (service notices, sales, other work done from the mailbox) is never opened or stored: only how many
 *   inbound ones there were (unmatched, for /ops).
 * - a reply (and every later one in the thread): stored once, in full, in gtm_agent_messages (conversation.server.ts,
 *   the quoted text cut into new_text) for Ashley's reply agent to decide; the person becomes replied as with Ops'
 *   "답장 옴" (follow-up stopped, counts in 답장), and a timeline line "답장 옴 · 자동 (<mailbox>)". A reply from another address than the mail's recipient (a forwarded
 *   colleague) is stored decided hand_to_human ("다른 보낸 사람"): Ashley never answers it.
 * - the reply that made the person replied, and a new one from another sender, is posted to Slack #gtm-talent
 *   right away (alertReply); a Slack failure is logged and reading goes on. What a reply means (stop, not
 *   interested) is Ashley's decide, not a word list.
 * - a mail sent from the mailbox (SENT) in one of our threads: a person on the team answered (Ashley's replies go out
 *   through Resend, never through Gmail). Stored with author human; the thread is human-owned from then on, and
 *   the inbound mails it answers get no Ashley decision (settleAnsweredByHuman).
 * - a mail titled "unsubscribe" (the mailto in every agent mail's List-Unsubscribe header) from an address an agent
 *   mail went to: the address on the opt-out list and the person ended, as the mail's opt-out link does.
 * - a permanent delivery failure report about an agent mail: the mail bounced (as Resend's bounce event), the
 *   address on the shared opt-out list, the person ended.
 * Applying is idempotent: a Gmail message is stored once (unique gmail_message_id), a person moves to replied once
 * (from sent or ended) and gets one opt-out line, so the same Gmail message read again, or read in two mailboxes,
 * changes nothing and posts nothing. The service account reads with domain-wide delegation and the Gmail read-only
 * scope; without it configured, or on any Gmail error, the tick goes on (kept on the mailbox row, shown on /ops by
 * agentHealth), and follow-ups wait until every mailbox reads again (followUpsOnHold).
 */

const AGENT = "agent";
/** The whole sync's time (the tick's own work follows in the same request). */
const SYNC_BUDGET_MS = 25_000;
const BACKFILL_DAYS = 7;
const BACKFILL_MAX = 200;
const SENT_BACKFILL_MAX = 100;
/**
 * The one-time read per mailbox: the first replies came 11/19 (UTC), the mailbox already had a cursor, so the plain
 * backfill would never run again; 14 days reach back past the first agent mail (11/18).
 */
const CONVERSATION_BACKFILL_DAYS = 14;
/** Messages one backfill search lists at most, and the recipients it searches for at most (the latest). */
const BACKFILL_SEARCH_MAX = 100;
const BACKFILL_RECIPIENTS_MAX = 600;
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
/** Labels whose messages are never read (SENT ones are: a person's answer in our thread). */
const SKIP_LABELS = new Set(["DRAFT", "SPAM", "CHAT"]);

/**
 * One mailbox's read: messages looked at (headers), people who became replied, messages stored in the conversation
 * table, a person's answers among them, inbound mails not threaded to any agent mail (never opened; a sudden rise
 * means replies are not being matched), opt-outs, bounces, automatic mails.
 */
export type MailboxSync = {
  mailbox: string; read: number; replies: number; stored: number; human: number; unmatched: number; optOuts: number;
  bounces: number; automatic: number; error?: string;
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
      select 1 from public.gtm_mails where campaign = 'agent' and (status = 'sent' or (status = 'sending' and provider_message_id is not null))
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
    where campaign = 'agent' and (status = 'sent' or (status = 'sending' and provider_message_id is not null)) and provider_message_id is not null and rfc_message_id is null
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
 * The agent mails (candidate and company) that may be answered by these senders (sent within `windowDays`, the reply
 * window by default), name these Message-IDs, or are these mails (a stored thread's root).
 */
async function agentMailsFor(
  emails: readonly string[], messageIds: readonly string[], windowDays = REPLY_WINDOW_DAYS + BACKFILL_DAYS,
  mailIds: readonly string[] = [],
): Promise<AgentSentMail[]> {
  if (!emails.length && !messageIds.length && !mailIds.length) return [];
  const rows = await gtmRead((sql) => sql<Array<{
    mail_id: string; person_id: string | null; audience: string; to_email: string; rfc_message_id: string | null; subject: string;
    created_at: string | Date;
  }>>`
    select m.id::text as mail_id, m.agent_person_id::text as person_id, m.audience, m.to_email, m.rfc_message_id, m.subject,
      m.created_at
    from public.gtm_mails m
    where m.campaign = 'agent' and (m.status = 'sent' or (m.status = 'sending' and m.provider_message_id is not null))
      and (m.agent_person_id is not null or m.audience = 'company')
      and ((m.to_email = any(${[...emails]}::text[])
          and m.created_at > now() - make_interval(days => ${windowDays}::int))
        or m.rfc_message_id = any(${[...messageIds]}::text[])
        or m.id = any(${[...mailIds]}::uuid[]))
    order by m.created_at desc limit 500
  `);
  // A company mail names the interested candidate it was about (agent_person_id, for /ops), but the company's reply,
  // opt-out or bounce is never the candidate's: those mails carry no person here.
  return rows.map((row) => ({
    mailId: row.mail_id, personId: row.audience === "company" ? null : row.person_id,
    audience: row.audience === "company" ? "company" : "candidate",
    toEmail: row.to_email, rfcMessageId: row.rfc_message_id || null, subject: row.subject,
    sentAt: new Date(row.created_at).toISOString(),
  }));
}

/** Where every agent mail of the last weeks went (the latest first): what the one-time backfill searches for. */
async function recentRecipients(): Promise<string[]> {
  const rows = await gtmRead((sql) => sql<Array<{ to_email: string }>>`
    select to_email from public.gtm_mails
    where campaign = 'agent' and (status = 'sent' or (status = 'sending' and provider_message_id is not null))
      and created_at > now() - make_interval(days => ${REPLY_WINDOW_DAYS + CONVERSATION_BACKFILL_DAYS}::int)
    group by to_email order by max(created_at) desc limit ${BACKFILL_RECIPIENTS_MAX}::int
  `);
  return rows.map((row) => row.to_email);
}

type MailboxState = { historyId: string | null; backfilled: boolean };

async function readMailboxState(mailbox: string): Promise<MailboxState> {
  const [row] = await gtmRead((sql) => sql<Array<{ history_id: string | null; conversation_backfilled_at: string | Date | null }>>`
    select history_id, conversation_backfilled_at from public.gtm_agent_mailboxes where email = ${mailbox}
  `);
  return { historyId: row?.history_id ?? null, backfilled: Boolean(row?.conversation_backfilled_at) };
}

/**
 * Saves the mailbox's state: the new cursor after a full read (and that the one-time backfill is done when it ran),
 * or only the error (the cursor stays) after a failed one.
 */
async function saveMailbox(mailbox: string, state: { historyId: string; backfilled: boolean } | { error: string }) {
  const historyId = "historyId" in state ? state.historyId : null;
  const backfilledAt = "backfilled" in state && state.backfilled ? new Date() : null;
  const error = "error" in state ? state.error.slice(0, 1_000) : null;
  await gtmWrite((sql) => sql`
    insert into public.gtm_agent_mailboxes (email, history_id, last_synced_at, last_error, conversation_backfilled_at, updated_at)
    values (${mailbox}, ${historyId}, ${historyId ? new Date() : null}, ${error}, ${backfilledAt}, now())
    on conflict (email) do update set
      history_id = coalesce(excluded.history_id, gtm_agent_mailboxes.history_id),
      last_synced_at = coalesce(excluded.last_synced_at, gtm_agent_mailboxes.last_synced_at),
      conversation_backfilled_at = coalesce(gtm_agent_mailboxes.conversation_backfilled_at, excluded.conversation_backfilled_at),
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

/**
 * The message ids to look at: since the cursor, or the recent INBOX and SENT when there is none or it is too old;
 * plus, until it has run once, the one-time conversation backfill (every mail from or to a recent recipient).
 */
async function listNewMessages(access: GmailAccess, state: MailboxState, deadline: number) {
  let listed: { historyId: string; ids: string[] } | null = null;
  if (state.historyId) {
    try {
      const history = await listGmailHistory(state.historyId, access);
      listed = { historyId: history.latestHistoryId, ids: history.messageIds.slice(-MAX_MESSAGES) };
    } catch (error) {
      // Gmail keeps about a week of history: an older cursor is answered 404, and the recent INBOX is read instead.
      if (!isGmailNotFoundError(error)) throw error;
    }
  }
  if (!listed) {
    // The cursor is taken before listing, so nothing that arrives meanwhile is missed next time.
    const historyId = await getGmailHistoryId(access);
    const recent = `newer_than:${BACKFILL_DAYS}d`;
    const [inbox, sent] = await Promise.all([
      listInboxMessageIds(recent, access, BACKFILL_MAX),
      listInboxMessageIds(recent, access, SENT_BACKFILL_MAX, "SENT"),
    ]);
    listed = { historyId, ids: [...inbox, ...sent] };
  }
  if (state.backfilled) return listed;
  const ids = new Set(listed.ids);
  for (const search of addressSearches(await recentRecipients(), CONVERSATION_BACKFILL_DAYS)) {
    if (Date.now() > deadline) throw new SyncTimeout();
    for (const id of await listInboxMessageIds(search, access, BACKFILL_SEARCH_MAX, null)) ids.add(id);
  }
  return { historyId: listed.historyId, ids: [...ids] };
}

type Inbound = { id: string; parsed: ParsedGmailMessage; kind: "reply" | "unsubscribe" | "report" | "sent" };

/** One mailbox's new messages. `team`: every mailbox read (a teammate's mail in a thread is never the person's). */
async function syncMailbox(mailbox: string, deadline: number, team: ReadonlySet<string>): Promise<MailboxSync> {
  const result: MailboxSync = { mailbox, read: 0, replies: 0, stored: 0, human: 0, unmatched: 0, optOuts: 0, bounces: 0, automatic: 0 };
  const access: GmailAccess = {
    mailbox, scopes: [GMAIL_READONLY_SCOPE], signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
  };
  try {
    const state = await readMailboxState(mailbox);
    const listed = await listNewMessages(access, state, deadline);
    // Headers only: who sent it, the subject, the reply headers and the automatic-mail markers.
    const heads = await mapBounded(listed.ids, GMAIL_PARALLEL, deadline, (id) => readMessage(id, access, "metadata"));
    result.read = heads.filter(Boolean).length;
    const inbound: Inbound[] = [];
    for (const message of heads) {
      if (!message || message.labelIds?.some((label) => SKIP_LABELS.has(label))) continue;
      const parsed = parseGmailMessage(message);
      // Sent from this mailbox: a person's answer when it is in one of our threads (matched below), else ignored.
      if (message.labelIds?.includes("SENT")) {
        inbound.push({ id: message.id, parsed, kind: "sent" });
        continue;
      }
      if (!parsed.fromEmail || parsed.fromEmail === mailbox || team.has(parsed.fromEmail.toLowerCase())) continue;
      const headers = getGmailHeaders(message);
      if (maybeDeliveryReport({ fromEmail: parsed.fromEmail, headers })) {
        inbound.push({ id: message.id, parsed, kind: "report" });
      } else if (isUnsubscribeSubject(parsed.subject)) {
        // Before the automatic-mail check: a mail app may mark the opt-out mail it sends as automatic.
        inbound.push({ id: message.id, parsed, kind: "unsubscribe" });
      } else if (autoReplyReason({ fromEmail: parsed.fromEmail, headers })) {
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

    // Replies: matched on the headers (to an agent mail, or a stored message of its thread), then the matched ones
    // are read in full and stored, oldest first. Unmatched mail is never opened.
    const replies = inbound.filter((item) => item.kind === "reply");
    const matched = (await matchBatch(replies, "reply"))
      .sort((a, b) => a.item.parsed.receivedAt.localeCompare(b.item.parsed.receivedAt));
    result.unmatched = replies.length - matched.length;
    for (const { item, match } of matched) {
      if (Date.now() > deadline) throw new SyncTimeout();
      const full = await readMessage(item.id, access, "full");
      if (!full) continue;
      const outcome = await recordReply(match, parseGmailMessage(full), mailbox);
      if (outcome.replied) result.replies += 1;
      if (outcome.stored) result.stored += 1;
    }

    // A person's answers from the mailbox, after the replies (so a thread stored just now counts), oldest first.
    const sent = (await matchBatch(inbound.filter((item) => item.kind === "sent"), "sent"))
      .sort((a, b) => a.item.parsed.receivedAt.localeCompare(b.item.parsed.receivedAt));
    for (const { item, match } of sent) {
      if (Date.now() > deadline) throw new SyncTimeout();
      const full = await readMessage(item.id, access, "full");
      if (!full) continue;
      if (await recordHumanReply(match.mail, parseGmailMessage(full), team)) {
        result.human += 1;
        result.stored += 1;
      }
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

    await saveMailbox(mailbox, { historyId: listed.historyId, backfilled: !state.backfilled });
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
 * Which of these mails hang on an agent mail, from their headers: replies (matchInboundReply: by Message-ID, a stored
 * message of the thread, or the sender's address) or a person's answers (matchHumanReply: through the thread only).
 */
async function matchBatch(items: readonly Inbound[], kind: "reply" | "sent"): Promise<Array<{ item: Inbound; match: InboundMatch }>> {
  if (!items.length) return [];
  const referenced = [...new Set(items.flatMap((item) => referencedMessageIds(item.parsed.inReplyTo, item.parsed.references)))];
  const thread = await threadMessagesFor(referenced, items.map((item) => item.parsed.threadId));
  const roots = [...new Set(thread.map((row) => row.rootMailId).filter((id): id is string => Boolean(id)))];
  const senders = kind === "reply" ? [...new Set(items.map((item) => item.parsed.fromEmail as string))] : [];
  const mails = await agentMailsFor(senders, referenced, undefined, roots);
  return items.flatMap((item) => {
    if (kind === "reply") {
      const match = matchInboundReply(item.parsed, mails, thread);
      return match ? [{ item, match }] : [];
    }
    const mail = matchHumanReply(item.parsed, mails, thread);
    return mail ? [{ item, match: { mail, by: "thread" as const, otherSender: false } }] : [];
  });
}

/**
 * A reply in one of our threads: stored once in full (a reply from another sender stored decided hand_to_human, so
 * Ashley never answers it), and the candidate replied (once, from sent or ended). A company mail's reply has no
 * person row to change. Slack hears of it when the person changed, or when a new reply from another sender came.
 */
async function recordReply(match: InboundMatch, parsed: ParsedGmailMessage, mailbox: string) {
  const { mail, otherSender } = match;
  const saved = await storeInbound({
    author: "counterpart", personId: mail.personId, counterpartKind: mail.audience,
    counterpartEmail: parsed.fromEmail ?? mail.toEmail, gmailMessageId: parsed.messageId, gmailThreadId: parsed.threadId,
    rfcMessageId: parsed.rfcMessageId, inReplyTo: parsed.inReplyTo, references: parsed.references, subject: parsed.subject,
    bodyText: parsed.body, newText: cutQuotedText(parsed.body), rootMailId: mail.mailId, occurredAt: parsed.receivedAt,
  }, otherSender ? { decision: "hand_to_human", reason: OTHER_SENDER_REASON } : null);
  if (!mail.personId) {
    // A company reply from another address than the one we wrote to: stored as a hand-off, so a person is told here.
    if (saved.created && otherSender) {
      await handOffOtherSender({
        personId: null, mailId: mail.mailId, recipient: mail.toEmail, otherSender: parsed.fromEmail ?? "", mailbox,
        rfcMessageId: parsed.rfcMessageId,
      }).catch((error) => console.warn("[gtm-agent] company reply hand-off not posted", mail.mailId, errorText(error).slice(0, 300)));
    }
    return { replied: false, stored: saved.created };
  }
  const person = await updateAgentPerson(mail.personId, {
    status: "replied", repliedAt: parsed.receivedAt, followupDueAt: null,
  }, { kind: "replied", by: AGENT, note: `답장 옴 · 자동 (${mailbox})${otherSender ? ` · ${OTHER_SENDER_REASON}` : ""}` }, ["sent", "ended"]);
  // The same message read again (a failed tick, the backfill) posts nothing.
  if (person || (saved.created && otherSender)) await alertReply(person, mail, parsed, otherSender ? parsed.fromEmail : null, saved.created ? mailbox : null);
  return { replied: Boolean(person), stored: saved.created };
}

/**
 * A person's answer from the mailbox in one of our threads: stored with author human (the thread is human-owned from
 * now on), to the address it went to (the thread's recipient when it went to the team). The inbound mails before it
 * in the thread get no Ashley decision. True when this call stored it.
 */
async function recordHumanReply(mail: AgentSentMail, parsed: ParsedGmailMessage, team: ReadonlySet<string>): Promise<boolean> {
  const to = parsed.toEmail && !team.has(parsed.toEmail) ? parsed.toEmail : mail.toEmail;
  const saved = await storeInbound({
    author: "human", personId: mail.personId, counterpartKind: mail.audience, counterpartEmail: to,
    gmailMessageId: parsed.messageId, gmailThreadId: parsed.threadId, rfcMessageId: parsed.rfcMessageId,
    inReplyTo: parsed.inReplyTo, references: parsed.references, subject: parsed.subject, bodyText: parsed.body,
    newText: cutQuotedText(parsed.body), rootMailId: mail.mailId, occurredAt: parsed.receivedAt,
  });
  await settleAnsweredByHuman(mail.mailId, parsed.receivedAt);
  return saved.created;
}

/**
 * The reply in Slack #gtm-talent right away, as a comment under the latest daily numbers post (on its own before the
 * first one). `otherSender`: the address it came from when that is not the mail's recipient. A Slack or read failure
 * never stops reply reading: logged and skipped.
 */
async function alertReply(changed: AgentPerson | null, mail: AgentSentMail, parsed: ParsedGmailMessage, otherSender: string | null, storedIn: string | null = null) {
  if (!mail.personId) return;
  try {
    const person = changed ?? await readAgentPerson(mail.personId);
    const threadTs = await latestDailyReportTs().catch((error) => {
      console.warn("[gtm-agent] daily report post not read", errorText(error).slice(0, 300));
      return null;
    });
    const posted = await postToGtmTalent(replyAlertText({
      personId: mail.personId, name: person?.name ?? null, email: mail.toEmail, source: person?.source ?? null,
      isTest: person?.isTest ?? false, reply: replyExcerpt(parsed.body, REPLY_ALERT_CHARS), otherSender, origin: GTM_HARPER_ORIGIN,
    }), undefined, { threadTs });
    if (!posted.ok) console.warn("[gtm-agent] reply not posted to Slack", mail.personId, posted.error);
    // Ashley's lines (hand-offs, sent replies) go in this thread (agent/ashleyHandoff.server.ts).
    else await rememberReplyAlertThread(mail.personId, threadTs ?? posted.ts);
    // A reply from another address is never answered by Ashley: a person is @mentioned, once (when it was stored).
    if (otherSender && storedIn) {
      await handOffOtherSender({
        personId: mail.personId, mailId: mail.mailId, recipient: mail.toEmail, otherSender, mailbox: storedIn,
        rfcMessageId: parsed.rfcMessageId, threadTs: posted.ok ? threadTs ?? posted.ts : threadTs,
      });
    }
  } catch (error) {
    console.warn("[gtm-agent] reply not posted to Slack", mail.personId, errorText(error).slice(0, 300));
  }
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
  // A company mail has no person row: the address goes on the list (idempotent there), nothing else changes.
  if (!mail.personId) {
    await optOutAgentAddress(mail.mailId, mail.toEmail);
    return false;
  }
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
  if (!mail.personId) return false;
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
