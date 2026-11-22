import "server-only";

import { ASHLEY_CANDIDATE_KEY } from "@/lib/org/agent/externalSourcing";
import { gtmRead, type GtmReadSql } from "../db.server";
import { REACTED_STAGES } from "../outreachFunnel";
import { tallyCompanyNumbers, type CompanyNumbers, type CompanyNumbersInput, type CompanyPostingRef } from "./companyNumbers";
import { kstClock } from "./people";
import { resolveAgentPeriod, type AgentPeriod, type AgentPeriodInput } from "./period";
import type { AgentPostingKind } from "./types";

/**
 * #5 수치 · 회사 against the tables (the counting is agent/companyNumbers.ts), read only. The people are 수치 · 후보's
 * (views.server.ts funnelPeriod: found on the period's KST days, test people only when asked; the screen never asks)
 * who were mailed, and everything else is read for them only (Shaun 11/22: every number here is part of the candidate
 * numbers):
 *   - their first mail's postings (gtm_agent_people.postings, as 관심·지원 and 회사 연결 read them), a customer Role's
 *     workspace (company_roles) naming the customer;
 *   - company mails about them (gtm_mails audience company: the agent_person_id and company_mail.newPersonIds), with
 *     the button page on screen (first_opened_at), the company's reply (an inbound mail hanging on it), the sign-up from
 *     it (claimed_at) and delivery / opt-out;
 *   - the company's words passed on (gtm_agent_relays of a company mail, its relay mail to the candidate sent);
 *   - connection requests on their nameless 외부 후보 cards (external_intro_requests → external_candidates person_key),
 *     connected when the candidate confirmed one;
 *   - per customer Role, their Harper account's (the account their mail claimed) recommendation stage, the company's
 *     request and the connection (company_intro_candidates) and agent_contact_messages (not cancelled).
 * A table missing before its migration counts as empty.
 */

const MISSING = new Set(["42P01", "42703"]);
const isMissing = (error: unknown) => MISSING.has(String((error as { code?: string })?.code ?? ""));
const UUID_RE = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
const PEOPLE_MAX = 20_000;
const POSTING_KINDS = new Set<string>(["external", "customer", "gtm"] satisfies AgentPostingKind[]);

export type AgentCompanyNumbers = CompanyNumbers & {
  period: AgentPeriod;
  /** false: the #5 tables are not there yet. */
  available: boolean;
};

/** A read whose table may not exist yet (before its migration): nothing then. */
async function optional<T>(run: (sql: GtmReadSql) => Promise<T[]>): Promise<T[]> {
  try {
    return await gtmRead(run);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

type PostingJson = { kind?: string | null; roleId?: string | null; url?: string | null; companyName?: string | null };

export async function agentCompanyNumbers(args: AgentPeriodInput & { includeTest: boolean }): Promise<AgentCompanyNumbers> {
  const period = resolveAgentPeriod(args, kstClock(new Date()).day);
  const empty = (available: boolean): AgentCompanyNumbers => ({
    ...tallyCompanyNumbers({ people: [], companyMails: [], relays: [], introRequests: [], harper: [] }), period, available,
  });
  let people: Array<{ person_id: string; postings: PostingJson[] | null }>;
  try {
    people = await gtmRead((sql) => sql<Array<{ person_id: string; postings: PostingJson[] | null }>>`
      -- 수치 · 후보's people (the same predicate as views.server.ts funnelPeriod) who were mailed: nothing else can lead
      -- to a company.
      select p.id::text as person_id,
        case when jsonb_typeof(p.postings) = 'array' then p.postings else '[]'::jsonb end as postings
      from public.gtm_agent_people p
      where (p.created_at at time zone 'Asia/Seoul')::date between ${period.from}::date and ${period.to}::date
        and (${args.includeTest} or not p.is_test) and p.sent_at is not null
      limit ${PEOPLE_MAX}
    `);
  } catch (error) {
    if (isMissing(error)) return empty(false);
    throw error;
  }
  if (!people.length) return empty(true);
  const ids = people.map((row) => row.person_id);
  const customerRoles = [...new Set(people.flatMap((row) => (row.postings ?? [])
    .filter((posting) => posting.kind === "customer" && new RegExp(UUID_RE, "i").test(String(posting.roleId ?? "")))
    .map((posting) => String(posting.roleId))))];

  const [workspaces, mails, relays, introRequests, harper] = await Promise.all([
    customerRoles.length ? optional((sql) => sql<Array<{ role_id: string; workspace_id: string | null; workspace_name: string | null }>>`
      select r.role_id::text as role_id, r.company_workspace_id::text as workspace_id, w.company_name as workspace_name
      from public.company_roles r left join public.company_workspace w on w.company_workspace_id = r.company_workspace_id
      where r.role_id = any(${customerRoles}::uuid[])
    `) : Promise.resolve([]),
    optional((sql) => sql<Array<{
      id: string; company_name: string | null; person_id: string | null; new_ids: unknown; clicked: boolean; replied: boolean;
      signed_up: boolean; delivery_status: string | null; unsubscribed: boolean;
    }>>`
      -- Company mails that went out (or may have: sending, as the one-mail-a-day rule counts them), about our people.
      select m.id::text as id, m.company_name, m.agent_person_id::text as person_id,
        case when jsonb_typeof(m.company_mail -> 'newPersonIds') = 'array' then m.company_mail -> 'newPersonIds' else '[]'::jsonb end as new_ids,
        m.first_opened_at is not null as clicked, m.claimed_at is not null as signed_up, m.delivery_status,
        m.unsubscribed_at is not null as unsubscribed,
        exists (select 1 from public.gtm_agent_messages r
          where r.root_mail_id = m.id and r.direction = 'inbound' and r.author = 'counterpart') as replied
      from public.gtm_mails m
      where m.campaign = 'agent' and m.audience = 'company' and m.status in ('sending', 'sent')
        and (m.agent_person_id = any(${ids}::uuid[])
          or (jsonb_typeof(m.company_mail -> 'newPersonIds') = 'array' and (m.company_mail -> 'newPersonIds') ?| ${ids}::text[]))
    `),
    optional((sql) => sql<Array<{ person_id: string; company_name: string | null }>>`
      -- A relay row is claimed before its mail goes: only one whose mail to the candidate was sent is "passed on". A row
      -- without the company's mail is a connection request told (counted under 회사가 연결 요청).
      select r.person_id::text as person_id, cm.company_name
      from public.gtm_agent_relays r join public.gtm_mails cm on cm.id = r.company_mail_id
      where r.person_id = any(${ids}::uuid[]) and r.inbound_message_id is not null
        and exists (select 1 from public.gtm_agent_messages o
          where o.answers_message_id = r.inbound_message_id and o.direction = 'outbound' and o.counterpart_kind = 'candidate'
            and o.send_status = 'sent')
    `),
    optional((sql) => sql<Array<{ person_key: string; company_name: string | null; connected: boolean }>>`
      -- The company's request on one of Ashley's 외부 후보 cards (person_key gtm:<person id>, made from the company mail
      -- in its screen); one the company withdrew by passing before it went (cancelled) is not counted. Connected: the
      -- candidate confirmed it (externalInvite.server.ts sets status connected).
      select c.person_key, cm.company_name, ir.status = 'connected' as connected
      from public.external_intro_requests ir
      join public.external_candidates c on c.id = ir.external_candidate_id
      join public.gtm_mails cm on cm.id::text = c.screen ->> 'gtmMailId' and cm.audience = 'company'
      where c.person_key = any(${ids.map((id) => `${ASHLEY_CANDIDATE_KEY}${id}`)}::text[]) and ir.status <> 'cancelled'
    `),
    customerRoles.length ? optional((sql) => sql<Array<{
      person_id: string; talent_id: string; role_id: string; interested: boolean; connected: boolean; told: boolean;
      answered: boolean; company_requested: boolean; to_company: number; to_talent: number;
    }>>`
      -- Per person and customer Role their mail carried: their Harper account (the one their mail claimed, as 관심·지원 and
      -- 회사 연결 read it) on that Role.
      with pairs as (
        select distinct p.id as person_id, coalesce(m.claimed_talent_id, mf.claimed_talent_id) as talent_id, (e ->> 'roleId')::uuid as role_id
        from public.gtm_agent_people p
        left join public.gtm_mails m on m.id = p.mail_id
        left join public.gtm_mails mf on mf.id = p.followup_mail_id
        cross join lateral jsonb_array_elements(case when jsonb_typeof(p.postings) = 'array' then p.postings else '[]'::jsonb end) e
        where p.id = any(${ids}::uuid[]) and e ->> 'kind' = 'customer' and e ->> 'roleId' ~* ${UUID_RE}
          and coalesce(m.claimed_talent_id, mf.claimed_talent_id) is not null
      )
      select x.person_id::text as person_id, x.talent_id::text as talent_id, x.role_id::text as role_id,
        exists (select 1 from public.talent_opportunity_recommendation rec
          where rec.talent_id = x.talent_id and rec.role_id = x.role_id and rec.saved_stage = any(${[...REACTED_STAGES]}::text[])) as interested,
        exists (select 1 from public.company_intro_candidates c
          where c.talent_id = x.talent_id and c.role_id = x.role_id and (c.status = 'connected' or c.connected_at is not null)) as connected,
        -- 회사가 연결 요청: the company asked to connect on Harper (whatever came of it).
        exists (select 1 from public.company_intro_candidates c
          where c.talent_id = x.talent_id and c.role_id = x.role_id and c.requested_at is not null) as company_requested,
        -- 회사에 알린 후보: a thread the candidate's side started to the company; 회사 답: the company wrote back in one.
        exists (select 1 from public.agent_contact_messages a
          where a.talent_id = x.talent_id and a.role_id = x.role_id and a.id = a.root_id and a.direction = 'to_company'
            and a.cancelled_at is null) as told,
        exists (select 1 from public.agent_contact_messages a
          join public.agent_contact_messages root on root.id = a.root_id and root.direction = 'to_company' and root.cancelled_at is null
          where a.talent_id = x.talent_id and a.role_id = x.role_id and a.direction = 'to_talent' and a.cancelled_at is null) as answered,
        (select count(*)::int from public.agent_contact_messages a
          where a.talent_id = x.talent_id and a.role_id = x.role_id and a.direction = 'to_company' and a.cancelled_at is null) as to_company,
        (select count(*)::int from public.agent_contact_messages a
          where a.talent_id = x.talent_id and a.role_id = x.role_id and a.direction = 'to_talent' and a.cancelled_at is null) as to_talent
      from pairs x
    `) : Promise.resolve([]),
  ]);

  const workspaceOf = new Map(workspaces.map((row) => [row.role_id, row]));
  const refs = (postings: readonly PostingJson[]): CompanyPostingRef[] => postings.flatMap((posting) => {
    if (!POSTING_KINDS.has(String(posting.kind))) return [];
    const workspace = posting.kind === "customer" && posting.roleId ? workspaceOf.get(String(posting.roleId)) : undefined;
    return [{
      kind: posting.kind as AgentPostingKind, roleId: posting.roleId ?? null, url: posting.url ?? null,
      companyName: String(posting.companyName ?? "").trim(),
      workspaceId: workspace?.workspace_id ?? null, workspaceName: workspace?.workspace_name ?? null,
    }];
  });
  const input: CompanyNumbersInput = {
    people: people.map((row) => ({ personId: row.person_id, postings: refs(row.postings ?? []) })),
    companyMails: mails.map((row) => ({
      id: row.id, companyName: row.company_name ?? "",
      personIds: [...(Array.isArray(row.new_ids) ? row.new_ids.map(String) : []), ...(row.person_id ? [row.person_id] : [])],
      clicked: Boolean(row.clicked), replied: Boolean(row.replied), signedUp: Boolean(row.signed_up),
      deliveryStatus: row.delivery_status ?? null, unsubscribed: Boolean(row.unsubscribed),
    })),
    relays: relays.map((row) => ({ personId: row.person_id, companyName: row.company_name ?? "" })),
    introRequests: introRequests.map((row) => ({
      personId: row.person_key.slice(ASHLEY_CANDIDATE_KEY.length), companyName: row.company_name ?? "", connected: Boolean(row.connected),
    })),
    harper: harper.map((row) => ({
      personId: row.person_id, talentId: row.talent_id, roleId: row.role_id, interested: Boolean(row.interested),
      told: Boolean(row.told), answered: Boolean(row.answered), companyRequested: Boolean(row.company_requested),
      connected: Boolean(row.connected),
      toCompany: Number(row.to_company ?? 0), toTalent: Number(row.to_talent ?? 0),
    })),
  };
  return { ...tallyCompanyNumbers(input), period, available: true };
}
