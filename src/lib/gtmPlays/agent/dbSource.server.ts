import "server-only";

import { Resolver } from "node:dns/promises";
import { gtmRead } from "../db.server";
import { mailDomain } from "../personalMail";
import {
  CANDID_ADDRESS_PATTERN, candidSourceRef, dbCandidates, dbCurrentCompany, dbProfileText, pickDbCandidates, settleMxVerdicts,
  mxVerdictOf, type CandidEducation, type CandidExperience, type CandidRow, type DbCandidate, type MxVerdict,
} from "./dbSource";
import { cleanEmail } from "./people";
import { personMemoryKeys } from "./signals";
import { insertAgentPeople, type NewAgentPerson } from "./store.server";
import type { AgentSettings } from "./types";

/**
 * Rows a batch returns (each reads ~40 rows through the primary key per row returned: about 3% of the Korean rows and
 * 6% of the rest carry a personal address; 60 rows read ~2,400 in about 1.3 s with cold pages, measured 11/23).
 */
const BATCH_MIN = 20;
const BATCH_MAX = 60;
/** Batches per phase and call: a run of people the agent already has never makes one call read far. */
const BATCHES_PER_PHASE = 3;
/** One MX lookup at most this long (one try); the call's lookups run together. */
const MX_TIMEOUT_MS = 2_500;
const STATEMENT_TIMEOUT = "10s";
const FIRST_ID = "00000000-0000-0000-0000-000000000000";
/** Korean people first, then the rest (dbSource.ts). */
const PHASES = [true, false] as const;
const AGENT = "agent";

type BatchRow = {
  id: string; name: string | null; headline: string | null; location: string | null; linkedin_url: string | null;
  email: string | null; links: string[] | null; summary: string | null; bio: string | null;
};

const toRow = (row: BatchRow): CandidRow => ({
  id: row.id, name: row.name, headline: row.headline, location: row.location, linkedinUrl: row.linkedin_url, email: row.email,
  links: Array.isArray(row.links) ? row.links : null, summary: row.summary, bio: row.bio,
});

/** Where each phase's walk goes on from: the last candid row of that phase the agent took (by its id). */
async function walkStarts(): Promise<Map<boolean, string>> {
  const rows = await gtmRead(async (sql) => {
    await sql.unsafe(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`);
    return sql<Array<{ korean: boolean; id: string }>>`
      select k.korean, coalesce((
        select c.id::text from public.gtm_agent_people p
        join public.candid c on c.id = (case when p.source_ref ~ '^candid:[0-9a-f-]{36}$' then substr(p.source_ref, 8)::uuid end)
        where p.source_ref like 'candid:%' and coalesce(c.is_korean, false) = k.korean
        order by c.id desc limit 1
      ), ${FIRST_ID}) as id
      from (values (true), (false)) as k(korean)
    `;
  });
  return new Map(rows.map((row) => [row.korean, row.id]));
}

/** The next rows of a phase after `after` with a personal address, not taken before (source_ref; the unique index guards it too). */
async function readBatch(korean: boolean, after: string, limit: number): Promise<CandidRow[]> {
  const rows = await gtmRead(async (sql) => {
    await sql.unsafe(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`);
    return sql<BatchRow[]>`
      select c.id::text as id, c.name, c.headline, c.location, c.linkedin_url, c.email, c.links, c.summary, c.bio
      from public.candid c
      where c.id > ${after}::uuid and coalesce(c.is_korean, false) = ${korean}
        and c.is_duplicated_old is not true
        and c.email ~* ${CANDID_ADDRESS_PATTERN}
        and not exists (select 1 from public.gtm_agent_people p where p.source_ref = 'candid:' || c.id::text)
      order by c.id
      limit ${limit}
    `;
  });
  return rows.map(toRow);
}

/** Every key of these people the agent already has (any real row: by its key, or by an address it found later). */
async function knownKeys(candidates: readonly DbCandidate[]): Promise<Set<string>> {
  const keys = [...new Set(candidates.flatMap((candidate) => candidate.keys))];
  const emails = [...new Set(candidates.map((candidate) => candidate.email))];
  if (!keys.length) return new Set();
  const rows = await gtmRead((sql) => sql<Array<{ person_key: string; email: string | null; profile_url: string | null; contact_url: string | null }>>`
    select person_key, email, profile_url, contact_url from public.gtm_agent_people
    where not is_test and (person_key = any(${keys}::text[]) or lower(email) = any(${emails}::text[]))
  `);
  const known = new Set<string>();
  for (const row of rows) {
    for (const key of personMemoryKeys({ personKey: row.person_key, email: row.email, profileUrl: row.profile_url, contactUrl: row.contact_url })) known.add(key);
    const email = cleanEmail(row.email);
    if (email) known.add(`email:${email}`);
  }
  return known;
}

/** One domain's MX verdict (dbSource.ts mxVerdictOf), one try with a short timeout. */
function lookupMx(resolver: Resolver, domain: string): Promise<MxVerdict> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<MxVerdict>((resolve) => {
    timer = setTimeout(() => resolve("unknown"), MX_TIMEOUT_MS + 500);
  });
  const resolved = resolver.resolveMx(domain)
    .then((records) => mxVerdictOf({ records }))
    .catch((error: unknown) => mxVerdictOf({ errorCode: (error as { code?: string })?.code ?? null }));
  return Promise.race([resolved, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The MX verdicts of one call: each domain looked up once (cached for the call), the call's lookups settled together
 * (settleMxVerdicts: no "none" while no domain resolved at all). Also the job-page request's address check
 * (request.server.ts requestMailDomainOk).
 */
export function mxChecker() {
  const resolver = new Resolver({ timeout: MX_TIMEOUT_MS, tries: 1 });
  const cache = new Map<string, Promise<MxVerdict>>();
  return async (domains: readonly string[]): Promise<Map<string, MxVerdict>> => {
    for (const domain of new Set(domains.filter(Boolean))) if (!cache.has(domain)) cache.set(domain, lookupMx(resolver, domain));
    const all = settleMxVerdicts(new Map(await Promise.all([...cache].map(async ([domain, verdict]) => [domain, await verdict] as const))));
    return new Map(domains.map((domain) => [domain, all.get(domain) ?? "unknown"]));
  };
}

/** Their experience (with the company's name) and education, by candid id. */
async function careers(ids: readonly string[]): Promise<{ experience: Map<string, CandidExperience[]>; education: Map<string, CandidEducation[]> }> {
  const experience = new Map<string, CandidExperience[]>();
  const education = new Map<string, CandidEducation[]>();
  if (!ids.length) return { experience, education };
  const [jobs, schools] = await gtmRead(async (sql) => {
    await sql.unsafe(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`);
    return Promise.all([
      sql<Array<{ candid_id: string; company: string | null; role: string | null; description: string | null; months: number | null; start_date: string | null; end_date: string | null }>>`
        select e.candid_id::text as candid_id, cd.name as company, e.role, left(e.description, 1000) as description, e.months,
          to_char(e.start_date, 'YYYY-MM-DD') as start_date, to_char(e.end_date, 'YYYY-MM-DD') as end_date
        from public.experience_user e left join public.company_db cd on cd.id = e.company_id
        where e.candid_id = any(${ids}::uuid[])
      `,
      sql<Array<{ candid_id: string; school: string | null; degree: string | null; field: string | null; start_date: string | null; end_date: string | null }>>`
        select u.candid_id::text as candid_id, u.school, u.degree, u.field,
          to_char(u.start_date, 'YYYY-MM-DD') as start_date, to_char(u.end_date, 'YYYY-MM-DD') as end_date
        from public.edu_user u
        where u.candid_id = any(${ids}::uuid[])
        order by u.candid_id, u.end_date desc nulls first, u.start_date desc nulls last
      `,
    ]);
  });
  for (const job of jobs) {
    const list = experience.get(job.candid_id) ?? experience.set(job.candid_id, []).get(job.candid_id)!;
    list.push({ company: job.company, role: job.role, description: job.description, months: job.months === null ? null : Number(job.months), startDate: job.start_date, endDate: job.end_date });
  }
  for (const school of schools) {
    const list = education.get(school.candid_id) ?? education.set(school.candid_id, []).get(school.candid_id)!;
    list.push({ school: school.school, degree: school.degree, field: school.field, startDate: school.start_date, endDate: school.end_date });
  }
  return { experience, education };
}

/**
 * The purchased candidate DB (Shaun 11/23, the `candid` table): each call puts in, as found, up to `room` people (the
 * DB channel's daily max less today's DB mails and the DB people still in work) not taken before (source_ref
 * 'candid:<id>'), with an address the agent may mail whose domain takes mail, and their profile written from the
 * headline, summary, experience and education (dbSource.ts). Korean people first, then the rest, each in the table's
 * key order from after the last row taken (dbSource.ts says why). The exclusion rules (members, opt-outs, recent
 * contact), the posting pick and the mail run on them as on anyone found.
 *
 * A domain without MX records is passed over, not put in as excluded: the walk never reads a passed row again (it
 * goes on after the last row taken), so nothing is checked twice, and a person the agent can never mail stays out of
 * the DB channel's numbers on /ops. A lookup that failed otherwise (a timeout, a server error) stops the walk there,
 * so that person is read again next time.
 *
 * Returns how many it put in. Errors are logged and give 0 (before the 11/23 migration, source_ref is missing).
 */
export async function pullDbPeople(args: { runId: string; settings: AgentSettings; configId: string | null; room: number }): Promise<number> {
  const room = Math.max(0, Math.floor(args.room));
  if (!room) return 0;
  try {
    const starts = await walkStarts();
    const mxOf = mxChecker();
    const picked: Array<DbCandidate & { korean: boolean }> = [];
    const skipped = { known: 0, duplicate: 0, noMx: 0, noAddress: 0 };
    let stopped = false;
    const batchSize = Math.min(BATCH_MAX, Math.max(BATCH_MIN, room * 2));
    for (const korean of PHASES) {
      let after = starts.get(korean) ?? FIRST_ID;
      // The rest only once every Korean row was read (a call that ran out of batches first goes on with them next time).
      let exhausted = false;
      for (let batch = 0; batch < BATCHES_PER_PHASE && picked.length < room && !stopped; batch += 1) {
        const rows = await readBatch(korean, after, batchSize);
        if (rows.length < batchSize) exhausted = true;
        if (!rows.length) break;
        after = rows[rows.length - 1].id;
        const candidates = dbCandidates(rows);
        skipped.noAddress += rows.length - candidates.length;
        if (!candidates.length) continue;
        const known = await knownKeys(candidates);
        for (const person of picked) for (const key of person.keys) known.add(key);
        const mx = await mxOf(candidates.map((candidate) => mailDomain(candidate.email)));
        const step = pickDbCandidates(candidates, { room: room - picked.length, known, mx });
        picked.push(...step.picked.map((person) => ({ ...person, korean })));
        skipped.known += step.skipped.known;
        skipped.duplicate += step.skipped.duplicate;
        skipped.noMx += step.skipped.noMx;
        stopped = step.stopped;
        if (exhausted) break;
      }
      if (picked.length >= room || stopped || !exhausted) break;
    }
    if (stopped) console.warn("[gtm-agent] db people: an address's domain could not be checked, the walk stops there for now");
    if (!picked.length) {
      console.info("[gtm-agent] db people", JSON.stringify({ added: 0, ...skipped, stopped }));
      return 0;
    }
    const { experience, education } = await careers(picked.map((person) => person.row.id));
    const people: NewAgentPerson[] = picked.map(({ row, email, profileUrl, contactUrl, personKey, korean }) => {
      const jobs = experience.get(row.id) ?? [];
      return {
        runId: args.runId, source: "db", method: "db", settingsVersion: args.settings.version, configId: args.configId,
        personKey, sourceRef: candidSourceRef(row.id), email, emailSource: "import", isTest: false,
        name: row.name?.replace(/\s+/g, " ").trim().slice(0, 120) || null,
        headline: row.headline?.replace(/\s+/g, " ").trim().slice(0, 300) || null,
        location: row.location?.trim().slice(0, 200) || null,
        currentCompany: dbCurrentCompany(jobs),
        profileUrl, contactUrl,
        profileText: dbProfileText(row, jobs, education.get(row.id) ?? []),
        // No signal: the DB says nothing of looking for a job (undated: last in the queue), and no intent (the general offer).
        signalText: null, signalUrl: null, signalAt: null, intent: null,
        // The DB marks Korean people (their profiles are often in English): Korean mail for them; the rest by their text.
        language: korean ? "ko" : null,
        foundNote: "구매 DB",
      };
    });
    const inserted = await insertAgentPeople(people, AGENT);
    console.info("[gtm-agent] db people", JSON.stringify({ added: inserted.length, ...skipped, stopped }));
    return inserted.length;
  } catch (error) {
    // Never stops the tick: a later tick tries again (a row taken meanwhile is kept out by source_ref's unique index).
    const message = error instanceof Error ? error.message : String(error);
    // Before the 11/23 migration (no source_ref column) this is expected: a warning, not an error.
    if ((error as { code?: string })?.code === "42703") console.warn("[gtm-agent] db people: gtm_agent_people.source_ref is missing", message);
    else console.error("[gtm-agent] db people failed", message);
    return 0;
  }
}
