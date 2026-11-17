import "server-only";

import { buildBroadPool, jdQueryText } from "@/lib/org/roleStart/fastPath";
import { isSameOrg } from "./cardPrivacy";
import { gtmRead } from "./db.server";
import type { GtmJd } from "./jd.server";
import { POOL_LIST_SIZE } from "./shared";

const NO_ROLE = "00000000-0000-0000-0000-000000000000";

export type MemberFacts = {
  talentId: string;
  /** Harper staff only; never leaves the ops screen. */
  name: string | null;
  headline: string | null;
  location: string | null;
  years: number | null;
  similarity: number;
  experiences: Array<{ role: string | null; company: string | null; start: string | null; end: string | null; description: string | null }>;
  educations: Array<{ school: string | null; degree: string | null; field: string | null }>;
};

/** Job boards and ATS hosts: a posting URL there says nothing about which company it is. */
const JOB_BOARD_HOST = /(^|\.)(linkedin\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|wanted\.co\.kr|saramin\.co\.kr|jobkorea\.co\.kr|rocketpunch\.com|jumpit\.co\.kr|remember\.co\.kr|notion\.site|notion\.so|indeed\.com|glassdoor\.com|myworkdayjobs\.com|smartrecruiters\.com|recruitee\.com|breezy\.hr|bamboohr\.com|teamtailor\.com|ninehire\.com|greetinghr\.com|matchharper\.com|google\.com|forms\.gle)$/i;

function postingDomain(url: string | null) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host && !JOB_BOARD_HOST.test(host) ? host : null;
  } catch {
    return null;
  }
}

/**
 * Every name the posting's company goes by, for the members' blocked-company check (production compares the
 * workspace's company_name and published_name): the Harper workspace a customer Role belongs to, or workspaces
 * with the same name or the posting site's domain as their homepage. Read only.
 */
async function postingCompanyNames(jd: GtmJd) {
  const name = jd.companyName.trim();
  const domain = postingDomain(jd.url);
  const rows = await gtmRead((sql) => sql<Array<{ company_name: string | null; published_name: string | null }>>`
    select w.company_name, w.published_name
    from public.company_workspace w
    where ${jd.sourceWorkspaceId ? sql`w.company_workspace_id = ${jd.sourceWorkspaceId}::uuid` : sql`
      (${name} <> '' and (lower(btrim(w.company_name)) = lower(${name})
        or lower(btrim(coalesce(w.published_name, ''))) = lower(${name})))
      or (${domain}::text is not null and w.homepage_url is not null
        and lower(regexp_replace(regexp_replace(w.homepage_url, '^https?://(www\\.)?', '', 'i'), '[/:?#].*$', '')) = ${domain})`}
    limit 20
  `);
  return [...new Set([name, ...rows.flatMap((row) => [row.company_name, row.published_name])]
    .map((value) => String(value ?? "").trim()).filter(Boolean))];
}

/**
 * Members closest to one JD, read only. The same pool the Role start fast path builds (profile and
 * section embeddings), on the replay gate: onboarded, open to matches, internal recommendations on, and
 * not blocking the posting's company under any of its names. People who work there now (an open experience
 * at that company) are left out too. No Role, run or proposal is written.
 */
export async function findInternalMatches(args: { jd: GtmJd; take?: number }) {
  const take = Math.min(Math.max(args.take ?? POOL_LIST_SIZE, 3), POOL_LIST_SIZE);
  const companyNames = await postingCompanyNames(args.jd);
  const talentIds = await gtmRead(async (sql) => (await sql<Array<{ talent_id: string }>>`
    select t.user_id::text as talent_id
    from public.talent_users t join public.talent_setting s on s.user_id = t.user_id
    where t.deleted_at is null and s.is_onboarding_done is true and s.get_internal_recommendation is not false
      and s.profile_visibility = 'open_to_matches'
  `).map((row) => row.talent_id));
  const pool = await buildBroadPool({
    roleId: NO_ROLE,
    queryText: jdQueryText({ roleName: `${args.jd.companyName} ${args.jd.title}`.trim(), description: args.jd.description }),
    excludeIds: [],
    replay: { talentIds, companyNames },
  });
  // A few more than shown, so leaving out the company's own employees still fills the list.
  const considered = pool.members.slice(0, take * 3);
  const current = companyNames.length && considered.length
    ? await gtmRead((sql) => sql<Array<{ talent_id: string; company_name: string | null }>>`
      select talent_id::text, company_name from public.talent_experiences
      where talent_id = any(${considered.map((member) => member.talentId)}::uuid[]) and end_date is null
    `)
    : [];
  const employees = new Set(current
    .filter((row) => companyNames.some((name) => isSameOrg(name, row.company_name)))
    .map((row) => row.talent_id));
  const top = considered.filter((member) => !employees.has(member.talentId)).slice(0, take);
  const ids = top.map((member) => member.talentId);
  const facts = await gtmRead(async (sql) => {
    const [people, experiences, educations] = await Promise.all([
      sql<Array<{ user_id: string; name: string | null; headline: string | null; location: string | null }>>`
        select user_id::text, name, headline, coalesce(current_location, location) as location
        from public.talent_users where user_id = any(${ids}::uuid[])
      `,
      sql<Array<{ talent_id: string; role: string | null; company_name: string | null; start_date: string | null; end_date: string | null; description: string | null }>>`
        select talent_id::text, role, company_name, start_date::text, end_date::text, left(description, 500) as description
        from public.talent_experiences where talent_id = any(${ids}::uuid[])
        order by talent_id, end_date desc nulls first, start_date desc nulls last
      `,
      sql<Array<{ talent_id: string; school: string | null; degree: string | null; field: string | null }>>`
        select talent_id::text, school, degree, field from public.talent_educations
        where talent_id = any(${ids}::uuid[]) order by talent_id, end_date desc nulls first
      `,
    ]);
    return { people, experiences, educations };
  });
  const person = new Map(facts.people.map((row) => [row.user_id, row]));
  const members: MemberFacts[] = top.map((member) => ({
    talentId: member.talentId,
    name: person.get(member.talentId)?.name ?? null,
    headline: person.get(member.talentId)?.headline ?? null,
    location: person.get(member.talentId)?.location ?? null,
    years: member.years === null ? null : Math.round(member.years * 10) / 10,
    similarity: Math.round(member.retrieval * 100) / 100,
    experiences: facts.experiences.filter((row) => row.talent_id === member.talentId).slice(0, 6)
      .map((row) => ({ role: row.role, company: row.company_name, start: row.start_date, end: row.end_date, description: row.description })),
    educations: facts.educations.filter((row) => row.talent_id === member.talentId).slice(0, 3)
      .map((row) => ({ school: row.school, degree: row.degree, field: row.field })),
  }));
  return { eligibleCount: pool.eligibleCount, members, companyNames, excludedEmployees: employees.size };
}
