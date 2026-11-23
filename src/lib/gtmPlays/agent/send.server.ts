import "server-only";

import { randomUUID } from "node:crypto";
import { sendResendEmail } from "@/lib/email/send";
import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { GtmWritesOffError, gtmWritesEnabled } from "../constants";
import { gtmRead } from "../db.server";
import { gtmMailsTable, gtmUnsubscribeUrl, type GtmPostingSnapshot } from "../mailSend.server";
import { kstDayWindow } from "../sendLimit";
import { GTM_SENDER_DOMAIN, gtmFromHeader, gtmMailLinkOrigin } from "../shared";
import { threadHeaders } from "./followup";
import { agentSenderProblem } from "./mailRules";
import { RECENT_CONTACT_DAYS } from "./people";
import { AgentSendError, classifySendError } from "./sendErrors";
import { SEND_CALL_TIMEOUT_MS } from "./tickRules";
import type { AgentPerson, AgentPosting, AgentSettings } from "./types";

/**
 * #5: one agent mail (campaign 'agent') through Resend from the first-contact sender on /ops #5. The same safety as
 * #4 mails, per person instead of per posting:
 * - never to an address on Harper's shared opt-out / bounce / complaint list;
 * - never to an address any GTM candidate mail (#4 or #5) went to in the last 30 days, except this person's own
 *   follow-up;
 * - at most `dailyMailCap` candidate mails (first mails and follow-ups together) a day (Korea time; mails to
 *   matchharper.com are tests and not counted). Company mails have a cap of their own, the same number
 *   (agent/companyMail.server.ts; Shaun 11/22).
 * Whether the address may be mailed at all (personal mailbox) and the sending hours are the run's checks.
 * The log row is written before the provider call (a second worker finds it); its id goes into the mail's links.
 * A provider call that fails throws AgentSendError (agent/sendErrors.ts): the row is failed when the provider
 * refused it, and stays "sending" when the outcome is unknown (a timeout, a server error), for the next tick to ask
 * again with the same idempotency key (resendAgentMail): a mail that did go out is then recorded as sent, once.
 */

export type AgentSendResult =
  | { status: "sent"; mailId: string; sentAt: string }
  | { status: "blocked"; mailId: string | null; reason: string };

const DAY_MS = 86_400_000;

function isHarperAddress(email: string) {
  return email.endsWith(`@${GTM_SENDER_DOMAIN}`);
}

/**
 * Agent mails of one audience counted against today's cap: sending or sent, not to matchharper.com, Korea-time today.
 * candidate: first mails and follow-ups (one cap); company: company mails (their own cap of the same number).
 */
export async function countAgentMailsToday(now = new Date(), audience: "candidate" | "company" = "candidate"): Promise<number> {
  const day = kstDayWindow(now);
  const { count, error } = await gtmMailsTable(getSupabaseAdmin()).select("id", { count: "exact", head: true })
    .eq("campaign", "agent").eq("audience", audience).in("status", ["sending", "sent"])
    .gte("created_at", day.start).lt("created_at", day.end)
    .not("to_email", "like", `%@${GTM_SENDER_DOMAIN}`);
  if (error) throw error;
  return Number(count ?? 0);
}

/** The posting the mail's Harper page and claim read first: a Harper Role (customer or GTM) if the mail has one. */
function primaryPosting(postings: readonly AgentPosting[]) {
  return postings.find((posting) => posting.kind !== "external" && posting.roleId) ?? postings[0] ?? null;
}

/** The gtm_mails facts of one agent mail. */
function mailFacts(person: { id: string; language: "ko" | "en" | null }, postings: AgentPosting[]) {
  const primary = primaryPosting(postings);
  const snapshot: GtmPostingSnapshot | null = primary
    ? { title: primary.title, companyName: primary.companyName, location: primary.location, description: primary.why, url: primary.url }
    : null;
  return {
    campaign: "agent", audience: "candidate",
    company_name: primary?.companyName ?? null, company_workspace_id: null,
    role_id: primary?.kind !== "external" ? primary?.roleId ?? null : null,
    posting_url: primary?.url ?? null,
    talent_ids: [], language: person.language ?? "ko",
    posting: snapshot, postings, agent_person_id: person.id,
  };
}

/**
 * What a logged mail sends: built from the row alone (a follow-up also from its first mail's Message-ID, set once), so
 * a retry sends exactly the same request (idempotency).
 */
type AgentMailPayload = {
  id: string; to: string; subject: string; html: string; text: string; fromName: string; fromEmail: string;
  /** A follow-up's In-Reply-To / References: it threads under the first mail in the recipient's app (followup.ts). */
  thread?: Record<string, string>;
};

/**
 * Each person's first mail and its RFC Message-ID (filled from Resend by replies.server.ts), when known: what a
 * follow-up answers.
 */
async function firstMailMessageIds(personIds: readonly string[]): Promise<Map<string, { mailId: string; rfcMessageId: string }>> {
  const ids = [...new Set(personIds)].filter(Boolean);
  if (!ids.length) return new Map();
  const rows = await gtmRead((sql) => sql<Array<{ person_id: string; mail_id: string; rfc_message_id: string }>>`
    select p.id::text as person_id, f.id::text as mail_id, f.rfc_message_id
    from public.gtm_agent_people p join public.gtm_mails f on f.id = p.mail_id
    where p.id = any(${ids}::uuid[]) and coalesce(f.rfc_message_id, '') <> ''
  `);
  return new Map(rows.map((row) => [row.person_id, { mailId: row.mail_id, rfcMessageId: row.rfc_message_id }]));
}

/** One provider call for a logged mail, under the mail's idempotency key; the provider's id, or AgentSendError. */
async function callProvider(mail: AgentMailPayload, timeoutMs: number): Promise<string | null> {
  const unsubscribeUrl = gtmUnsubscribeUrl(mail.id, gtmMailLinkOrigin());
  try {
    const sent = await sendResendEmail({
      from: gtmFromHeader({ fromName: mail.fromName, fromEmail: mail.fromEmail }),
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: mail.fromEmail,
      headers: {
        ...mail.thread,
        "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${mail.fromEmail}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      idempotencyKey: `gtm-agent-mail:${mail.id}`,
      signal: AbortSignal.timeout(Math.max(1_000, timeoutMs)),
    });
    return sent.id ?? null;
  } catch (error) {
    throw new AgentSendError(classifySendError(error), mail.id);
  }
}

/** The row after a provider call: sent with its id (tried twice), or what the failure means for it. */
async function recordProviderCall(mailId: string, outcome: { providerId: string | null } | { error: AgentSendError }) {
  const table = gtmMailsTable(getSupabaseAdmin());
  if ("providerId" in outcome) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await table.update({ status: "sent", provider_message_id: outcome.providerId, error: null }).eq("id", mailId);
      if (!error) return;
      console.error("[gtm-agent] sent but the log update failed", mailId, error);
    }
    return;
  }
  const { kind, message } = outcome.error;
  // An unknown outcome stays "sending" (the next tick asks again with the same key); a refusal never went out.
  const patch = kind === "unknown" ? { error: message.slice(0, 1_000) } : { status: "failed", error: message.slice(0, 1_000) };
  const { error } = await table.update(patch).eq("id", mailId).eq("status", "sending");
  if (error) console.error("[gtm-agent] send failed and the log update failed", mailId, error);
}

export async function deliverAgentMail(args: {
  person: Pick<AgentPerson, "id" | "email" | "language">;
  postings: AgentPosting[];
  settings: AgentSettings;
  /** The Ops user the mail is logged under (gtm_mails.sent_by): who turned the agent on. */
  sentBy: string;
  followup: boolean;
  render: (mailId: string, links: { harperUrl: string; unsubscribeUrl: string }) => { subject: string; html: string; text: string };
  /** The provider call's time limit (the tick's end is near). */
  timeoutMs?: number;
}): Promise<AgentSendResult> {
  if (!gtmWritesEnabled()) throw new GtmWritesOffError();
  const senderProblem = agentSenderProblem(args.settings);
  if (senderProblem) return { status: "blocked", mailId: null, reason: senderProblem };
  const to = String(args.person.email ?? "").trim().toLowerCase();
  if (!to) return { status: "blocked", mailId: null, reason: "메일 주소가 없어요" };
  const admin = getSupabaseAdmin();
  const origin = gtmMailLinkOrigin();
  const links = (mailId: string) => ({
    harperUrl: new URL(`/jobs/invite/${mailId}`, origin).toString(),
    unsubscribeUrl: gtmUnsubscribeUrl(mailId, origin),
  });
  const from = { from_name: args.settings.senderName?.trim() ?? "", from_email: args.settings.senderEmail?.trim().toLowerCase() ?? "" };
  const facts = mailFacts(args.person, args.postings);
  const block = async (reason: string): Promise<AgentSendResult> => {
    const mailId = randomUUID();
    const rendered = args.render(mailId, links(mailId));
    const { error } = await gtmMailsTable(admin).insert({
      ...facts, ...from, id: mailId, to_email: to, subject: rendered.subject, html: rendered.html, text_body: rendered.text,
      sent_by: args.sentBy, status: "blocked", error: reason,
    });
    if (error) throw error;
    return { status: "blocked", mailId, reason };
  };

  const { data: suppressed, error: suppressedError } = await admin.from("external_contact_suppressions")
    .select("reason").eq("email_hash", externalEmailHash(to)).maybeSingle();
  if (suppressedError) throw suppressedError;
  if (suppressed) return block(`보내지 않았어요 · 연락 받지 않기 목록(${suppressed.reason})`);

  if (!isHarperAddress(to)) {
    const { data: recent, error: recentError } = await gtmMailsTable(admin).select("created_at,agent_person_id")
      .eq("audience", "candidate").eq("to_email", to).in("status", ["sending", "sent"])
      .gte("created_at", new Date(Date.now() - RECENT_CONTACT_DAYS * DAY_MS).toISOString())
      .order("created_at", { ascending: false }).limit(5);
    if (recentError) throw recentError;
    const others = ((recent ?? []) as Array<{ created_at: string; agent_person_id: string | null }>)
      .filter((row) => !(args.followup && row.agent_person_id === args.person.id));
    if (others.length) return block("30일 안에 같은 사람에게 보낸 메일이 있어요");
    if (await countAgentMailsToday() >= args.settings.dailyMailCap) return block("오늘 보낼 수 있는 메일을 다 썼어요");
  }

  // A follow-up answers the first mail (read before the row is logged, so a failed read sends nothing).
  const first = args.followup ? (await firstMailMessageIds([args.person.id])).get(args.person.id) : undefined;
  const mailId = randomUUID();
  const rendered = args.render(mailId, links(mailId));
  // Logged as "sending" before the provider call: a tick killed during the call leaves this row for the next one.
  const { error: insertError } = await gtmMailsTable(admin).insert({
    ...facts, ...from, id: mailId, to_email: to, subject: rendered.subject, html: rendered.html, text_body: rendered.text,
    sent_by: args.sentBy, status: "sending",
  });
  if (insertError) throw insertError;
  const payload: AgentMailPayload = {
    id: mailId, to, subject: rendered.subject, html: rendered.html, text: rendered.text, fromName: from.from_name, fromEmail: from.from_email,
    thread: threadHeaders(first?.rfcMessageId),
  };
  try {
    const providerId = await callProvider(payload, args.timeoutMs ?? SEND_CALL_TIMEOUT_MS);
    await recordProviderCall(mailId, { providerId });
    return { status: "sent", mailId, sentAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof AgentSendError) await recordProviderCall(mailId, { error });
    throw error;
  }
}

/** An agent mail logged as "sending" whose provider call never came back (agent/run.server.ts settles it). */
export type AgentPendingMail = AgentMailPayload & { personId: string | null; createdAt: string };

/**
 * Candidate agent mails still "sending" after `graceMs` (a call in flight is younger), the oldest first. Company mails
 * (audience company) are settled by agent/companyMail.server.ts, with their thread headers.
 */
export async function listPendingAgentMails(graceMs: number, limit: number): Promise<AgentPendingMail[]> {
  const { data, error } = await gtmMailsTable(getSupabaseAdmin())
    .select("id,agent_person_id,to_email,subject,html,text_body,from_name,from_email,created_at")
    .eq("campaign", "agent").eq("audience", "candidate").eq("status", "sending").lt("created_at", new Date(Date.now() - graceMs).toISOString())
    .order("created_at", { ascending: true }).limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string; agent_person_id: string | null; to_email: string; subject: string; html: string; text_body: string;
    from_name: string | null; from_email: string | null; created_at: string;
  }>;
  // A follow-up is asked again with the same thread headers as its first call (a person's mail that is not their first).
  const firsts = await firstMailMessageIds(rows.flatMap((row) => (row.agent_person_id ? [row.agent_person_id] : [])));
  return rows.map((row) => {
    const first = row.agent_person_id ? firsts.get(row.agent_person_id) : undefined;
    return {
      id: row.id, personId: row.agent_person_id, to: row.to_email, subject: row.subject, html: row.html, text: row.text_body,
      fromName: row.from_name ?? "", fromEmail: row.from_email ?? "", createdAt: row.created_at,
      thread: first && first.mailId !== row.id ? threadHeaders(first.rfcMessageId) : {},
    };
  });
}

/**
 * Asks the provider again for a mail stuck in "sending", with the same request and idempotency key (within the
 * provider's 24 hours): a mail it already accepted comes back as accepted (not sent twice), one it never got goes
 * out now. Sent → the row is sent; otherwise AgentSendError as for a first call.
 */
export async function resendAgentMail(mail: AgentPendingMail, timeoutMs = SEND_CALL_TIMEOUT_MS): Promise<{ mailId: string; sentAt: string }> {
  if (!gtmWritesEnabled()) throw new GtmWritesOffError();
  try {
    const providerId = await callProvider(mail, timeoutMs);
    await recordProviderCall(mail.id, { providerId });
    return { mailId: mail.id, sentAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof AgentSendError) await recordProviderCall(mail.id, { error });
    throw error;
  }
}

/** Ends a stuck mail without asking the provider: sent (it is known to have gone out) or failed (with why). */
export async function closePendingAgentMail(mailId: string, status: "sent" | "failed", reason: string | null): Promise<void> {
  const { error } = await gtmMailsTable(getSupabaseAdmin()).update({ status, error: reason?.slice(0, 1_000) ?? null })
    .eq("id", mailId).eq("status", "sending");
  if (error) throw error;
}
