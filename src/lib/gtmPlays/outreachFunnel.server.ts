import "server-only";

import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import { GTM_ROLE_PURPOSE, GTM_WORKSPACE_ID, HARPER_WORKSPACE_ID } from "./constants";
import { gtmRead } from "./db.server";
import {
  attributeOptOuts,
  groupOutreachMails,
  outreachBounce,
  outreachBySource,
  tallyOutreachMails,
  type OutreachFunnelMail,
  type OutreachFunnelNumbers,
  type OutreachFunnelRole,
  type OutreachSource,
} from "./outreachFunnel";
import { GTM_SENDER_DOMAIN } from "./shared";

type MailRow = {
  id: string;
  role_id: string | null;
  role_name: string | null;
  posting_title: string | null;
  posting_company: string | null;
  posting_url: string | null;
  company_name: string | null;
  source: OutreachSource | null;
  to_email: string;
  created_at: string | Date;
  delivery_status: string | null;
  first_opened_at: string | Date | null;
  unsubscribed_at: string | Date | null;
  claimed_at: string | Date | null;
  saved_stage: string | null;
  connected: boolean;
};

const MAIL_LIMIT = 5_000;
const iso = (value: string | Date | null) => (value ? new Date(value).toISOString() : null);

/**
 * #4 candidate mails that went out in the last `days` (newest first), each with what came of it. Test mails to
 * matchharper.com are left out. withOpens false: before 20261117090000_gtm_mails_opens (no click or opt-out
 * columns yet, read as none).
 */
function readMailRows(days: number, withOpens: boolean) {
  return gtmRead((sql) => sql<MailRow[]>`
    select m.id::text as id, m.role_id::text as role_id, r.name as role_name, m.posting->>'title' as posting_title,
      m.posting->>'companyName' as posting_company, coalesce(m.posting_url, m.posting->>'url') as posting_url, m.company_name, m.candidate_source as source, m.to_email, m.created_at, m.delivery_status,
      ${withOpens
        ? sql`m.first_opened_at, m.unsubscribed_at,`
        : sql`null::timestamptz as first_opened_at, null::timestamptz as unsubscribed_at,`}
      m.claimed_at, rec.saved_stage,
      exists (
        select 1 from public.company_intro_candidates c
        where m.claimed_talent_id is not null and c.talent_id = m.claimed_talent_id
          and (c.role_id = m.role_id or c.role_id = rec.role_id)
          and (c.status = 'connected' or c.connected_at is not null)
      ) as connected
    from public.gtm_mails m
    left join public.company_roles r on r.role_id = m.role_id
    left join public.talent_opportunity_recommendation rec on rec.id = m.claimed_recommendation_id
    where m.campaign = 'outreach' and m.audience = 'candidate' and m.status = 'sent'
      and m.created_at >= now() - make_interval(days => ${days}::int)
      and m.to_email not like ${`%@${GTM_SENDER_DOMAIN}`}
    order by m.created_at desc
    limit ${MAIL_LIMIT}::int
  `);
}

/** Addresses on Harper's outreach list as opted out (unsubscribed), with when they went on it. */
async function readOptOuts(emails: string[]): Promise<Map<string, string>> {
  if (!emails.length) return new Map();
  const byHash = new Map(emails.map((email) => [externalEmailHash(email), email]));
  const rows = await gtmRead((sql) => sql<Array<{ email_hash: string; created_at: string | Date }>>`
    select email_hash, created_at from public.external_contact_suppressions
    where reason = 'unsubscribed' and email_hash = any(${[...byHash.keys()]}::text[])
  `);
  return new Map(rows.flatMap((row) => {
    const email = byHash.get(row.email_hash);
    return email ? [[email, new Date(row.created_at).toISOString()] as const] : [];
  }));
}

async function readOutreachMails(days: number): Promise<{ mails: OutreachFunnelMail[]; available: boolean; clicksTracked: boolean }> {
  let rows: MailRow[];
  let clicksTracked = true;
  try {
    rows = await readMailRows(days, true);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "42P01") return { mails: [], available: false, clicksTracked: false };
    if (code !== "42703") throw error;
    rows = await readMailRows(days, false);
    clicksTracked = false;
  }
  const mails = rows.map((row): OutreachFunnelMail => {
    const postingName = [row.company_name, row.posting_title].filter(Boolean).join(" · ");
    return {
      id: row.id,
      roleKey: row.role_id ?? `posting:${row.posting_title ?? row.company_name ?? ""}`,
      roleId: row.role_id,
      roleName: row.role_name ?? (postingName || "Role 없음"),
      companyName: row.company_name ?? row.posting_company,
      postingUrl: row.posting_url,
      source: row.source,
      toEmail: row.to_email,
      sentAt: iso(row.created_at) ?? "",
      bounce: outreachBounce(row.delivery_status),
      unsubscribed: Boolean(row.unsubscribed_at),
      clickedAt: iso(row.first_opened_at),
      signedUpAt: iso(row.claimed_at),
      stage: row.saved_stage,
      connected: Boolean(row.connected),
    };
  });
  // Opt-outs the mail did not record itself (before unsubscribed_at, or through another Harper mail).
  const optOuts = await readOptOuts([...new Set(mails.filter((mail) => !mail.unsubscribed).map((mail) => mail.toEmail))]);
  const optedOut = attributeOptOuts(mails, optOuts);
  return {
    mails: mails.map((mail) => (optedOut.has(mail.id) ? { ...mail, unsubscribed: true } : mail)),
    available: true,
    clicksTracked,
  };
}

const clampDays = (days: number) => Math.min(Math.max(Math.trunc(days) || 30, 1), 365);

/** What tells one Role row from another and leads back to it. */
export type OutreachRoleInfo = {
  companyName: string | null;
  title: string;
  /** Where the Role's JD came from; null for a posting that was never saved as a Role. */
  source: "customer_role" | "url" | "text" | null;
  postingUrl: string | null;
  /** When the Role was made (null: never saved as a Role). */
  createdAt: string | null;
  /** A GTM Role #4 can open below (저장한 Role 이어서). */
  openable: boolean;
  /** The search request (검색 기준) the Role was searched with. */
  request: string | null;
};

export type OutreachFunnelRoleRow = OutreachFunnelRole & { info: OutreachRoleInfo };

type RoleFactsRow = {
  role_id: string; name: string; created_at: string | Date; workspace_id: string; external_jd_url: string | null;
  gtm_company: string | null; gtm_source: string | null; gtm_url: string | null; is_gtm: boolean;
  workspace_name: string | null; request: string | null;
};

async function readRoleInfo(roles: OutreachFunnelRole[], mails: OutreachFunnelMail[]): Promise<Map<string, OutreachRoleInfo>> {
  const ids = roles.flatMap((role) => (role.roleId ? [role.roleId] : []));
  const facts = ids.length ? await gtmRead((sql) => sql<RoleFactsRow[]>`
    select r.role_id::text as role_id, r.name, r.created_at, r.company_workspace_id::text as workspace_id, r.external_jd_url,
      r.information->'gtm'->>'companyName' as gtm_company, r.information->'gtm'->>'source' as gtm_source,
      r.information->'gtm'->>'url' as gtm_url, coalesce(r.information->>'purpose' = ${GTM_ROLE_PURPOSE}, false) as is_gtm,
      w.company_name as workspace_name, ir.request
    from public.company_roles r
    left join public.company_workspace w on w.company_workspace_id = r.company_workspace_id
    left join public.company_internal_roles ir on ir.role_id = r.role_id
    where r.role_id = any(${ids}::uuid[])
  `) : [];
  const byId = new Map(facts.map((row) => [row.role_id, row]));
  const ownWorkspaces = new Set([GTM_WORKSPACE_ID, HARPER_WORKSPACE_ID]);
  return new Map(roles.map((role): [string, OutreachRoleInfo] => {
    const mail = mails.find((item) => item.roleKey === role.key);
    const row = role.roleId ? byId.get(role.roleId) : undefined;
    if (!row) {
      return [role.key, {
        companyName: mail?.companyName ?? null, title: role.name.split(" · ").slice(-1)[0] ?? role.name, source: null,
        postingUrl: mail?.postingUrl ?? null, createdAt: null, openable: false, request: null,
      }];
    }
    const customer = !ownWorkspaces.has(row.workspace_id);
    const source = row.gtm_source === "customer_role" || row.gtm_source === "url" || row.gtm_source === "text"
      ? row.gtm_source : customer ? "customer_role" : null;
    return [role.key, {
      companyName: row.gtm_company?.trim() || (customer ? row.workspace_name : null) || mail?.companyName || null,
      title: row.name,
      source,
      postingUrl: row.gtm_url || row.external_jd_url || mail?.postingUrl || null,
      createdAt: new Date(row.created_at).toISOString(),
      openable: row.workspace_id === GTM_WORKSPACE_ID && row.is_gtm,
      request: row.request?.trim() || null,
    }];
  }));
}

export type OutreachFunnel = {
  roles: OutreachFunnelRoleRow[];
  total: OutreachFunnelNumbers;
  totalBySource: OutreachFunnelRole["bySource"];
  /** false: gtm_mails is not there yet (local, before its migration). */
  available: boolean;
  /** false: the click columns are not there yet (20261117090000_gtm_mails_opens): 클릭 reads 0. */
  clicksTracked: boolean;
};

/** #4 숫자 표: per Role (and in total), what the candidate mails of the period led to, also split by source. */
export async function listOutreachFunnel(args: { days: number }): Promise<OutreachFunnel> {
  const { mails, available, clicksTracked } = await readOutreachMails(clampDays(args.days));
  const roles = groupOutreachMails(mails);
  const info = await readRoleInfo(roles, mails);
  return {
    roles: roles.map((role) => ({ ...role, info: info.get(role.key) as OutreachRoleInfo })),
    total: tallyOutreachMails(mails),
    totalBySource: outreachBySource(mails),
    available,
    clicksTracked,
  };
}

/** One Role's mails of the period (newest first), for the list under its row. */
export async function listOutreachFunnelMails(args: { days: number; roleKey: string }) {
  const { mails } = await readOutreachMails(clampDays(args.days));
  return { mails: mails.filter((mail) => mail.roleKey === args.roleKey) };
}
