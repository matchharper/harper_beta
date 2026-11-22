import "server-only";

import { ASHLEY_CANDIDATE_KEY } from "@/lib/org/agent/externalSourcing";
import { gtmRead, type GtmReadSql } from "../db.server";
import { REACTED_STAGES } from "../outreachFunnel";
import { SUPERSEDED_REASON } from "./ashleyAgent";
import type { AshleyDecisionKind, ConversationMessage, CounterpartKind, InterestSignal, MessageAuthor } from "./conversation";
import type { CompanyMailFacts } from "./companyMail";
import type { AgentMailKind } from "./conversationView";
import { gtmSignupsCte } from "./signups.server";
import type { AgentReached } from "./stage";
import { mapAgentPerson, readAgentPerson } from "./store.server";
import {
  buildPersonThread, type PersonThread, type ThreadCompanyMail, type ThreadConnection, type ThreadFacts, type ThreadHarperMessage,
  type ThreadIntroRequest, type ThreadMail, type ThreadMessage, type ThreadRelay, type ThreadStage, type ThreadSummary,
} from "./thread";
import type { AgentPerson, AgentPosting } from "./types";
import { agentReachedByPerson } from "./views.server";

/**
 * #5 로그 · 사람 (Shaun 11/22): the reads behind one candidate's whole thread (thread.ts builds it) — the right pane's
 * table (readAgentThread) and, for the list, each line's 지금 · 마지막 (threadSummaries). One reader serves both, so a
 * line's words are the table's own latest row. Every table past gtm_mails is optional (checked
 * first: a failed statement would end the read-only transaction), so the thread shows what is there.
 */

const MISSING = new Set(["42P01", "42703"]);
const isMissing = (error: unknown) => MISSING.has(String((error as { code?: string })?.code ?? ""));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : null);
const lower = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
/** The list line's text is a preview: each text is read up to this many characters there (the pane reads it whole). */
const PREVIEW_CHARS = 600;
/** The most people a list asks for at once (the log's page is at most 200). */
const SUMMARY_PEOPLE_MAX = 200;

type Ready = {
  messages: boolean; fromEmail: boolean; companyMail: boolean; relays: boolean; intros: boolean; contacts: boolean;
  stages: boolean; recommendations: boolean; connections: boolean;
};

async function readyTables(sql: GtmReadSql): Promise<Ready> {
  const [row] = await sql<Ready[]>`
    select to_regclass('public.gtm_agent_messages') is not null as messages,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gtm_agent_messages' and column_name = 'from_email') as "fromEmail",
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gtm_mails' and column_name = 'company_mail') as "companyMail",
      to_regclass('public.gtm_agent_relays') is not null as relays,
      (to_regclass('public.external_intro_requests') is not null and to_regclass('public.external_candidates') is not null) as intros,
      to_regclass('public.agent_contact_messages') is not null as contacts,
      to_regclass('public.talent_decision_events') is not null as stages,
      to_regclass('public.talent_opportunity_recommendation') is not null as recommendations,
      to_regclass('public.company_intro_candidates') is not null as connections
  `;
  return row;
}

type MailRow = {
  id: string; person_id: string | null; subject: string; text_body: string | null; html: string | null; to_email: string; from_email: string;
  status: string; delivery_status: string | null; delivery_event_at: string | Date | null; created_at: string | Date;
  first_opened_at: string | Date | null; open_count: number | null; unsubscribed_at: string | Date | null; audience: string | null;
  postings: AgentPosting[] | null; rfc_message_id: string | null; claimed_talent_id: string | null; claimed_recommendation_id: string | null;
  role_id: string | null; signed_up_at: string | Date | null;
};

type MessageRow = {
  id: string; person_id: string | null; counterpart_kind: CounterpartKind; counterpart_email: string; from_email: string | null;
  author: MessageAuthor; direction: "inbound" | "outbound"; gmail_thread_id: string | null; rfc_message_id: string | null;
  in_reply_to: string | null; subject: string | null; body_text: string | null; new_text: string | null; root_mail_id: string | null;
  decision: AshleyDecisionKind | null; decision_reason: string | null; signals: unknown; answers_message_id: string | null;
  answered_by_message_id: string | null; send_status: ConversationMessage["sendStatus"]; provider_message_id: string | null;
  error: string | null; occurred_at: string | Date; decided_at: string | Date | null;
};

type CompanyMailRow = {
  id: string; to_email: string; subject: string; created_at: string | Date; status: string; delivery_status: string | null;
  company_name: string | null; posting_title: string | null; posting_url: string | null; rfc_message_id: string | null;
  company_mail: Partial<CompanyMailFacts> | null; claimed_at: string | Date | null; workspace_name: string | null;
};

/** Everything one person's thread is built from, plus the current Harper stage of their proposed postings (by Role). */
type PersonFacts = { facts: ThreadFacts; postingStages: Record<string, string> };

const roleIdsOf = (person: Pick<AgentPerson, "postings">) =>
  person.postings.flatMap((posting) => (posting.roleId && UUID.test(posting.roleId) ? [posting.roleId] : []));

/**
 * The facts of each person's thread: their mails (first, follow-up, any mail to their address, as the 대화 read them),
 * their conversation rows and those of the company threads about them, the company mails carrying them, what was passed
 * on (gtm_agent_relays), the companies' connection requests, and — through the Harper account their mails were claimed
 * by — the messages with customer companies inside Harper, the proposed postings' recorded stage changes and 회사 연결.
 * `full`: whole texts and the mails' HTML (the pane); otherwise previews (the list).
 */
async function readThreadFacts(sql: GtmReadSql, people: readonly AgentPerson[], full: boolean): Promise<Map<string, PersonFacts>> {
  const out = new Map<string, PersonFacts>();
  if (!people.length) return out;
  const ready = await readyTables(sql);
  const ids = people.map((person) => person.id);
  const emails = [...new Set(people.map((person) => lower(person.email)).filter(Boolean))];
  const ownMailIds = people.flatMap((person) => [person.mailId, person.followupMailId].filter((id): id is string => Boolean(id)));
  const text = (column: ReturnType<GtmReadSql>) => (full ? column : sql`left(${column}, ${PREVIEW_CHARS}::int)`);

  const mailRows = await sql<MailRow[]>`
    with gtm_signups as materialized ${gtmSignupsCte(sql)}
    select m.id::text as id, m.agent_person_id::text as person_id, m.subject, ${text(sql`m.text_body`)} as text_body,
      ${full ? sql`m.html` : sql`null::text`} as html, m.to_email, m.from_email, m.status, m.delivery_status, m.delivery_event_at,
      m.created_at, m.first_opened_at, m.open_count, m.unsubscribed_at, m.audience, m.postings, m.rfc_message_id,
      m.claimed_talent_id::text as claimed_talent_id, m.claimed_recommendation_id::text as claimed_recommendation_id,
      m.role_id::text as role_id,
      least(m.claimed_at, (select s.at from gtm_signups s where s.mail_id = m.id::text)) as signed_up_at
    from public.gtm_mails m
    where m.id = any(${ownMailIds}::uuid[]) or m.to_email = any(${emails}::text[])
    order by m.created_at limit ${200 * people.length}::int
  `;

  const companyRows = ready.companyMail ? await sql<CompanyMailRow[]>`
    select m.id::text as id, m.to_email, m.subject, m.created_at, m.status, m.delivery_status, m.company_name,
      m.posting ->> 'title' as posting_title, m.posting_url, m.rfc_message_id, m.company_mail, m.claimed_at,
      coalesce(nullif(w.published_name, ''), w.company_name) as workspace_name
    from public.gtm_mails m left join public.company_workspace w on w.company_workspace_id = m.company_workspace_id
    where m.campaign = 'agent' and m.audience = 'company' and exists (
      select 1 from jsonb_array_elements_text(case when jsonb_typeof(m.company_mail -> 'interestedPersonIds') = 'array'
        then m.company_mail -> 'interestedPersonIds' else '[]'::jsonb end) x(id)
      where x.id = any(${ids}::text[]))
    order by m.created_at limit 1000
  ` : [];
  const companyMailIds = companyRows.map((row) => row.id);

  const relayRows = ready.relays ? await sql<Array<{
    company_email: string; person_id: string; kind: string; company_mail_id: string | null; inbound_message_id: string | null;
    created_at: string | Date; joined_noted_at: string | Date | null;
  }>>`
    select r.company_email, r.person_id::text as person_id, r.kind, r.company_mail_id::text as company_mail_id,
      r.inbound_message_id::text as inbound_message_id, r.created_at, r.joined_noted_at
    from public.gtm_agent_relays r where r.person_id = any(${ids}::uuid[])
  ` : [];
  const relayInboundIds = relayRows.flatMap((row) => (row.inbound_message_id ? [row.inbound_message_id] : []));

  const messageRows = ready.messages ? await sql<MessageRow[]>`
    select c.id::text as id, c.person_id::text as person_id, c.counterpart_kind, c.counterpart_email,
      ${ready.fromEmail ? sql`c.from_email` : sql`null::text`} as from_email, c.author, c.direction, c.gmail_thread_id,
      c.rfc_message_id, c.in_reply_to, c.subject, ${text(sql`c.body_text`)} as body_text, ${text(sql`c.new_text`)} as new_text,
      c.root_mail_id::text as root_mail_id, c.decision, c.decision_reason, c.signals, c.answers_message_id::text as answers_message_id,
      c.answered_by_message_id::text as answered_by_message_id, c.send_status, c.provider_message_id, c.error, c.occurred_at,
      c.decided_at
    from public.gtm_agent_messages c
    where c.person_id = any(${ids}::uuid[]) or c.counterpart_email = any(${emails}::text[])
      or c.root_mail_id = any(${companyMailIds}::uuid[]) or c.id = any(${relayInboundIds}::uuid[])
    order by c.occurred_at, c.created_at limit ${500 * people.length}::int
  ` : [];

  const introRows = ready.intros ? await sql<Array<{
    id: string; person_id: string; company_mail_id: string | null; status: string; created_at: string | Date;
    invited_at: string | Date | null; accepted_at: string | Date | null; connected_at: string | Date | null; error_code: string | null;
    reason: string | null; provider_message_id: string | null; company_appeal: string | null; company_name: string | null; role_name: string | null;
  }>>`
    select r.id::text as id, substring(c.person_key from ${ASHLEY_CANDIDATE_KEY.length + 1}::int) as person_id,
      c.screen ->> 'gtmMailId' as company_mail_id, r.status, r.created_at, r.invited_at, r.accepted_at, r.connected_at, r.error_code,
      r.result ->> 'reason' as reason, r.result ->> 'providerMessageId' as provider_message_id, r.company_appeal,
      coalesce(nullif(w.published_name, ''), w.company_name) as company_name, ro.name as role_name
    from public.external_intro_requests r
    join public.external_candidates c on c.id = r.external_candidate_id
    left join public.company_workspace w on w.company_workspace_id = r.company_workspace_id
    left join public.company_roles ro on ro.role_id = r.role_id
    where c.person_key = any(${ids.map((id) => `${ASHLEY_CANDIDATE_KEY}${id}`)}::text[])
  ` : [];

  // Their Harper account: the talent their mails were claimed by (gtm_mails.claimed_talent_id).
  const mailsOf = (person: AgentPerson) => mailRows.filter((row) => row.id === person.mailId || row.id === person.followupMailId
    || (person.email && lower(row.to_email) === lower(person.email)));
  const talentIds = [...new Set(mailRows.flatMap((row) => (row.claimed_talent_id ? [row.claimed_talent_id] : [])))];
  const harperRows = ready.contacts && talentIds.length ? await sql<Array<{
    id: string; root_id: string; talent_id: string; direction: "to_company" | "to_talent"; body: string; created_at: string | Date;
    cancelled_at: string | Date | null; company_name: string | null; role_name: string | null;
  }>>`
    select a.id::text as id, a.root_id::text as root_id, a.talent_id::text as talent_id, a.direction, ${text(sql`a.body`)} as body,
      a.created_at, a.cancelled_at, coalesce(nullif(w.published_name, ''), w.company_name) as company_name, ro.name as role_name
    from public.agent_contact_messages a
    left join public.company_workspace w on w.company_workspace_id = a.company_workspace_id
    left join public.company_roles ro on ro.role_id = a.role_id
    where a.talent_id = any(${talentIds}::uuid[])
    order by a.created_at, a.id limit 2000
  ` : [];
  const reacted = [...REACTED_STAGES];
  const stageRows = ready.stages && talentIds.length ? await sql<Array<{
    key: string; talent_id: string; role_id: string | null; recommendation_id: string | null; created_at: string | Date; stage: string;
    company_name: string | null; role_name: string | null;
  }>>`
    select e.id::text as key, e.talent_id::text as talent_id, e.role_id::text as role_id, e.recommendation_id::text as recommendation_id,
      e.created_at, e.detail -> 'new' ->> 'savedStage' as stage,
      coalesce(nullif(w.published_name, ''), w.company_name) as company_name, ro.name as role_name
    from public.talent_decision_events e
    left join public.company_roles ro on ro.role_id = e.role_id
    left join public.company_workspace w on w.company_workspace_id = ro.company_workspace_id
    where e.talent_id = any(${talentIds}::uuid[]) and e.detail -> 'new' ->> 'savedStage' = any(${reacted}::text[])
      and (e.detail -> 'new' ->> 'savedStage') is distinct from (e.detail -> 'previous' ->> 'savedStage')
    order by e.created_at limit 2000
  ` : [];
  const recommendationRows = full && ready.recommendations && talentIds.length ? await sql<Array<{
    id: string; talent_id: string; role_id: string | null; saved_stage: string;
  }>>`
    select r.id::text as id, r.talent_id::text as talent_id, r.role_id::text as role_id, r.saved_stage
    from public.talent_opportunity_recommendation r
    where r.talent_id = any(${talentIds}::uuid[]) and r.saved_stage = any(${reacted}::text[])
  ` : [];
  const connectionRows = ready.connections && talentIds.length ? await sql<Array<{
    key: string; talent_id: string; role_id: string | null; at: string | Date; company_name: string | null; role_name: string | null;
  }>>`
    select c.id::text as key, c.talent_id::text as talent_id, c.role_id::text as role_id, coalesce(c.connected_at, c.updated_at) as at,
      coalesce(nullif(w.published_name, ''), w.company_name) as company_name, ro.name as role_name
    from public.company_intro_candidates c
    left join public.company_workspace w on w.company_workspace_id = c.company_workspace_id
    left join public.company_roles ro on ro.role_id = c.role_id
    where c.talent_id = any(${talentIds}::uuid[]) and (c.status = 'connected' or c.connected_at is not null)
  ` : [];

  for (const person of people) {
    const own = mailsOf(person);
    const companyMails = companyRows.filter((row) => (row.company_mail?.interestedPersonIds ?? []).includes(person.id));
    const companyIds = new Set(companyMails.map((row) => row.id));
    const relays = relayRows.filter((row) => row.person_id === person.id);
    const relayInbound = new Set(relays.flatMap((row) => (row.inbound_message_id ? [row.inbound_message_id] : [])));
    const email = lower(person.email);
    const messages = messageRows.filter((row) => row.person_id === person.id || (email && lower(row.counterpart_email) === email && row.counterpart_kind === "candidate")
      || (row.root_mail_id && companyIds.has(row.root_mail_id)) || relayInbound.has(row.id));
    const talents = new Set(own.flatMap((row) => (row.claimed_talent_id ? [row.claimed_talent_id] : [])));
    // The proposed postings, as 관심·지원 and 회사 연결 count them (views.server.ts agentFunnelRows): their Roles, the first
    // and follow-up mails' Role and claimed recommendation.
    const ownFirst = own.filter((row) => row.id === person.mailId || row.id === person.followupMailId);
    const roles = new Set([...roleIdsOf(person), ...ownFirst.flatMap((row) => (row.role_id ? [row.role_id] : []))]);
    const recommendations = new Set(ownFirst.flatMap((row) => (row.claimed_recommendation_id ? [row.claimed_recommendation_id] : [])));
    const proposed = (row: { talent_id: string; role_id: string | null; recommendation_id?: string | null; id?: string }) => talents.has(row.talent_id)
      && ((row.role_id !== null && roles.has(row.role_id)) || recommendations.has(row.recommendation_id ?? row.id ?? ""));
    const mails: ThreadMail[] = own.map((row) => ({
      id: row.id, subject: row.subject ?? "",
      kind: row.id === person.followupMailId ? "followup" : row.id === person.mailId ? "first" : row.audience === "company" ? "company" : "mail",
      textBody: row.text_body ?? "", html: row.html, toEmail: row.to_email, fromEmail: row.from_email, status: row.status,
      deliveryStatus: row.delivery_status, deliveryEventAt: iso(row.delivery_event_at), sentAt: iso(row.created_at) ?? "",
      firstOpenedAt: iso(row.first_opened_at), openCount: Number(row.open_count ?? 0), unsubscribedAt: iso(row.unsubscribed_at),
      signedUpAt: iso(row.signed_up_at), rfcMessageId: row.rfc_message_id,
      postings: (Array.isArray(row.postings) ? row.postings : []).map((posting) => ({ companyName: posting.companyName, title: posting.title, kind: posting.kind ?? null })),
    }));
    const facts: ThreadFacts = {
      person,
      postings: person.postings.map((posting) => ({ companyName: posting.companyName, title: posting.title, kind: posting.kind ?? null })),
      mails,
      messages: messages.map((row): ThreadMessage => ({
        id: row.id, personId: row.person_id, counterpartKind: row.counterpart_kind, counterpartEmail: row.counterpart_email,
        fromEmail: row.from_email, author: row.author, direction: row.direction, gmailThreadId: row.gmail_thread_id,
        rfcMessageId: row.rfc_message_id, inReplyTo: row.in_reply_to, subject: row.subject ?? "", bodyText: row.body_text ?? "",
        newText: row.new_text ?? "", rootMailId: row.root_mail_id, decision: row.decision, decisionReason: row.decision_reason,
        signals: Array.isArray(row.signals) ? (row.signals as InterestSignal[]) : [], answersMessageId: row.answers_message_id,
        answeredByMessageId: row.answered_by_message_id, sendStatus: row.send_status, providerMessageId: row.provider_message_id,
        error: row.error, occurredAt: iso(row.occurred_at) ?? "", decidedAt: iso(row.decided_at),
        answeredWithLater: row.decision === "no_reply" && Boolean(row.decision_reason?.startsWith(SUPERSEDED_REASON)),
      })),
      companyMails: companyMails.map((row): ThreadCompanyMail => ({
        id: row.id, toEmail: row.to_email, subject: row.subject, sentAt: iso(row.created_at) ?? "", status: row.status,
        deliveryStatus: row.delivery_status, companyName: row.company_name ?? "", postingTitle: row.posting_title,
        postingUrl: row.posting_url, rfcMessageId: row.rfc_message_id, facts: row.company_mail, claimedAt: iso(row.claimed_at),
        workspaceName: row.workspace_name,
      })),
      relays: relays.map((row): ThreadRelay => ({
        companyEmail: row.company_email, kind: row.kind, companyMailId: row.company_mail_id, inboundMessageId: row.inbound_message_id,
        createdAt: iso(row.created_at) ?? "", joinedNotedAt: iso(row.joined_noted_at),
      })),
      introRequests: introRows.filter((row) => row.person_id === person.id).map((row): ThreadIntroRequest => ({
        id: row.id, companyMailId: row.company_mail_id, status: row.status, createdAt: iso(row.created_at) ?? "",
        invitedAt: iso(row.invited_at), acceptedAt: iso(row.accepted_at), connectedAt: iso(row.connected_at), errorCode: row.error_code,
        reason: row.reason, providerMessageId: row.provider_message_id, appeal: row.company_appeal, companyName: row.company_name,
        roleName: row.role_name,
      })),
      harperMessages: harperRows.filter((row) => talents.has(row.talent_id)).map((row): ThreadHarperMessage => ({
        id: row.id, rootId: row.root_id, direction: row.direction, body: row.body, createdAt: iso(row.created_at) ?? "",
        cancelledAt: iso(row.cancelled_at), companyName: row.company_name, roleName: row.role_name,
      })),
      stages: stageRows.filter((row) => proposed(row)).map((row): ThreadStage => ({
        key: row.key, stage: row.stage, at: iso(row.created_at) ?? "", companyName: row.company_name, roleName: row.role_name,
      })),
      connections: connectionRows.filter((row) => proposed(row)).map((row): ThreadConnection => ({
        key: row.key, at: iso(row.at) ?? "", companyName: row.company_name, roleName: row.role_name,
      })),
    };
    const postingStages: Record<string, string> = {};
    for (const row of recommendationRows) if (row.role_id && proposed({ ...row, recommendation_id: row.id })) postingStages[row.role_id] = row.saved_stage;
    out.set(person.id, { facts, postingStages });
  }
  return out;
}

/** The right pane: the person, every mail as it went out (HTML too), their proposed postings' Harper stage, the thread. */
export type AgentThreadView = {
  person: AgentPerson & { reached: AgentReached | null };
  mails: ThreadMail[];
  /** The current recommendation stage on Harper of each proposed posting (by Role id), when it is 관심·지원. */
  postingStages: Record<string, string>;
  thread: PersonThread;
};

export async function readAgentThread(id: string): Promise<AgentThreadView | null> {
  if (!UUID.test(id)) return null;
  const person = await readAgentPerson(id);
  if (!person) return null;
  try {
    const { read, reached } = await gtmRead(async (sql) => ({
      read: (await readThreadFacts(sql, [person], true)).get(person.id)!,
      reached: person.sentAt ? (await agentReachedByPerson(sql, [person.id])).get(person.id) ?? null : null,
    }));
    return { person: { ...person, reached }, mails: [...read.facts.mails], postingStages: read.postingStages, thread: buildPersonThread(read.facts) };
  } catch (error) {
    if (!isMissing(error)) throw error;
    return { person: { ...person, reached: null }, mails: [], postingStages: {}, thread: { rows: [], summary: null } };
  }
}

/**
 * The list line (지금 · 마지막) of each person with a mail or a message: the latest row of their table, by person id.
 * People without one are left out (the line shows where the agent is with them instead).
 */
export async function threadSummaries(personIds: readonly string[]): Promise<Record<string, ThreadSummary>> {
  const ids = [...new Set(personIds.filter((id) => UUID.test(id)))].slice(0, SUMMARY_PEOPLE_MAX);
  if (!ids.length) return {};
  try {
    const facts = await gtmRead(async (sql) => {
      const rows = await sql`select p.* from public.gtm_agent_people p where p.id = any(${ids}::uuid[])`;
      return readThreadFacts(sql, rows.map((row) => mapAgentPerson(row as never)), false);
    });
    const now = new Date();
    const out: Record<string, ThreadSummary> = {};
    for (const [id, read] of facts) {
      const summary = buildPersonThread(read.facts, now).summary;
      if (summary) out[id] = summary;
    }
    return out;
  } catch (error) {
    if (isMissing(error)) return {};
    throw error;
  }
}

/** agent.people with each line's 지금 · 마지막 (`lines[i].thread`, null when the person has no mail or message yet). */
export async function withThreadSummaries<L extends { person: { id: string } }, T extends { lines: L[] }>(
  result: T,
): Promise<Omit<T, "lines"> & { lines: Array<L & { thread: ThreadSummary | null }> }> {
  const summaries = await threadSummaries(result.lines.map((line) => line.person.id));
  return { ...result, lines: result.lines.map((line) => ({ ...line, thread: summaries[line.person.id] ?? null })) };
}
