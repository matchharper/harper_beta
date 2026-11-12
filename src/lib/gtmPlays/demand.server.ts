import "server-only";

import { DEFAULT_ADMIN_EXCLUDED_EMAILS } from "@/lib/adminEmailExclusions";
import { readOrgDecisionCounts, readWorkspaceOwnerUser } from "@/lib/org/decisionCounts.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { GTM_WORKSPACE_ID, HARPER_WORKSPACE_ID } from "./constants";
import { gtmRead, type GtmReadSql } from "./db.server";
import {
  compareDemand,
  demandNumberSentence,
  hasDemand,
  sumDemandCounts,
  type DemandCounts,
} from "./demandLinks";
import { gtmStructuredCall } from "./llm.server";
import { extractEmails, type CompanyMailDraft } from "./shared";

// ---------------------------------------------------------------------------------------------------------
// #3 관심 쌓인 고객사: per Harper customer (company_workspace.is_internal, not Harper's own) and per Role in
// its Harper account, the numbers /org shows on that Role — 연결을 기다리는 후보 / 연결을 요청할 후보 / 저장 from
// readOrgDecisionCounts (the reader every /org surface uses, read as the workspace owner), and 외부 후보 with
// the /org 외부 후보 tab's filter. Nothing here writes.
// ---------------------------------------------------------------------------------------------------------

export type DemandRole = {
  roleId: string;
  name: string;
  status: string;
  /** Open in /org (active / top priority). Closed Roles are listed only when a number is above 0. */
  open: boolean;
  /** Made by Harper for the company (company_internal_roles.is_harper_tailored_role). */
  tailored: boolean;
  counts: DemandCounts;
};

/**
 * Harper members' activity on the postings Harper collected from the company's careers site (source_type
 * external, not Roles in the company's Harper account): distinct people who applied (a submitted Harper
 * application, or marked it applied) or only saved one, in the period.
 */
export type DemandSitePostings = { postings: number; applied: number; savedOnly: number };

export type DemandCompany = {
  workspaceId: string;
  companyName: string;
  homepageUrl: string | null;
  linkedinUrl: string | null;
  /** Sums over the listed Roles. */
  counts: DemandCounts;
  roles: DemandRole[];
  sitePostings: DemandSitePostings | null;
  /** Why the /org numbers could not be read (they show as 0 then). */
  readError: string | null;
};

const PERSONAL_DOMAINS = [
  "gmail.com", "googlemail.com", "naver.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "daum.net",
  "icloud.com", "me.com", "kakao.com", "hanmail.net", "nate.com", "proton.me", "protonmail.com",
];

/** Hosts many companies' homepage_url point at: never a company's own mail domain. */
const SHARED_HOSTS = [
  "linkedin.com", "notion.site", "notion.so", "github.io", "github.com", "google.com", "medium.com", "wixsite.com",
  "wix.com", "webflow.io", "framer.website", "framer.ai", "instagram.com", "facebook.com", "twitter.com", "x.com",
  "youtube.com", "naver.com", "tistory.com", "brunch.co.kr", "wanted.co.kr", "rocketpunch.com", "greenhouse.io",
  "lever.co", "ashbyhq.com", "workable.com", "bit.ly", "linktr.ee", "vercel.app", "netlify.app", "oopy.io",
  "imweb.me", "cafe24.com", "sites.google.com", "blogspot.com", "substack.com",
];

/** Harper staff and test accounts, as /ops/jobs leaves them out (DEFAULT_ADMIN_EXCLUDED_EMAILS). */
const EXCLUDED_EMAILS = [...DEFAULT_ADMIN_EXCLUDED_EMAILS];

function staffCte(sql: GtmReadSql) {
  return sql`
    staff as (
      select user_id from public.talent_users
      where email is not null and (lower(btrim(email)) = any(${EXCLUDED_EMAILS}::text[])
        or '@' || split_part(lower(btrim(email)), '@', 2) = any(${EXCLUDED_EMAILS}::text[]))
    )`;
}

/**
 * A browser run Harper ran with the candidate's approval to submit (execute mode binds a work_effect to it). Many
 * such runs stop before the last step (a required field, a verification code), so a run alone is an attempt.
 */
const EXECUTE_MODE = (sql: GtmReadSql) => sql`exists (select 1 from public.talent_external_operations effect
  where effect.kind = 'work_effect' and effect.result->>'operation_id' = o.id::text)`;

// Whether a run really submitted is not stored as a field: the browser reports in prose, and its first sentence
// states the outcome ("Submitted once." / "Stopped before submission."). These read that sentence.
const SUBMITTED_SENTENCE = String.raw`(^\s*(application )?submitted\M|submitted [^.]{0,160}\monce\M|successfully submitted|submitted successfully|was submitted|has been submitted|application submitted|application (has been|was) (received|accepted)|confirmed (the )?(successful )?submission|submission confirmation|application-submitted|thank you for (applying|your application)|successfully applied|제출(했|완료|되었|됐)|지원(이|을)? ?완료)`;
const NOT_SUBMITTED_SENTENCE = String.raw`(not (yet )?submitted|unsubmitted|without submitting|before (submission|submitting)|no application|nothing was submitted|did not submit|didn't submit|was not submitted|already (been )?submitted|no new application|rejected|no longer accepting|not accepting|could not submit|unable to submit|failed to submit|submission failed|no (prior )?(submission )?confirmation|제출하지|제출 전|제출 안|제출되지)`;

type CompanyRoleSqlRow = {
  workspace_id: string; company_name: string; homepage_url: string | null; linkedin_url: string | null;
  role_id: string | null; role_name: string | null; status: string | null; tailored: boolean | null; external: number | null;
};

/** Customers with their non-deleted /org Roles and each Role's 외부 후보 count (the /org tab's filter). */
async function readCustomerRoles(workspaceId: string | null) {
  return gtmRead((sql) => sql<CompanyRoleSqlRow[]>`
    select w.company_workspace_id::text as workspace_id, w.company_name, w.homepage_url, w.linkedin_url,
      r.role_id::text as role_id, r.name as role_name, r.status,
      coalesce(ir.is_harper_tailored_role, false) as tailored,
      coalesce(ext.n, 0)::int as external
    from public.company_workspace w
    left join public.company_roles r on r.company_workspace_id = w.company_workspace_id
      and r.source_type = 'internal' and r.status <> 'deleted'
    left join public.company_internal_roles ir on ir.role_id = r.role_id
    left join lateral (
      select count(*) as n
      from public.external_candidates e
      join public.external_sourcing_runs run on run.id = e.run_id
      where e.role_id = r.role_id and e.company_workspace_id = w.company_workspace_id and e.delivered is true
        and run.trigger <> 'shadow' and (e.company_decision is null or e.company_decision <> 'passed')
    ) ext on r.role_id is not null
    where w.is_internal is true and w.company_workspace_id <> all(array[${HARPER_WORKSPACE_ID}, ${GTM_WORKSPACE_ID}]::uuid[])
      ${workspaceId ? sql`and w.company_workspace_id = ${workspaceId}::uuid` : sql``}
  `);
}

/** Harper members on the company's careers-site postings in the period (staff and test accounts left out). */
async function readSitePostings(args: { days: number; workspaceIds: string[] }) {
  const result = new Map<string, DemandSitePostings>();
  if (!args.workspaceIds.length) return result;
  const rows = await gtmRead((sql) => sql<Array<{ workspace_id: string; postings: number; applied: number; saved_only: number }>>`
    with ${staffCte(sql)},
    touches as (
      select cr.company_workspace_id as cw, cr.role_id, o.user_id as talent_id, true as applied
      from public.talent_external_operations o
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(o.request->'role_refs') = 'array'
        then o.request->'role_refs' else '[]'::jsonb end) ref(role_id)
      join public.company_roles cr on ref.role_id ~* '^[0-9a-f-]{36}$' and cr.role_id = ref.role_id::uuid
      where o.kind = 'browser_run' and o.status = 'completed' and ${EXECUTE_MODE(sql)}
        and cr.source_type = 'external' and cr.company_workspace_id = any(${args.workspaceIds}::uuid[])
        and o.created_at >= now() - make_interval(days => ${args.days}::int)
        and o.user_id not in (select user_id from staff)
      union all
      select cr.company_workspace_id, cr.role_id, t.talent_id, t.saved_stage = 'applied'
      from public.talent_opportunity_recommendation t
      join public.company_roles cr on cr.role_id = t.role_id
      where t.saved_stage in ('applied', 'saved') and cr.source_type = 'external'
        and cr.company_workspace_id = any(${args.workspaceIds}::uuid[])
        and coalesce(t.updated_at, t.created_at) >= now() - make_interval(days => ${args.days}::int)
        and t.talent_id not in (select user_id from staff)
    ),
    people as (select cw, talent_id, bool_or(applied) as applied from touches group by cw, talent_id),
    postings as (select cw, count(distinct role_id)::int as postings from touches group by cw)
    select people.cw::text as workspace_id, postings.postings,
      count(*) filter (where people.applied)::int as applied,
      count(*) filter (where not people.applied)::int as saved_only
    from people join postings on postings.cw = people.cw
    group by people.cw, postings.postings
  `);
  for (const row of rows) {
    result.set(row.workspace_id, { postings: Number(row.postings), applied: Number(row.applied), savedOnly: Number(row.saved_only) });
  }
  return result;
}

async function mapWithConcurrency<T, R>(values: T[], limit: number, run: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let next = 0;
  const worker = async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await run(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

type DecisionRead = Awaited<ReturnType<typeof readOrgDecisionCounts>>;

/** The /org decision numbers of these Roles, read as the workspace owner (or its first admin), like Slack and email. */
async function readOrgNumbers(workspaceId: string, roleIds: string[]): Promise<{ read: DecisionRead | null; error: string | null }> {
  if (!roleIds.length) return { read: null, error: null };
  const admin = getSupabaseAdmin();
  try {
    const owner = await readWorkspaceOwnerUser(admin, workspaceId);
    if (!owner) return { read: null, error: "회사 계정에 owner·admin이 없어 /org 숫자를 읽지 못했어요." };
    return { read: await readOrgDecisionCounts({ admin, user: owner, workspaceId, roleIds }), error: null };
  } catch (error) {
    console.error("[gtm-plays] /org numbers failed", workspaceId, error);
    return { read: null, error: "/org 숫자를 읽지 못했어요." };
  }
}

function buildCompanies(rows: CompanyRoleSqlRow[]) {
  const companies = new Map<string, { info: CompanyRoleSqlRow; roles: CompanyRoleSqlRow[] }>();
  for (const row of rows) {
    const entry = companies.get(row.workspace_id) ?? { info: row, roles: [] };
    if (row.role_id) entry.roles.push(row);
    companies.set(row.workspace_id, entry);
  }
  return [...companies.values()];
}

function toRole(row: CompanyRoleSqlRow, read: DecisionRead | null): DemandRole {
  const counts = read?.get(String(row.role_id))?.counts;
  const status = String(row.status ?? "");
  return {
    roleId: String(row.role_id),
    name: row.role_name ?? "",
    status,
    open: status === "active" || status === "top_priority",
    tailored: Boolean(row.tailored),
    counts: {
      waiting: counts?.pending_connection ?? 0,
      toRequest: counts?.company_intro ?? 0,
      saved: counts?.saved ?? 0,
      external: Number(row.external ?? 0),
    },
  };
}

async function readCompanies(args: { days: number; workspaceId: string | null }) {
  const started = Date.now();
  const grouped = buildCompanies(await readCustomerRoles(args.workspaceId)).filter((entry) => entry.roles.length);
  const [reads, site] = await Promise.all([
    mapWithConcurrency(grouped, 4, (entry) => readOrgNumbers(entry.info.workspace_id, entry.roles.map((role) => String(role.role_id)))),
    readSitePostings({ days: args.days, workspaceIds: grouped.map((entry) => entry.info.workspace_id) }),
  ]);
  const companies: DemandCompany[] = grouped.map((entry, index) => {
    const { read, error } = reads[index];
    const roles = entry.roles.map((row) => toRole(row, read))
      .filter((role) => role.open || hasDemand(role.counts))
      .sort((left, right) => compareDemand(left, right));
    return {
      workspaceId: entry.info.workspace_id,
      companyName: entry.info.company_name,
      homepageUrl: entry.info.homepage_url,
      linkedinUrl: entry.info.linkedin_url,
      counts: sumDemandCounts(roles.map((role) => role.counts)),
      roles,
      sitePostings: site.get(entry.info.workspace_id) ?? null,
      readError: error,
    };
  }).filter((company) => company.roles.length)
    .sort((left, right) => compareDemand({ counts: left.counts, name: left.companyName }, { counts: right.counts, name: right.companyName }));
  return { companies, tookMs: Date.now() - started };
}

/** #3 list: every customer with a Role in /org, most people waiting first (no minimum). */
export async function listCustomerDemand(args: { days: number }) {
  const days = Math.min(Math.max(Math.trunc(args.days) || 90, 1), 365);
  const { companies, tookMs } = await readCompanies({ days, workspaceId: null });
  return { days, companies, tookMs };
}

export type DemandRecipients = {
  /** People in the company's Harper account (owners first): the usual recipient for a customer. */
  members: Array<{ email: string; name: string | null; authority: string | null }>;
  /** Addresses the company's /org Roles show (hiring post contact or JD text). */
  postingEmails: Array<{ email: string; roleName: string; url: string | null }>;
};

async function readRecipients(workspaceId: string, roleId: string | null): Promise<DemandRecipients> {
  return gtmRead(async (sql) => {
    const [members, roles] = await Promise.all([
      sql<Array<{ email: string; name: string | null; authority: string | null }>>`
        select distinct on (lower(u.email)) lower(u.email) as email, u.name, uw.authority
        from public.company_user_workspace uw
        join public.company_users u on u.user_id = uw.company_user_id
        where uw.company_workspace_id = ${workspaceId}::uuid and u.email like '%@%'
        order by lower(u.email), (uw.authority = 'owner') desc
      `,
      sql<Array<{ name: string; external_jd_url: string | null; contact_email: string | null; description: string | null }>>`
        select r.name, r.external_jd_url, r.information->'hiringPost'->>'contactEmail' as contact_email,
          left(r.description, 20000) as description
        from public.company_roles r
        where r.company_workspace_id = ${workspaceId}::uuid and r.source_type = 'internal' and r.status <> 'deleted'
          ${roleId ? sql`and r.role_id = ${roleId}::uuid` : sql``}
        order by (r.status in ('active', 'top_priority')) desc, r.updated_at desc nulls last
        limit 20
      `,
    ]);
    const seen = new Set<string>();
    const postingEmails: DemandRecipients["postingEmails"] = [];
    for (const role of roles) {
      for (const email of extractEmails(role.contact_email, role.description)) {
        if (seen.has(email)) continue;
        seen.add(email);
        postingEmails.push({ email, roleName: role.name, url: role.external_jd_url });
      }
    }
    return {
      members: [...members].sort((a, b) => Number(b.authority === "owner") - Number(a.authority === "owner")),
      postingEmails,
    };
  });
}

/** #3 company panel: its Roles with the /org numbers, and who can get the mail. */
export async function loadDemandCompany(args: { workspaceId: string; days: number }) {
  const days = Math.min(Math.max(Math.trunc(args.days) || 90, 1), 365);
  const [{ companies }, recipients] = await Promise.all([
    readCompanies({ days, workspaceId: args.workspaceId }),
    readRecipients(args.workspaceId, null),
  ]);
  const company = companies[0];
  if (!company) throw new Error("이 회사에는 /org Role이 없어요.");
  return { company, ...recipients };
}

export type DemandPerson = { talentId: string; name: string | null; headline: string | null; at: string | null };

export type DemandExternalPerson = {
  id: string; name: string | null; headline: string | null; currentCompany: string | null;
  decision: string | null; introStatus: string | null; createdAt: string;
};

export type DemandRoleDetail = {
  company: Pick<DemandCompany, "workspaceId" | "companyName" | "homepageUrl" | "linkedinUrl">;
  role: DemandRole;
  /** The people behind 연결을 기다리는 후보 (since: when they started waiting) and 연결을 요청할 후보 (at: put forward). */
  waiting: DemandPerson[];
  toRequest: DemandPerson[];
  /** The /org 외부 후보 tab: delivered, not passed, newest first (60 at most, like the tab). */
  external: DemandExternalPerson[];
  readError: string | null;
} & DemandRecipients;

/** #3 Role panel: the numbers and the people behind them, exactly as /org reads them. */
export async function loadDemandRole(args: { workspaceId: string; roleId: string }): Promise<DemandRoleDetail> {
  const rows = (await readCustomerRoles(args.workspaceId)).filter((row) => row.role_id === args.roleId);
  const row = rows[0];
  if (!row) throw new Error("이 고객사의 /org Role이 아니에요.");
  const [{ read, error }, recipients, external] = await Promise.all([
    readOrgNumbers(args.workspaceId, [args.roleId]),
    readRecipients(args.workspaceId, args.roleId),
    gtmRead((sql) => sql<Array<{
      id: string; name: string | null; headline: string | null; current_company: string | null;
      company_decision: string | null; intro_status: string | null; created_at: string | Date;
    }>>`
      select e.id::text as id, e.name, e.headline, e.current_company, e.company_decision,
        (select i.status from public.external_intro_requests i where i.external_candidate_id = e.id
          order by i.created_at desc limit 1) as intro_status,
        e.created_at
      from public.external_candidates e
      join public.external_sourcing_runs run on run.id = e.run_id
      where e.role_id = ${args.roleId}::uuid and e.company_workspace_id = ${args.workspaceId}::uuid and e.delivered is true
        and run.trigger <> 'shadow' and (e.company_decision is null or e.company_decision <> 'passed')
      order by e.created_at desc, e.rank asc
      limit 60
    `),
  ]);
  const decision = read?.get(args.roleId);
  const ids = [...new Set([...(decision?.waiting ?? []), ...(decision?.toRequest ?? [])].map((item) => item.talentId))];
  const people = ids.length
    ? await gtmRead((sql) => sql<Array<{ user_id: string; name: string | null; headline: string | null }>>`
        select user_id::text as user_id, name, headline from public.talent_users where user_id = any(${ids}::uuid[])
      `)
    : [];
  const byId = new Map(people.map((person) => [person.user_id, person]));
  const person = (talentId: string, at: string | null): DemandPerson => ({
    talentId, name: byId.get(talentId)?.name ?? null, headline: byId.get(talentId)?.headline ?? null, at,
  });
  return {
    company: { workspaceId: row.workspace_id, companyName: row.company_name, homepageUrl: row.homepage_url, linkedinUrl: row.linkedin_url },
    role: toRole(row, read),
    waiting: (decision?.waiting ?? []).map((item) => person(item.talentId, item.since)),
    toRequest: (decision?.toRequest ?? []).map((item) => person(item.talentId, item.at)),
    external: external.map((item) => ({
      id: item.id, name: item.name, headline: item.headline, currentCompany: item.current_company,
      decision: item.company_decision, introStatus: item.intro_status, createdAt: new Date(item.created_at).toISOString(),
    })),
    readError: error,
    ...recipients,
  };
}

const DEFAULT_COPY = {
  ko: {
    subject: (company: string, role: string | null) => role ? `${role} 후보가 기다리고 있어요` : `${company} Harper 계정에 후보가 기다리고 있어요`,
    opening: (company: string) => `안녕하세요, ${company} 채용 담당자님. Harper입니다.`,
    closing: "Harper에서 후보를 확인하시고, 만나 보고 싶은 분께 연결을 요청해 주세요.",
  },
  en: {
    subject: (company: string, role: string | null) => role ? `Candidates are waiting on your ${role} role` : `Candidates are waiting in ${company}'s Harper account`,
    opening: (company: string) => `Hi ${company} team, this is Harper.`,
    closing: "Take a look in Harper and request an intro to anyone you'd like to meet.",
  },
} as const;

/**
 * The #3 mail opening: the model writes the subject and the sentences around the numbers; the sentence with
 * the numbers is written by code (demandNumberSentence), so the mail never carries a number the model made up.
 * Inputs are the company and Role names only, never who the candidates are. Any digit the model writes
 * (outside the names) falls back to fixed wording.
 */
export async function draftDemandMail(args: {
  workspaceId: string; roleId: string | null; days: number; language: "ko" | "en";
}): Promise<CompanyMailDraft & { numbers: string | null }> {
  let companyName: string;
  let roleName: string | null = null;
  let counts: DemandCounts;
  if (args.roleId) {
    const detail = await loadDemandRole({ workspaceId: args.workspaceId, roleId: args.roleId });
    companyName = detail.company.companyName;
    roleName = detail.role.name;
    counts = detail.role.counts;
  } else {
    const { company } = await loadDemandCompany({ workspaceId: args.workspaceId, days: args.days });
    companyName = company.companyName;
    counts = company.counts;
  }
  const numbers = demandNumberSentence({ language: args.language, roleName, counts });
  const kinds = [
    counts.waiting ? "candidates who already said yes and are waiting for the company to connect" : null,
    counts.toRequest ? "candidates Harper put forward for the company to request an intro" : null,
    counts.external ? "candidates from outside Harper found for the role" : null,
  ].filter(Boolean);
  const copy = DEFAULT_COPY[args.language];
  const draft = await gtmStructuredCall<{ subject: string; opening: string; closing: string }>({
    label: "ops/gtm-plays:demand-mail",
    schemaName: "gtm_demand_mail",
    schema: {
      type: "object", additionalProperties: false, required: ["subject", "opening", "closing"],
      properties: { subject: { type: "string" }, opening: { type: "string" }, closing: { type: "string" } },
    },
    system: [
      "You write a short email from Harper (an AI recruiting service) to the hiring team of a company that already uses Harper.",
      "Its point: people are waiting in the company's Harper account for the company to act.",
      `Language: ${args.language === "ko" ? "Korean (polite 해요체)" : "English"}. Plain text.`,
      "subject: one short line. opening: 1~2 sentences before the numbers. closing: 1~2 sentences after them, asking them to look in Harper.",
      "Code inserts one sentence with the exact numbers between opening and closing. Never write any number or count yourself.",
      "Never name, describe or hint at who the candidates are. No links and no sign-off: a button and the sign-off follow.",
    ].join("\n"),
    user: [
      `Company: ${companyName}`,
      roleName ? `Role: ${roleName}` : "Scope: all of the company's roles on Harper",
      kinds.length ? `Who is waiting: ${kinds.join("; ")}` : "Nobody is waiting right now.",
    ].join("\n"),
    maxTokens: 1_200,
  });
  // A digit outside the names means the model wrote a number: use the fixed wording for that part.
  const names = [companyName, roleName ?? ""].filter(Boolean);
  const noNumbers = (value: string | undefined, fallback: string) => {
    const text = String(value ?? "").trim();
    const withoutNames = names.reduce((rest, name) => rest.split(name).join(""), text);
    return text && !/\d/.test(withoutNames) ? text : fallback;
  };
  const opening = noNumbers(draft.opening, copy.opening(companyName));
  const closing = noNumbers(draft.closing, copy.closing);
  return {
    subject: noNumbers(draft.subject, copy.subject(companyName, roleName)),
    intro: [opening, numbers, closing].filter(Boolean).join("\n\n"),
    numbers,
  };
}

// ---------------------------------------------------------------------------------------------------------
// #1 대신 지원: applications Harper sent for candidates, one row per application.
// - 회사 사이트로: one candidate and one posting is one application, counted when it was really submitted: a run
//   Harper ran to submit (execute mode) whose report says the site confirmed the submission, or the candidate's
//   opportunity reached 지원함 (applied or later). Runs that stopped before the last step are attempts only; the
//   row keeps how many there were.
// - 회사 메일로 (이력서 첨부): a Gmail send through Harper with at least one document attached, to an address
//   on the company's homepage domain (or a subdomain of the mail domain). Personal mail domains and hosts many
//   companies share (linkedin.com, notion.site ...) never match; one mail counts for one company only
//   (a Harper customer first, then the exact domain).
// Harper staff and test accounts are left out, as on /ops/jobs.
// ---------------------------------------------------------------------------------------------------------

function applicationsCte(sql: GtmReadSql, days: number) {
  return sql`
    ${staffCte(sql)},
    site_runs as (
      select distinct on (o.id) o.id as op_id, o.user_id as talent_id, cr.company_workspace_id as cw, cr.role_id,
        o.created_at as at, cr.name as role_name, left(o.result->>'summary', 400) as summary,
        (lead.sentence ~* ${SUBMITTED_SENTENCE} and lead.sentence !~* ${NOT_SUBMITTED_SENTENCE}) as reports_submitted
      from public.talent_external_operations o
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(o.request->'role_refs') = 'array'
        then o.request->'role_refs' else '[]'::jsonb end) ref(role_id)
      join public.company_roles cr on ref.role_id ~* '^[0-9a-f-]{36}$' and cr.role_id = ref.role_id::uuid
      cross join lateral (select substring(coalesce(o.result->>'summary', '') from '^[^.!?。]*[.!?。]?') as sentence) lead
      where o.kind = 'browser_run' and o.status = 'completed' and ${EXECUTE_MODE(sql)}
        and o.created_at >= now() - make_interval(days => ${days}::int)
        and o.user_id not in (select user_id from staff)
      order by o.id, cr.company_workspace_id
    ),
    site_apps as (
      select distinct on (r.talent_id, r.role_id) r.op_id, r.talent_id, r.cw, 'site'::text as via, r.at, r.role_name,
        r.summary, (count(*) over (partition by r.talent_id, r.role_id))::int as attempts
      from site_runs r
      where exists (select 1 from site_runs s where s.talent_id = r.talent_id and s.role_id = r.role_id and s.reports_submitted)
        or exists (select 1 from public.talent_opportunity_recommendation t
          where t.talent_id = r.talent_id and t.role_id = r.role_id and t.saved_stage in ('applied', 'connected', 'offer'))
      -- The run that submitted stands for the application (its time and report), else the latest attempt.
      order by r.talent_id, r.role_id, r.reports_submitted desc, r.at desc
    ),
    ws_domains as (
      select cw, is_internal, host from (
        select w.company_workspace_id as cw, coalesce(w.is_internal, false) as is_internal,
          regexp_replace(regexp_replace(regexp_replace(lower(btrim(w.homepage_url)),
            '^[a-z][a-z0-9+.-]*://', ''), '^www\\.', ''), '[/:?#].*$', '') as host
        from public.company_workspace w
        where w.homepage_url is not null and btrim(w.homepage_url) <> ''
      ) hosts
      where host like '%.%' and host <> all(${SHARED_HOSTS}::text[])
        and not exists (select 1 from unnest(${SHARED_HOSTS}::text[]) shared(domain)
          where right(hosts.host, length(shared.domain) + 1) = '.' || shared.domain)
    ),
    mail_rcpts as (
      select o.id as op_id, o.user_id as talent_id, o.created_at as at, left(o.request->'snapshot'->>'subject', 400) as subject,
        split_part(lower(substring(rcpt.addr from '[^<>[:space:]@]+@[^<>[:space:]@]+')), '@', 2) as domain
      from public.talent_external_operations o
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(o.request->'snapshot'->'to') = 'array'
        then o.request->'snapshot'->'to' else '[]'::jsonb end) rcpt(addr)
      where o.kind = 'email_send' and o.status = 'succeeded'
        and jsonb_typeof(o.request->'snapshot'->'documents') = 'array'
        and jsonb_array_length(o.request->'snapshot'->'documents') > 0
        and o.created_at >= now() - make_interval(days => ${days}::int)
        and o.user_id not in (select user_id from staff)
    ),
    mail_apps as (
      select distinct on (m.op_id) m.op_id, m.talent_id, d.cw, 'mail'::text as via, m.at, null::text as role_name, m.subject as summary,
        1 as attempts
      from mail_rcpts m
      join ws_domains d on d.host = m.domain or right(d.host, length(m.domain) + 1) = '.' || m.domain
      where m.domain <> '' and m.domain <> all(${PERSONAL_DOMAINS}::text[])
      order by m.op_id, d.is_internal desc, (d.host = m.domain) desc, d.cw
    ),
    apps as (
      select op_id, talent_id, cw, via, at, role_name, summary, attempts from site_apps
      union all
      select op_id, talent_id, cw, via, at, role_name, summary, attempts from mail_apps
    )
  `;
}

export type ApplyFunnelRow = {
  workspaceId: string;
  companyName: string;
  isCustomer: boolean;
  /** Distinct people Harper applied for at this company, either way. */
  people: number;
  /** Applications Harper submitted on the company's site (one per candidate and posting, really submitted). */
  siteApplications: number;
  /** Gmail sends through Harper with a document attached, to the company's mail domain. */
  mailApplications: number;
  lastAt: string | null;
};

/**
 * #1, applications only: how many Harper sent per company. Whether the company opened them is not
 * recorded anywhere yet (site forms and the candidate's own Gmail carry no Harper marker).
 */
export async function listApplyFunnel(args: { days: number; limit?: number }): Promise<ApplyFunnelRow[]> {
  const days = Math.min(Math.max(Math.trunc(args.days) || 30, 1), 365);
  const limit = Math.min(Math.max(args.limit ?? 200, 1), 1_000);
  const rows = await gtmRead((sql) => sql<Array<{
    workspace_id: string; company_name: string; is_customer: boolean; people: number;
    site_apps: number; mail_apps: number; last_at: string | Date | null;
  }>>`
    with ${applicationsCte(sql, days)},
    per as (
      select cw,
        count(distinct talent_id)::int as people,
        count(*) filter (where via = 'site')::int as site_apps,
        count(*) filter (where via = 'mail')::int as mail_apps,
        max(at) as last_at
      from apps group by cw
    )
    select per.cw::text as workspace_id, w.company_name, per.people, per.site_apps, per.mail_apps, per.last_at,
      (w.is_internal is true) as is_customer
    from per join public.company_workspace w on w.company_workspace_id = per.cw
    where per.cw <> all(array[${HARPER_WORKSPACE_ID}, ${GTM_WORKSPACE_ID}]::uuid[])
    order by (per.site_apps + per.mail_apps) desc, per.last_at desc nulls last
    limit ${limit}::int
  `);
  return rows.map((row) => ({
    workspaceId: row.workspace_id, companyName: row.company_name, isCustomer: Boolean(row.is_customer),
    people: Number(row.people), siteApplications: Number(row.site_apps), mailApplications: Number(row.mail_apps),
    lastAt: row.last_at ? new Date(row.last_at).toISOString() : null,
  }));
}

export type ApplicationRow = {
  talentId: string;
  talentName: string | null;
  roleName: string | null;
  via: "web" | "email";
  at: string;
  /** The run's summary (site) or the mail subject. */
  summary: string | null;
  /** Site: how many runs Harper made for this candidate and posting (stopped ones included); mail: 1. */
  attempts: number;
};

export const APPLICATIONS_SHOWN = 100;

/** The applications behind one company's #1 row, one per application (internal view: names are for staff). */
export async function listCompanyApplications(args: { workspaceId: string; days: number }) {
  const days = Math.min(Math.max(Math.trunc(args.days) || 30, 1), 365);
  const rows = await gtmRead((sql) => sql<Array<{
    talent_id: string; name: string | null; role_name: string | null; via: "site" | "mail"; at: string | Date;
    summary: string | null; attempts: number; total: number;
  }>>`
    with ${applicationsCte(sql, days)}
    select a.talent_id::text as talent_id, t.name, a.role_name, a.via, a.at, a.summary, a.attempts, count(*) over ()::int as total
    from apps a
    left join public.talent_users t on t.user_id = a.talent_id
    where a.cw = ${args.workspaceId}::uuid
    order by a.at desc
    limit ${APPLICATIONS_SHOWN}::int
  `);
  return {
    total: Number(rows[0]?.total ?? 0),
    applications: rows.map((row): ApplicationRow => ({
      talentId: row.talent_id, talentName: row.name, roleName: row.role_name, via: row.via === "site" ? "web" : "email",
      at: new Date(row.at).toISOString(), summary: row.summary, attempts: Number(row.attempts) || 1,
    })),
  };
}

export type CandidatePagePreview = {
  name: string | null;
  headline: string | null;
  location: string | null;
  experiences: Array<{ role: string | null; company: string | null; start: string | null; end: string | null }>;
  educations: Array<{ school: string | null; degree: string | null; field: string | null }>;
};

/** The candidate behind an application (internal view). */
export async function loadCandidatePagePreview(talentId: string): Promise<CandidatePagePreview> {
  return gtmRead(async (sql) => {
    const [person] = await sql<Array<{ name: string | null; headline: string | null; location: string | null }>>`
      select name, headline, coalesce(current_location, location) as location
      from public.talent_users where user_id = ${talentId}::uuid and deleted_at is null
    `;
    if (!person) throw new Error("후보를 찾지 못했어요.");
    const [experiences, educations] = await Promise.all([
      sql<Array<{ role: string | null; company_name: string | null; start_date: string | null; end_date: string | null }>>`
        select role, company_name, start_date::text, end_date::text from public.talent_experiences
        where talent_id = ${talentId}::uuid order by end_date desc nulls first, start_date desc nulls last limit 6
      `,
      sql<Array<{ school: string | null; degree: string | null; field: string | null }>>`
        select school, degree, field from public.talent_educations
        where talent_id = ${talentId}::uuid order by end_date desc nulls first limit 3
      `,
    ]);
    return {
      name: person.name, headline: person.headline, location: person.location,
      experiences: experiences.map((row) => ({ role: row.role, company: row.company_name, start: row.start_date, end: row.end_date })),
      educations: educations.map((row) => ({ school: row.school, degree: row.degree, field: row.field })),
    };
  });
}

