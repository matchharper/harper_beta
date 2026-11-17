import "server-only";

import { randomUUID } from "node:crypto";
import { sendResendEmail } from "@/lib/email/send";
import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { GtmWritesOffError, gtmWritesEnabled } from "../constants";
import { gtmMailsTable, gtmUnsubscribeUrl, type GtmPostingSnapshot } from "../mailSend.server";
import { kstDayWindow } from "../sendLimit";
import { GTM_SENDER_DOMAIN, gtmFromHeader, gtmMailLinkOrigin } from "../shared";
import { agentSenderProblem } from "./mailRules";
import { RECENT_CONTACT_DAYS } from "./people";
import type { AgentPerson, AgentPosting, AgentSettings } from "./types";

/**
 * #5: one agent mail (campaign 'agent') through Resend from the first-contact sender on /ops #5. The same safety as
 * #4 mails, per person instead of per posting:
 * - never to an address on Harper's shared opt-out / bounce / complaint list;
 * - never to an address any GTM candidate mail (#4 or #5) went to in the last 30 days, except this person's own
 *   follow-up;
 * - at most `dailyMailCap` agent mails a day (Korea time; mails to matchharper.com are tests and not counted).
 * Whether the address may be mailed at all (personal mailbox) and the sending hours are the run's checks.
 * The log row is written before the provider call (a second worker finds it); its id goes into the mail's links.
 */

export type AgentSendResult =
  | { status: "sent"; mailId: string; sentAt: string }
  | { status: "blocked"; mailId: string | null; reason: string };

const DAY_MS = 86_400_000;

function isHarperAddress(email: string) {
  return email.endsWith(`@${GTM_SENDER_DOMAIN}`);
}

/** Agent mails counted against today's cap: sending or sent, not to matchharper.com, Korea-time today. */
export async function countAgentMailsToday(now = new Date()): Promise<number> {
  const day = kstDayWindow(now);
  const { count, error } = await gtmMailsTable(getSupabaseAdmin()).select("id", { count: "exact", head: true })
    .eq("campaign", "agent").in("status", ["sending", "sent"])
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
    candidate_source: null, candidate_ref: person.id,
    talent_ids: [], language: person.language ?? "ko",
    posting: snapshot, postings, agent_person_id: person.id,
  };
}

export async function deliverAgentMail(args: {
  person: Pick<AgentPerson, "id" | "email" | "language">;
  postings: AgentPosting[];
  settings: AgentSettings;
  /** The Ops user the mail is logged under (gtm_mails.sent_by): who turned the agent on. */
  sentBy: string;
  followup: boolean;
  render: (mailId: string, links: { harperUrl: string; unsubscribeUrl: string }) => { subject: string; html: string; text: string };
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
  const from = { from_name: args.settings.senderName?.trim() ?? "", from_email: args.settings.senderEmail?.trim().toLowerCase() ?? "", cc_emails: [] };
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

  const mailId = randomUUID();
  const rendered = args.render(mailId, links(mailId));
  const { error: insertError } = await gtmMailsTable(admin).insert({
    ...facts, ...from, id: mailId, to_email: to, subject: rendered.subject, html: rendered.html, text_body: rendered.text,
    sent_by: args.sentBy, status: "sending",
  });
  if (insertError) throw insertError;
  try {
    const sent = await sendResendEmail({
      from: gtmFromHeader({ fromName: from.from_name, fromEmail: from.from_email }),
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: from.from_email,
      headers: {
        "List-Unsubscribe": `<${links(mailId).unsubscribeUrl}>, <mailto:${from.from_email}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      idempotencyKey: `gtm-agent-mail:${mailId}`,
    });
    const { error } = await gtmMailsTable(admin).update({ status: "sent", provider_message_id: sent.id ?? null }).eq("id", mailId);
    if (error) console.error("[gtm-agent] sent but the log update failed", mailId, error);
    return { status: "sent", mailId, sentAt: new Date().toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { error: logError } = await gtmMailsTable(admin).update({ status: "failed", error: message.slice(0, 1_000) }).eq("id", mailId);
    if (logError) console.error("[gtm-agent] send failed and the log update failed", mailId, logError);
    throw error;
  }
}
