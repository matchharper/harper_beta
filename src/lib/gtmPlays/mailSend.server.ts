import "server-only";

import { randomUUID, timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { hashReplyToken } from "@/lib/email/security";
import { sendResendEmail } from "@/lib/email/send";
import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { renderGtmCompanyMail, type GtmCompanyMailInput } from "./companyMail.server";
import { gtmWritesEnabled } from "./constants";
import { GtmWritesOffError } from "./outreach.server";
import { GTM_HARPER_ORIGIN, GTM_SENDER_DOMAIN, gtmEnvelopeProblem, gtmMailLinkOrigin, gtmFromHeader, isGtmEmail, type GtmEnvelope } from "./shared";

/** What the company mail preview renders from; the sender comes from the envelope on the form. */
export type GtmMailContent = Omit<GtmCompanyMailInput, "senderName" | "senderEmail">;

export type GtmMailCampaign = "pool" | "demand" | "outreach";
export type GtmMailAudience = "company" | "candidate";
export type GtmCandidateSource = "member" | "external" | "scraped";

export type GtmMailLogRow = {
  id: string;
  campaign: GtmMailCampaign;
  audience: GtmMailAudience;
  from_email: string;
  to_email: string;
  company_name: string | null;
  subject: string;
  status: "sending" | "sent" | "failed" | "blocked";
  error: string | null;
  claimed_at: string | null;
  created_at: string;
  /** What Resend reported later (permanent bounce, spam complaint, send failure); null when nothing went wrong. */
  delivery_status?: "bounced" | "complained" | "failed" | null;
  delivery_detail?: string | null;
};

export type GtmMailSendResult =
  | { status: "sent"; id: string; sentAt: string }
  | { status: "blocked"; id: string | null; reason: string };

const REPEAT_WINDOW_MS = 30 * 86_400_000;
const LOG_COLUMNS = "id,campaign,audience,from_email,to_email,company_name,subject,status,error,claimed_at,created_at";
// 20261113100000_gtm_mails_delivery; read without them until it is applied.
const DELIVERY_COLUMNS = ",delivery_status,delivery_detail";
const SUPPRESSION_LABEL: Record<string, string> = {
  unsubscribed: "연락 받지 않기를 눌렀어요",
  bounced: "메일이 반송된 주소예요",
  complained: "스팸 신고한 주소예요",
};

// gtm_mails is new (20261112100000) and not in the generated Database types yet.
export function gtmMailsTable(admin: ReturnType<typeof getSupabaseAdmin>) {
  return (admin as unknown as { from: (table: string) => any }).from("gtm_mails");
}

function kstDate(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" })
    .format(new Date(iso)).replace(/\s/g, "").replace(/\.$/, "");
}

/** The opt-out link's proof that it came from this mail (derived from the mail id with the server secret). */
export function gtmUnsubscribeToken(mailId: string) {
  return hashReplyToken(`gtm-unsubscribe:${mailId}`).slice(0, 32);
}

/** The mail's own opt-out page: a confirmation (GET) or Gmail's one-click unsubscribe (POST). */
export function gtmUnsubscribeUrl(mailId: string, origin: string = GTM_HARPER_ORIGIN) {
  const url = new URL("/api/email/gtm-unsubscribe", origin);
  url.searchParams.set("m", mailId);
  url.searchParams.set("t", gtmUnsubscribeToken(mailId));
  return url.toString();
}

/**
 * Opt-out from a GTM mail's link: the address goes on Harper's shared outreach suppression list, which every
 * GTM mail and every external introduction checks before sending. Idempotent.
 */
export async function unsubscribeGtmMail(args: { mailId: string; token: string }) {
  const mailId = args.mailId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mailId)) return { ok: false as const };
  const expected = Buffer.from(gtmUnsubscribeToken(mailId));
  const given = Buffer.from(args.token.trim().toLowerCase());
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false as const };
  const admin = getSupabaseAdmin();
  const { data, error } = await gtmMailsTable(admin).select("to_email").eq("id", mailId).maybeSingle();
  if (error) throw error;
  const to = (data as { to_email: string } | null)?.to_email;
  if (!to) return { ok: false as const };
  const { error: suppressError } = await admin.from("external_contact_suppressions")
    .upsert({ email_hash: externalEmailHash(to), reason: "unsubscribed", external_intro_request_id: null },
      { onConflict: "email_hash", ignoreDuplicates: true });
  if (suppressError) throw suppressError;
  return { ok: true as const };
}

/** What one mail is about, kept on its log row. */
export type GtmMailRowFacts = {
  campaign: GtmMailCampaign;
  audience: GtmMailAudience;
  company_name: string | null;
  company_workspace_id: string | null;
  role_id: string | null;
  posting_url: string | null;
  candidate_source: GtmCandidateSource | null;
  candidate_ref: string | null;
  talent_ids: string[];
  language: "ko" | "en";
  /**
   * gtm_mails.posting: #4 후보 메일 — the posting its Harper page shows before sign-up; #2 회사 메일 — the
   * posting the Role is made from when the company signs up from it.
   */
  posting?: GtmPostingSnapshot | null;
};

/** The posting as a candidate mail described it, kept on the mail for its Harper page. */
export type GtmPostingSnapshot = {
  title: string;
  companyName: string | null;
  location: string | null;
  description: string;
  url: string | null;
};

/**
 * Sends one GTM mail through Resend from the envelope's matchharper.com address (replies go back to it, CC as
 * set, List-Unsubscribe pointing at the sender). Refused, and logged as blocked, when the address opted out,
 * bounced or complained on Harper's external outreach list, or already got a GTM mail about the same posting in
 * the last 30 days (company mails: the same Role or posting; candidate mails: the same Role). Harper's own
 * addresses (tests) skip the 30-day check, never the opt-out list. These rules are GTM plays' own: no other
 * Harper mail reads them. The log row is written before the provider call, so a second click sees it; its id
 * goes into the mail (render).
 */
/** Harper's own inboxes (Chris's tests to himself, Shaun's +aliases): never someone we could pester. */
function isHarperAddress(email: string) {
  return email.endsWith(`@${GTM_SENDER_DOMAIN}`);
}

export async function deliverGtmMail(args: {
  user: User;
  envelope: GtmEnvelope;
  to: string;
  facts: GtmMailRowFacts;
  render: (id: string, links: { unsubscribeUrl: string }) => { subject: string; html: string; text: string };
}): Promise<GtmMailSendResult> {
  if (!gtmWritesEnabled()) throw new GtmWritesOffError();
  const to = args.to.trim().toLowerCase();
  if (!isGtmEmail(to)) throw new Error("받는 주소를 확인해 주세요.");
  const problem = gtmEnvelopeProblem(args.envelope);
  if (problem) throw new Error(problem);
  const admin = getSupabaseAdmin();
  const envelopeColumns = {
    from_name: args.envelope.fromName.trim(),
    from_email: args.envelope.fromEmail.trim().toLowerCase(),
    cc_emails: args.envelope.cc,
  };
  const links = (id: string) => ({ unsubscribeUrl: gtmUnsubscribeUrl(id, gtmMailLinkOrigin()) });
  const block = async (reason: string): Promise<GtmMailSendResult> => {
    const id = randomUUID();
    const rendered = args.render(id, links(id));
    const { error } = await gtmMailsTable(admin).insert({
      ...args.facts, ...envelopeColumns, id, to_email: to, subject: rendered.subject, html: rendered.html,
      text_body: rendered.text, sent_by: args.user.id, status: "blocked", error: reason,
    });
    if (error) throw error;
    return { status: "blocked", id, reason };
  };

  const { data: suppressed, error: suppressedError } = await admin.from("external_contact_suppressions")
    .select("reason").eq("email_hash", externalEmailHash(to)).maybeSingle();
  if (suppressedError) throw suppressedError;
  if (suppressed) return block(`보내지 않았어요 · ${SUPPRESSION_LABEL[suppressed.reason] ?? suppressed.reason}`);

  if (!isHarperAddress(to)) {
    let recentQuery = gtmMailsTable(admin).select("created_at")
      .eq("audience", args.facts.audience).eq("to_email", to).in("status", ["sending", "sent"])
      .gte("created_at", new Date(Date.now() - REPEAT_WINDOW_MS).toISOString());
    // One mail per address and posting: the Role (a customer's Role, or the GTM Role for candidates), else the
    // posting link, else the posting title; a company mail about no posting (#3 for the whole company) is its own.
    const posting = args.facts.posting?.title?.trim() || null;
    if (args.facts.role_id || args.facts.audience === "candidate") {
      recentQuery = args.facts.role_id ? recentQuery.eq("role_id", args.facts.role_id) : recentQuery.is("role_id", null);
    } else if (args.facts.posting_url) {
      recentQuery = recentQuery.is("role_id", null).eq("posting_url", args.facts.posting_url);
    } else if (posting) {
      recentQuery = recentQuery.is("role_id", null).is("posting_url", null).eq("posting->>title", posting);
    } else {
      recentQuery = recentQuery.is("role_id", null).is("posting_url", null).is("posting", null);
    }
    const { data: recent, error: recentError } = await recentQuery.order("created_at", { ascending: false }).limit(1);
    if (recentError) throw recentError;
    const last = (recent as Array<{ created_at: string }> | null)?.[0];
    if (last) return block(`30일 안에 같은 주소로 이 공고 메일을 보냈어요 (${kstDate(last.created_at)})`);
  }

  const id = randomUUID();
  const rendered = args.render(id, links(id));
  const { error: insertError } = await gtmMailsTable(admin).insert({
    ...args.facts, ...envelopeColumns, id, to_email: to, subject: rendered.subject, html: rendered.html,
    text_body: rendered.text, sent_by: args.user.id, status: "sending",
  });
  if (insertError) throw insertError;
  try {
    const sent = await sendResendEmail({
      from: gtmFromHeader(args.envelope),
      to,
      cc: args.envelope.cc.length ? args.envelope.cc : undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: envelopeColumns.from_email,
      // Gmail and Apple Mail show their own unsubscribe button for these; it posts to the same page.
      headers: {
        "List-Unsubscribe": `<${links(id).unsubscribeUrl}>, <mailto:${envelopeColumns.from_email}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      idempotencyKey: `gtm-mail:${id}`,
    });
    const sentAt = new Date().toISOString();
    const { error } = await gtmMailsTable(admin).update({ status: "sent", provider_message_id: sent.id ?? null }).eq("id", id);
    if (error) console.error("[gtm-plays] sent but the log update failed", id, error);
    return { status: "sent", id, sentAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { error: logError } = await gtmMailsTable(admin).update({ status: "failed", error: message.slice(0, 1_000) }).eq("id", id);
    if (logError) console.error("[gtm-plays] send failed and the log update failed", id, logError);
    throw error;
  }
}

/** #2 / #3: one company mail as rendered in the preview. */
export async function sendGtmCompanyMail(args: {
  user: User;
  envelope: GtmEnvelope;
  to: string;
  content: GtmMailContent;
  companyName: string | null;
  companyWorkspaceId: string | null;
  roleId: string | null;
  postingUrl: string | null;
  /** #2: the posting the cards were picked for; with it the buttons let the company sign up into a Role for it. */
  posting?: GtmPostingSnapshot | null;
}): Promise<GtmMailSendResult> {
  const invite = args.content.campaign === "pool" && Boolean(args.posting?.title?.trim()) && args.content.cards.length > 0;
  return deliverGtmMail({
    user: args.user,
    envelope: args.envelope,
    to: args.to,
    facts: {
      campaign: args.content.campaign, audience: "company", company_name: args.companyName,
      company_workspace_id: args.companyWorkspaceId, role_id: args.roleId, posting_url: args.postingUrl,
      candidate_source: null, candidate_ref: null, talent_ids: args.content.cards.map((card) => card.talentId),
      language: args.content.language,
      posting: invite ? args.posting : null,
    },
    render: (id, links) => renderGtmCompanyMail({
      ...args.content, senderName: args.envelope.fromName, senderEmail: args.envelope.fromEmail,
      unsubscribeUrl: links.unsubscribeUrl, inviteId: invite ? id : null,
    }),
  });
}

/**
 * The last sends (newest first) for the panel: to this address or company, or about this Role. Empty until the
 * table exists (local, or before the migration is applied).
 */
export async function listGtmMails(args: {
  to: string | null; companyName: string | null; roleId?: string | null; audience?: GtmMailAudience; limit?: number;
}) {
  const admin = getSupabaseAdmin();
  const to = args.to?.trim().toLowerCase() || null;
  const company = args.companyName?.trim() || null;
  const roleId = args.roleId?.trim() || null;
  const filters = [
    to ? `to_email.eq.${JSON.stringify(to)}` : null,
    company ? `company_name.eq.${JSON.stringify(company)}` : null,
    roleId ? `role_id.eq.${roleId}` : null,
  ].filter((item): item is string => Boolean(item));
  if (!filters.length) return { rows: [] as GtmMailLogRow[], available: true };
  const read = (columns: string) => {
    let query = gtmMailsTable(admin).select(columns).or(filters.join(","))
      .order("created_at", { ascending: false }).limit(args.limit ?? 5);
    if (args.audience) query = query.eq("audience", args.audience);
    return query;
  };
  let { data, error } = await read(LOG_COLUMNS + DELIVERY_COLUMNS);
  if (error?.code === "42703") ({ data, error } = await read(LOG_COLUMNS));
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { rows: [] as GtmMailLogRow[], available: false };
    throw error;
  }
  return { rows: (data ?? []) as GtmMailLogRow[], available: true };
}
