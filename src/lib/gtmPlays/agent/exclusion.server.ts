import "server-only";

import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import { gtmRead, type GtmReadSql } from "../db.server";
import { cleanEmail, personKeys } from "./people";
import { normalizeDomainList, onBlockedDomain } from "./signals";
import type { AgentPerson } from "./types";

// ---------------------------------------------------------------------------------------------------------------
// Blocked companies (Shaun 11/24): Ops' blocked domains (settings.signals.blockedDomains: recruiting platforms, search
// firms, HR companies) are never mailed, as an address, as a candidate's current employer or as a company.

/** A company_db row's web host ("https://www.jobboard.example/x" → jobboard.example), in SQL. */
const websiteHost = (sql: GtmReadSql) =>
  sql`regexp_replace(substring(lower(cd.website_url) from '^(?:[a-z][a-z0-9+.-]*://)?([^/:?#]+)'), '^www\\.', '')`;

/** The row's website is a site's front page (no path), in SQL. */
const websiteIsFrontPage = (sql: GtmReadSql) =>
  sql`coalesce(substring(lower(cd.website_url) from '^(?:[a-z][a-z0-9+.-]*://)?[^/:?#]+(?::[0-9]+)?(/[^?#]*)?'), '') in ('', '/')`;

/**
 * The row's website is a blocked company's own: the front page of exactly one of `blocked`, in SQL. A page under a
 * blocked domain is often another company's page there (11/24, company_db: 31 rows such as jobboard.example/company/123
 * and 48 rows such as acme.career.ats.example are other companies' hiring pages), so neither a path nor a subdomain counts.
 */
const siteBlocked = (sql: GtmReadSql, blocked: readonly string[]) =>
  sql`(${websiteHost(sql)} = any(${blocked as string[]}::text[]) and ${websiteIsFrontPage(sql)})`;

/**
 * A company name that is surely one of the blocked companies: a company_db row with exactly this name (case and spaces
 * aside) has a blocked company's website (siteBlocked), and no row with that name has another website (11/24: loose
 * matching caught two unrelated companies whose names merely contained a blocked one's; a name shared with another
 * company is left alone).
 */
function blockedNameSql(sql: GtmReadSql, names: readonly string[], blocked: readonly string[]) {
  return sql`(exists (select 1 from public.company_db cd where lower(btrim(cd.name)) = any(${names as string[]}::text[])
      and cd.website_url is not null and ${siteBlocked(sql, blocked)})
    and not exists (select 1 from public.company_db cd where lower(btrim(cd.name)) = any(${names as string[]}::text[])
      and cd.website_url is not null and ${websiteHost(sql)} is not null and not ${siteBlocked(sql, blocked)}))`;
}

const cleanNames = (names: ReadonlyArray<string | null | undefined>) =>
  [...new Set(names.map((name) => String(name ?? "").trim().toLowerCase()).filter(Boolean))];

/**
 * Whether a company is a blocked one, for the company mails: the address on a blocked domain, or one of its names surely
 * a blocked company (blockedNameSql). Not by the posting's or the company's web domain: that is often a hiring page on
 * a blocked job board or ATS (a company's careers page there is not that board's company).
 */
export async function isBlockedCompany(
  input: { names?: ReadonlyArray<string | null | undefined>; email?: string | null },
  blockedDomains: readonly string[],
): Promise<boolean> {
  const blocked = normalizeDomainList(blockedDomains);
  if (!blocked.length) return false;
  if (onBlockedDomain(input.email, blocked)) return true;
  const names = cleanNames(input.names ?? []);
  if (!names.length) return false;
  const [row] = await gtmRead((sql) => sql<Array<{ blocked: boolean }>>`select ${blockedNameSql(sql, names, blocked)} as blocked`);
  return Boolean(row?.blocked);
}

/**
 * A LinkedIn profile's handle in the forms a stored link may have it (as written, decoded, encoded), lower case:
 * linkedin.com/in/jane-doe → jane-doe. Empty when the URL is not a LinkedIn profile.
 */
export function linkedinHandles(urls: ReadonlyArray<string | null | undefined>): string[] {
  const handles = new Set<string>();
  for (const url of urls) {
    const match = /(?:^|[/.])linkedin\.com\/in\/([^/?#\s]+)/i.exec(String(url ?? "").trim());
    if (!match) continue;
    const raw = match[1].toLowerCase();
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw).toLowerCase();
    } catch {
      // keep as written
    }
    for (const handle of [raw, decoded, encodeURIComponent(decoded).toLowerCase()]) if (handle.length >= 3) handles.add(handle);
  }
  return [...handles];
}

/**
 * Everything the exclusion rules need about one person, read in one go (item 11 of the 11/17 review):
 * - member: a Harper account with this email, or with this LinkedIn profile among its links (talent_users.resume_links,
 *   where the member's LinkedIn URL is kept), so a member known to #5 by another address is still a member;
 * - last_mailed: the latest #4 / #5 mail to the address, or Harper's company intro mail to it
 *   (external_intro_requests.recipient_email; the run applies the same 30 days, RECENT_CONTACT_DAYS);
 * - last_ended / active_elsewhere / opted_out: by every key the person may be known by (email and profile) and by the
 *   address on any other #5 row.
 */
export async function exclusionFacts(person: AgentPerson, blockedDomains: readonly string[] = []) {
  const email = cleanEmail(person.email);
  const blocked = normalizeDomainList(blockedDomains);
  // The purchased DB's person: their current jobs' companies by id (exact); anyone else: their profile's company name.
  const candidId = /^candid:([0-9a-f-]{36})$/i.exec(person.sourceRef ?? "")?.[1] ?? null;
  const companyNames = cleanNames([person.currentCompany]);
  const keys = [...new Set([person.personKey, ...personKeys({ email, profileUrl: person.profileUrl })])];
  const handles = linkedinHandles([person.profileUrl, person.contactUrl, person.personKey.replace(/^url:/, "")]);
  const likePatterns = handles.map((handle) => `%linkedin.com/in/${handle.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
  const [facts] = await gtmRead((sql) => {
    // Another #5 row for the same person: by any of their keys, or by the address it found later.
    const samePerson = email
      ? sql`(p.person_key = any(${keys}::text[]) or lower(p.email) = ${email})`
      : sql`p.person_key = any(${keys}::text[])`;
    return sql<Array<{
      member: boolean; suppressed: boolean; last_mailed: string | Date | null; last_ended: string | Date | null; active_elsewhere: boolean;
      opted_out: boolean; blocked_company: boolean;
    }>>`
    select
      (${email ? sql`exists (select 1 from public.talent_users t where lower(t.email) = ${email} and t.deleted_at is null)` : sql`false`}
        or ${handles.length ? sql`exists (select 1 from public.talent_users t
          where t.deleted_at is null and array_to_string(t.resume_links, ' ') ilike any(${likePatterns}::text[])
            and exists (select 1 from unnest(t.resume_links) link
              where substring(lower(link) from 'linkedin\\.com/in/([^/?#[:space:]]+)') = any(${handles}::text[])))` : sql`false`}
      ) as member,
      ${email ? sql`exists (select 1 from public.external_contact_suppressions s where s.email_hash = ${externalEmailHash(email)})` : sql`false`} as suppressed,
      ${email ? sql`greatest(
        (select max(m.created_at) from public.gtm_mails m where m.audience = 'candidate' and m.to_email = ${email}
          and m.status in ('sending', 'sent') and (m.agent_person_id is null or m.agent_person_id <> ${person.id}::uuid)),
        (select max(e.invited_at) from public.external_intro_requests e where lower(btrim(e.recipient_email)) = ${email})
      )` : sql`null::timestamptz`} as last_mailed,
      (select max(p.ended_at) from public.gtm_agent_people p where ${samePerson} and p.id <> ${person.id}::uuid) as last_ended,
      exists (select 1 from public.gtm_agent_people p where ${samePerson} and p.id <> ${person.id}::uuid
        and p.status in ('matched', 'drafted', 'approved', 'sent', 'replied')) as active_elsewhere,
      -- "연락 그만" on any earlier cycle (a person known only by profile has no address on the shared list).
      exists (select 1 from public.gtm_agent_people p where ${samePerson} and p.id <> ${person.id}::uuid
        and p.events @> '[{"kind": "unsubscribed"}]'::jsonb) as opted_out,
      ${!blocked.length ? sql`false` : sql`(
        ${candidId ? sql`exists (select 1 from public.experience_user e join public.company_db cd on cd.id = e.company_id
          where e.candid_id = ${candidId}::uuid and e.end_date is null and cd.website_url is not null and ${siteBlocked(sql, blocked)})` : sql`false`}
        or ${companyNames.length ? blockedNameSql(sql, companyNames, blocked) : sql`false`}
      )`} as blocked_company
  `;
  });
  return { ...facts, blocked_company: Boolean(facts?.blocked_company) || onBlockedDomain(email, blocked) };
}
