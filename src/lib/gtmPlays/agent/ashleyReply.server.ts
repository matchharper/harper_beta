import "server-only";

import { runCareerChatAssistant } from "@/lib/career/llm";
import { emailAssistantModel } from "@/lib/email/runtime/model";
import { getResendEmail, sendResendEmail } from "@/lib/email/send";
import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import { ASHLEY_CANDIDATE_KEY, ASHLEY_INTRO_PENDING, ASHLEY_INTRO_TAKEN } from "@/lib/org/agent/externalSourcing";
import { GtmWritesOffError, gtmWritesEnabled } from "../constants";
import { gtmRead, gtmWrite } from "../db.server";
import { gtmUnsubscribeUrl } from "../mailSend.server";
import { gtmFromHeader, gtmMailLinkOrigin } from "../shared";
import {
  processAshleyReplies, type AshleyIO, type AshleyMail, type AshleyPerson, type AshleyTick, type CompanyIntroAsk,
  type OutgoingMail, type QueuedReply, type RelayMark, type RelayRow,
} from "./ashleyAgent";
import { postInReplyThread } from "./ashleyHandoff.server";
import { companyAsk } from "./companyMail.server";
import { measured } from "./compose.server";
import type { ConversationStore } from "./conversation";
import { conversationStore, undecidedInboundForTick } from "./conversation.server";
import { internalRoles, matchAgentPostings } from "./match.server";
import type { InternalCandidate } from "./match";
import { routeToMember } from "./memberRoute.server";
import { optOutAgentAddress } from "./replies.server";
import { replyMailboxes } from "./replies";
import { reviewPostingText } from "./review";
import { sendWindowOf } from "./sendPace.server";
import { sendWindowOpen } from "./sendTiming";
import { recordAgentSpend, mayAgentSpend } from "./spend.server";
import { readAgentPerson, readAgentSettings, releaseAgentSendLease, takeAgentSendLease, updateAgentPerson } from "./store.server";
import { SEND_LEASE_MS } from "./tickRules";
import type { AgentPosting } from "./types";

/**
 * #5 Ashley's reply agent, wired to the database, the model, Resend and Slack (the rules: ashleyAgent.ts). The
 * dispatcher calls runAshleyReplies after the reply sync, every tick; it never throws.
 *
 * Model calls: Harper's chat loop (runCareerChatAssistant) with the member email model (emailAssistantModel), Ashley's
 * fixed prompt as the "career_main" block (so Career's tool policy is not added) and her own tools; the cost is
 * measured per mail and logged as spend step "reply" (a re-search as "match", like the first mail's matching).
 */

const AGENT = "agent";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING = new Set(["42P01", "42703"]);
const missingSchema = (error: unknown) => MISSING.has(String((error as { code?: string }).code));
/** Mails one tick decides at most (each is one or two model calls). */
export const ASHLEY_TICK_LIMIT = 5;
/** Time one tick spends on replies at most (the rest of the dispatcher tick follows). */
export const ASHLEY_TICK_BUDGET_MS = 90_000;
const SEND_TIMEOUT_MS = 20_000;

const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : "");

// ---------------------------------------------------------------------------------------------------------------
// Reads

type MailJson = {
  id: string; audience?: string | null; to_email?: string | null; from_name?: string | null; from_email?: string | null;
  subject?: string | null; postings?: unknown; agent_person_id?: string | null; rfc_message_id?: string | null;
  created_at?: string | null; company_mail?: { interestedPersonIds?: unknown } | null;
};

export async function readMail(id: string): Promise<AshleyMail | null> {
  if (!UUID.test(id)) return null;
  const [row] = await gtmRead((sql) => sql<Array<{ mail: MailJson }>>`select to_jsonb(m) as mail from public.gtm_mails m where m.id = ${id}::uuid`);
  const mail = row?.mail;
  if (!mail) return null;
  const interested = mail.company_mail?.interestedPersonIds;
  return {
    id: mail.id, audience: mail.audience === "company" ? "company" : "candidate", toEmail: String(mail.to_email ?? "").toLowerCase(),
    fromName: mail.from_name ?? null, fromEmail: mail.from_email ?? null, subject: mail.subject ?? "",
    language: null, postings: Array.isArray(mail.postings) ? (mail.postings as AgentPosting[]) : [],
    personId: mail.agent_person_id ?? null, rfcMessageId: mail.rfc_message_id ?? null, createdAt: iso(mail.created_at),
    interestedPersonIds: Array.isArray(interested) ? interested.filter((value): value is string => typeof value === "string" && UUID.test(value)) : [],
  };
}

export async function isMember(email: string): Promise<boolean> {
  const address = email.trim().toLowerCase();
  if (!address) return false;
  const [row] = await gtmRead((sql) => sql<Array<{ member: boolean }>>`
    select exists (select 1 from public.talent_users t where lower(t.email) = ${address} and t.deleted_at is null) as member
  `);
  return Boolean(row?.member);
}

export async function isSuppressed(email: string): Promise<boolean> {
  const address = email.trim().toLowerCase();
  if (!address) return false;
  const [row] = await gtmRead((sql) => sql<Array<{ suppressed: boolean }>>`
    select exists (select 1 from public.external_contact_suppressions s where s.email_hash = ${externalEmailHash(address)}) as suppressed
  `);
  return Boolean(row?.suppressed);
}

type RoleJson = {
  description?: string | null; work_mode?: string | null; seniority_level?: string | null; type?: string[] | null;
  location_text?: string | null; salary_min?: number | string | null; salary_max?: number | string | null;
  salary_currency?: string | null; salary_period?: string | null; salary_range?: string | null; salary_is_predicted?: boolean | null;
  is_expired?: boolean | null; expires_at?: string | null; status?: string | null;
};

/** The pay a customer's or GTM Role states (never a predicted one: that is not the posting's). Not for public postings. */
function salaryLine(row: RoleJson): string | null {
  if (row.salary_is_predicted) return null;
  const range = row.salary_range?.trim();
  const amounts = [row.salary_min, row.salary_max].map((value) => (value === null || value === undefined || value === "" ? null : Number(value)))
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  if (!range && !amounts.length) return null;
  const numbers = amounts.length ? amounts.map((value) => value.toLocaleString("en-US")).join("–") : "";
  return `Salary (posting): ${[range || numbers, row.salary_currency?.trim(), row.salary_period?.trim() ? `per ${row.salary_period.trim()}` : ""].filter(Boolean).join(" ")}`;
}

const closed = (row: RoleJson) => Boolean(row.is_expired)
  || (row.expires_at ? Date.parse(row.expires_at) <= Date.now() : false)
  || !["active", "top_priority"].includes(String(row.status ?? "active").trim().toLowerCase());

/** Per tick: the customer and GTM Roles with their text as mails may show it (a GTM Role's real company taken out). */
export function postingReader() {
  let internal: Promise<InternalCandidate[]> | null = null;
  return async (posting: AgentPosting): Promise<{ open: boolean | null; text: string | null }> => {
    if (!posting.roleId || !UUID.test(posting.roleId)) return { open: null, text: null };
    const [row] = await gtmRead((sql) => sql<Array<{ role: RoleJson }>>`
      select to_jsonb(r) as role from public.company_roles r where r.role_id = ${posting.roleId}::uuid
    `);
    const role = row?.role ?? null;
    const open = role ? !closed(role) : false;
    if (posting.kind === "external") {
      if (!role) return { open, text: null };
      // No stored pay for a public posting: it comes from the job board, not the company, and differed from the
      // company's own page in 5 of 13 checked on 11/21 (one stated none at all). Pay the company wrote is in its text.
      const text = [role.location_text ? `Location: ${role.location_text}` : null, reviewPostingText(role)].filter(Boolean).join("\n");
      return { open, text: text || null };
    }
    internal ??= internalRoles().catch(() => []);
    const candidate = (await internal).find((item) => item.meta.roleId === posting.roleId);
    if (!candidate) return { open, text: null };
    const text = [
      candidate.row.location_text ? `Location: ${candidate.row.location_text}` : null,
      salaryLine(candidate.row as RoleJson), reviewPostingText(candidate.row),
    ].filter(Boolean).join("\n");
    return { open, text: text || null };
  };
}

async function latestInbound(personId: string) {
  const [row] = await gtmRead((sql) => sql<Array<{ subject: string; rfc_message_id: string | null; references_header: string | null; new_text: string; body_text: string }>>`
    select subject, rfc_message_id, references_header, new_text, body_text from public.gtm_agent_messages
    where person_id = ${personId}::uuid and author = 'counterpart' and counterpart_kind = 'candidate'
    order by occurred_at desc limit 1
  `);
  return row ? { subject: row.subject, rfcMessageId: row.rfc_message_id, references: row.references_header, newText: row.new_text, bodyText: row.body_text } : null;
}

/** Queued replies older than this are picked up by the next tick (a younger one may be on its way right now). */
const QUEUED_GRACE_MS = 2 * 60_000;

async function queuedReplies(limit: number): Promise<QueuedReply[]> {
  const rows = await gtmRead((sql) => sql<Array<{
    id: string; counterpart_email: string; counterpart_kind: "candidate" | "company"; person_id: string | null; root_mail_id: string | null;
    subject: string; body_text: string; in_reply_to: string | null; references_header: string | null;
    inbound_id: string; inbound_email: string; inbound_body: string; inbound_at: Date | string; inbound_reason: string | null;
    inbound_rfc: string | null; inbound_person: string | null; inbound_from: string | null;
  }>>`
    select o.id, o.counterpart_email, o.counterpart_kind, o.person_id, o.root_mail_id, o.subject, o.body_text, o.in_reply_to,
      o.references_header, i.id as inbound_id, i.counterpart_email as inbound_email, i.body_text as inbound_body,
      i.occurred_at as inbound_at, i.decision_reason as inbound_reason, i.rfc_message_id as inbound_rfc, i.person_id as inbound_person,
      to_jsonb(i) ->> 'from_email' as inbound_from
    from public.gtm_agent_messages o
    join public.gtm_agent_messages i on i.id = o.answers_message_id
    where o.author = 'ashley' and o.send_status = 'queued' and o.created_at < ${new Date(Date.now() - QUEUED_GRACE_MS)}
    order by o.created_at limit ${limit}::int
  `);
  return rows.map((row) => ({
    id: row.id, counterpartEmail: row.counterpart_email, counterpartKind: row.counterpart_kind, personId: row.person_id,
    rootMailId: row.root_mail_id, subject: row.subject, bodyText: row.body_text, inReplyTo: row.in_reply_to, references: row.references_header,
    inbound: {
      id: row.inbound_id, counterpartEmail: row.inbound_email, bodyText: row.inbound_body, occurredAt: iso(row.inbound_at),
      decisionReason: row.inbound_reason, rfcMessageId: row.inbound_rfc, personId: row.inbound_person, fromEmail: row.inbound_from,
    },
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Relays (gtm_agent_relays)

type RelayDbRow = {
  company_email: string; person_id: string; kind: RelayRow["kind"]; company_mail_id: string | null; candidate_noted_at: Date | string | null;
  company_noted_at: Date | string | null; company_link_sent_at: Date | string | null; created_at: Date | string;
};
const mapRelay = (row: RelayDbRow): RelayRow => ({
  companyEmail: row.company_email, personId: row.person_id, kind: row.kind, companyMailId: row.company_mail_id ?? "",
  candidateNotedAt: row.candidate_noted_at ? iso(row.candidate_noted_at) : null, companyNotedAt: row.company_noted_at ? iso(row.company_noted_at) : null,
  companyLinkSentAt: row.company_link_sent_at ? iso(row.company_link_sent_at) : null, createdAt: iso(row.created_at),
});

const relays: AshleyIO["relays"] = {
  async forPerson(personId) {
    try {
      const rows = await gtmRead((sql) => sql<RelayDbRow[]>`select * from public.gtm_agent_relays where person_id = ${personId}::uuid order by created_at`);
      return rows.map(mapRelay);
    } catch (error) {
      if (missingSchema(error)) return [];
      throw error;
    }
  },
  async get(companyEmail, personId) {
    const [row] = await gtmRead((sql) => sql<RelayDbRow[]>`
      select * from public.gtm_agent_relays where company_email = ${companyEmail.toLowerCase()} and person_id = ${personId}::uuid
    `);
    return row ? mapRelay(row) : null;
  },
  async claim(row) {
    const inserted = await gtmWrite((sql) => sql`
      insert into public.gtm_agent_relays (company_email, person_id, kind, company_mail_id, inbound_message_id)
      values (${row.companyEmail.toLowerCase()}, ${row.personId}::uuid, ${row.kind}, ${row.companyMailId}::uuid, ${row.inboundMessageId}::uuid)
      on conflict (company_email, person_id) do nothing
      returning person_id
    `);
    return inserted.length > 0;
  },
  async mark(companyEmail, personId, field: RelayMark, providerId) {
    const updated = await gtmWrite((sql) => sql`
      update public.gtm_agent_relays set ${sql(field)} = now()
        ${field === "company_link_sent_at" ? sql`, company_link_provider_id = ${providerId ?? null}` : sql``}
      where company_email = ${companyEmail.toLowerCase()} and person_id = ${personId}::uuid and ${sql(field)} is null
      returning person_id
    `);
    return updated.length > 0;
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Companies' connection requests on Ashley's 외부 후보 cards (external_intro_requests, ASHLEY_INTRO_PENDING)

const INTRO_TAKEN = ASHLEY_INTRO_TAKEN;
const INTRO_TAKEN_STALE = "15 minutes";

/** Takes the waiting requests for this tick (a request taken by a tick that died is taken again after 15 minutes). */
async function companyIntroAsks(limit: number): Promise<CompanyIntroAsk[]> {
  const rows = await gtmWrite((sql) => sql<Array<{ id: string; person_key: string; company_mail_id: string | null; created_at: Date | string }>>`
    with due as (
      select r.id from public.external_intro_requests r
      where r.status = ${ASHLEY_INTRO_PENDING}
         or (r.status = ${INTRO_TAKEN} and r.updated_at < now() - ${INTRO_TAKEN_STALE}::interval)
      order by r.created_at limit ${limit}
      for update skip locked
    )
    update public.external_intro_requests r set status = ${INTRO_TAKEN}, updated_at = now()
    from due, public.external_candidates c
    where r.id = due.id and c.id = r.external_candidate_id and c.company_decision is distinct from 'passed'
    returning r.id::text as id, c.person_key, c.screen->>'gtmMailId' as company_mail_id, r.created_at
  `);
  return rows.flatMap((row) => row.person_key.startsWith(ASHLEY_CANDIDATE_KEY) ? [{
    id: row.id, personId: row.person_key.slice(ASHLEY_CANDIDATE_KEY.length), companyMailId: row.company_mail_id, requestedAt: iso(row.created_at),
  }] : []);
}

/** Still taken by this tick and the company has not passed on the person (Pass cancels it). */
async function companyIntroStillWanted(id: string): Promise<boolean> {
  const [row] = await gtmRead((sql) => sql<Array<{ wanted: boolean }>>`
    select (r.status = ${INTRO_TAKEN} and c.company_decision is distinct from 'passed') as wanted
    from public.external_intro_requests r join public.external_candidates c on c.id = r.external_candidate_id
    where r.id = ${id}::uuid
  `);
  return Boolean(row?.wanted);
}

/** told → invited (the company's card says 연결 요청함); not told → not_sendable (a person takes it); later → waiting again. */
async function closeCompanyIntroAsk(id: string, end: Parameters<NonNullable<AshleyIO["closeCompanyIntroAsk"]>>[1]): Promise<void> {
  await gtmWrite((sql) => "later" in end
    ? sql`update public.external_intro_requests set status = ${ASHLEY_INTRO_PENDING}, updated_at = now() where id = ${id}::uuid and status = ${INTRO_TAKEN}`
    : end.told
      ? sql`update public.external_intro_requests set status = 'invited', invited_at = now(), updated_at = now(), error_code = null,
          result = coalesce(result, '{}'::jsonb) || jsonb_build_object('via', 'ashley', 'providerMessageId', ${end.providerId ?? null}::text)
          where id = ${id}::uuid and status = ${INTRO_TAKEN}`
      : sql`update public.external_intro_requests set status = 'not_sendable', error_code = 'ashley_handed_off', updated_at = now(),
          result = coalesce(result, '{}'::jsonb) || jsonb_build_object('via', 'ashley', 'reason', ${end.reason.slice(0, 300)}::text)
          where id = ${id}::uuid and status = ${INTRO_TAKEN}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Writes

async function send(mail: OutgoingMail): Promise<{ providerMessageId: string | null; rfcMessageId: string | null }> {
  if (!gtmWritesEnabled()) throw new GtmWritesOffError();
  const sent = await sendResendEmail({
    from: gtmFromHeader({ fromName: mail.fromName, fromEmail: mail.fromEmail }), to: mail.to, subject: mail.subject,
    html: mail.html, text: mail.text, replyTo: mail.fromEmail, headers: mail.headers, idempotencyKey: mail.idempotencyKey,
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  const providerMessageId = sent.id ?? null;
  // The RFC Message-ID (the next reply's In-Reply-To): read back once; a later read is not needed to send.
  const rfcMessageId = providerMessageId ? await getResendEmail(providerMessageId).then((email) => email.message_id ?? null).catch(() => null) : null;
  return { providerMessageId, rfcMessageId };
}

async function stopContact(args: { personId: string | null; mailId: string | null; email: string; note: string }) {
  await optOutAgentAddress(args.mailId, args.email);
  if (!args.personId) return;
  const person = await readAgentPerson(args.personId);
  if (!person || person.events.some((event) => event.kind === "unsubscribed")) return;
  await updateAgentPerson(person.id, {
    ...(person.status === "sent" ? { status: "ended" as const } : {}),
    endedAt: person.endedAt ?? new Date().toISOString(), followupDueAt: null,
  }, { kind: "unsubscribed", by: AGENT, note: args.note.slice(0, 300) }, [person.status]);
}

// ---------------------------------------------------------------------------------------------------------------
// The tick

/**
 * One Ashley model call through Harper's chat loop with the member email model; what it cost is measured (the caller
 * logs it). Also used by the replay.
 */
export const ashleyLlm: AshleyIO["llm"] = async (call) => {
  const { value, costUsd } = await measured("reply", () => runCareerChatAssistant({
    ...emailAssistantModel(),
    systemBlocks: call.system.map((block) => ({ key: block.key, text: block.text })),
    messages: [{ role: "user", content: call.message }],
    tools: call.tools,
    stopAfterToolNames: call.stopAfter,
    executeTool: ({ name, input }) => call.executeTool(name, input ?? {}),
    usageLabel: call.label,
  }));
  return { text: typeof value === "string" ? value : "", costUsd };
};

export type AshleyDeps = {
  /** The conversation store (default: conversation.server.ts, its queue read tolerant of a missing table). */
  store?: ConversationStore;
  limit?: number;
  now?: Date;
  budgetMs?: number;
  /** Where asking a posting's company stands for a candidate (default: agent/companyMail.server.ts companyAsk). */
  companyAsk?: AshleyIO["companyAsk"];
  /** A signed-up person's mail to Harper's chat (default: memberRoute.server.ts). */
  routeToMember?: AshleyIO["routeToMember"];
};

/** The server's I/O for the agent (the replay builds its own, read-only, with no sender). */
export async function ashleyServerIO(deps: AshleyDeps = {}): Promise<AshleyIO> {
  const settings = await readAgentSettings();
  const window = sendWindowOf(settings);
  const readPosting = postingReader();
  const store: ConversationStore = deps.store ?? { ...conversationStore, listUndecidedInbound: undecidedInboundForTick };
  return {
    store,
    settings: {
      replyAgentEnabled: settings.replyAgentEnabled,
      handoffSlackUserId: settings.handoffSlackUserId,
      senderName: settings.senderName?.trim() || "Ashley Kim",
      senderEmail: settings.senderEmail?.trim() || "ashley@matchharper.com",
      windowOpen: (at) => sendWindowOpen(at, window),
      origin: gtmMailLinkOrigin(),
      mailbox: replyMailboxes(process.env.GTM_AGENT_REPLY_MAILBOXES, settings.senderEmail)[0] ?? null,
    },
    readPerson: (id) => readAgentPerson(id) as Promise<AshleyPerson | null>,
    readMail,
    isMember,
    isSuppressed,
    postingState: readPosting,
    async findSimilar(person, conditions, sent) {
      const full = await readAgentPerson(person.id);
      if (!full || !(await mayAgentSpend(settings.dailyCostUsd))) return [];
      const match = await matchAgentPostings({
        ...full, signalText: [full.signalText, `What they asked for in their reply: ${conditions}`].filter(Boolean).join("\n\n"),
      }, { excludeCompanyNames: [...new Set(sent.map((posting) => posting.companyName))] });
      await recordAgentSpend({ step: "match", usd: match.costUsd, personId: full.id, isTest: full.isTest });
      const key = (posting: AgentPosting) => (posting.url || posting.roleId || "").trim().toLowerCase();
      const known = new Set(sent.map(key).filter(Boolean));
      return match.postings.filter((posting) => !known.has(key(posting))).slice(0, 2);
    },
    llm: ashleyLlm,
    maySpend: () => mayAgentSpend(settings.dailyCostUsd),
    recordSpend: (usd, person) => recordAgentSpend({ step: "reply", usd, personId: person?.id ?? null, isTest: person?.isTest ?? false }),
    send,
    slack: (text, personId) => postInReplyThread(text, personId),
    stopContact,
    notePerson: async (personId, note, postings) => {
      await updateAgentPerson(personId, {}, { kind: "note", by: AGENT, note: note.slice(0, 300), postings: postings?.slice(0, 4) });
    },
    unsubscribeUrl: (mailId) => gtmUnsubscribeUrl(mailId, gtmMailLinkOrigin()),
    relays,
    routeToMember: deps.routeToMember ?? routeToMember,
    companyAsk: deps.companyAsk ?? ((input) => companyAsk(input, { store })),
    latestInbound,
    queuedReplies: (limit) => queuedReplies(limit).catch((error) => {
      if (missingSchema(error)) return [];
      throw error;
    }),
    companyIntroAsks,
    closeCompanyIntroAsk,
    companyIntroStillWanted,
  };
}

/**
 * One dispatcher tick of Ashley's replies (after the reply sync): the undecided inbound mails, oldest first, at most
 * `limit`, within `budgetMs`. Never throws: a failure is in the result and the tick goes on.
 */
export async function runAshleyReplies(args: AshleyDeps = {}): Promise<AshleyTick> {
  const now = args.now ?? new Date();
  try {
    if (!gtmWritesEnabled()) return { ran: false, reason: "writes_off", outcomes: {}, errors: [] };
    // The one send lease (agent/tickRules.ts SEND_LEASE_MS): Ashley sends mail too, and two overlapping dispatches
    // must never decide (and hand off) the same mail twice. Busy: this tick skips, the next one answers.
    const lease = await takeAgentSendLease(SEND_LEASE_MS);
    if (!lease) return { ran: false, reason: "send_lease_busy", outcomes: {}, errors: [] };
    try {
      const io = await ashleyServerIO(args);
      return await processAshleyReplies(io, { limit: args.limit ?? ASHLEY_TICK_LIMIT, now, deadline: Date.now() + (args.budgetMs ?? ASHLEY_TICK_BUDGET_MS) });
    } finally {
      await releaseAgentSendLease(lease).catch((error) => console.error("[gtm-agent] send lease not released after Ashley", error));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[gtm-agent] Ashley replies failed", message);
    return { ran: false, reason: missingSchema(error) ? "not_migrated" : "error", outcomes: {}, errors: [message.slice(0, 300)] };
  }
}
