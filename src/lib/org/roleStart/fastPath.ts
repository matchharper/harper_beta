import "server-only";

import type { OrgRoleCriterion } from "@/lib/org/roleCriteria";
import {
  criterionHash,
  criterionQueryText,
  isRequired,
  weightOf,
  type RoleStartBrief,
  type RoleStartCriterion,
  type RoleStartHardCondition,
  type RoleStartProbe,
} from "./brief";
import { roleStartSql } from "./db";
import { embedTexts, vectorLiteral } from "./llm";
import { countriesOfCities, KNOWN_CITIES, sameAreaCities } from "./regions";
import { computeJobScores, jobScoreKey } from "./jobMatch";
import { termPattern } from "./terms";

/**
 * Synchronous candidate path for the role start flow.
 *
 * A broad pool (~1,000 company-visible, unseen people ranked by similarity to
 * the JD) is built once when the JD is read, in parallel with the rubric LLM.
 * Hard conditions are then applied in memory, so an answer that narrows a
 * condition removes people and an answer that widens it brings back people it
 * had removed, without another query. Criterion scores are computed for the
 * whole broad pool and only for criteria whose text changed. No LLM scores
 * anyone here; the scheduled company-first search and its locks are not used.
 */

export const ROLE_START_BROAD_SIZE = 1_000;
/**
 * Up to this many eligible people, the pool is all of them: required
 * conditions then decide in memory (years in this Role's job included), so
 * everyone who meets them can be picked. Above it, the top ROLE_START_BROAD_SIZE
 * by JD similarity plus the term and job-score supplements.
 */
export const ROLE_START_FULL_POOL_MAX = 8_000;
export const ROLE_START_POOL_SIZE = 300;
export const ROLE_START_POOL_TTL_MS = 30 * 60_000;

export type PoolMember = {
  talentId: string;
  /** Years since the first dated experience; replaced by years in this Role's job once known. */
  years: number | null;
  /** "role": years in this Role's job; "total": the job could not be read, so total career years. */
  yearsBasis?: "role" | "total";
  countryCode: string | null;
  city: string | null;
  remoteOk: boolean | null;
  relocationOk: boolean | null;
  /** Countries the person said they can move to (empty: not said). Older pools lack it. */
  relocationCountries?: string[];
  retrieval: number;
};

export type CriterionScore = {
  score: number;
  raw: number;
  evidence: string | null;
  /** No profile sections to compare: ranked low, left for the verdict, never a must miss. */
  unknown?: boolean;
  /** Section similarity part alone (no tool bonus); the must check reads this. */
  similarity?: number;
};

/** Rank given to a person with no sections for a criterion (low decile, not the middle). */
export const UNKNOWN_SCORE = 0.1;

export type RoleStartPool = {
  builtAt: string;
  /** Text the pool was built from; a rebuild after the TTL uses the same text. */
  queryText?: string;
  eligibleCount: number;
  /** Set when the last ranking applied the Brief's hard conditions. */
  filteredCount: number;
  conditionCounts: Array<{ id: string; label: string; removed: number }>;
  /** Broad pool, ordered by JD similarity. */
  members: PoolMember[];
  /** criterionHash → talentId → score */
  scores: Record<string, Record<string, CriterionScore>>;
  timings: Record<string, number>;
  embeddingTokens: number;
  /**
   * Job-match score per member for the Brief's titles (absent until titles
   * exist), and years in this Role's job (null: the job cannot be read).
   */
  job?: { key: string; scores: Record<string, number | null>; years?: Record<string, number | null> };
};

type Sql = ReturnType<typeof roleStartSql>;

/** An office city without countries still means that city's country. */
function locationCountries(condition: Extract<RoleStartHardCondition, { kind: "location" }>) {
  return condition.countries.length ? condition.countries : countriesOfCities(condition.cities);
}

/**
 * An on-site (or hybrid) Role: a location condition is checked against
 * the home country and city, with relocation; a fully remote Role (a
 * remote_ok condition) only against the country. Either way a person whose
 * country is not known stays in, marked 확인 필요 by the verdict.
 */
export function onsiteRole(brief: RoleStartBrief) {
  return !brief.hardConditions.some((condition) => condition.kind === "remote_ok");
}

/** Whether one person meets one required condition: a confirmed mismatch fails, an unknown passes. */
export function passesCondition(member: PoolMember, condition: RoleStartHardCondition, onsite: boolean) {
  switch (condition.kind) {
    case "min_years":
      return member.years === null || member.years >= condition.years;
    case "max_years":
      return member.years === null || member.years <= condition.years;
    case "location": {
      const countries = locationCountries(condition);
      const allowed = sameAreaCities(condition.cities);
      const memberCity = member.city?.toLowerCase() ?? null;
      const city =
        !allowed.length || memberCity === null || !KNOWN_CITIES.includes(memberCity) || allowed.includes(memberCity);
      if (!onsite) {
        const country = !countries.length || member.countryCode === null || countries.includes(member.countryCode);
        return (country && city) || (condition.allowRelocation && member.relocationOk === true);
      }
      if (member.countryCode === null) return city;
      const home = !countries.length || countries.includes(member.countryCode);
      const moves = (member.relocationCountries ?? []).some((code) => countries.includes(code));
      return (
        (home && city) ||
        (condition.allowRelocation && countries.includes(member.countryCode) && member.relocationOk === true) ||
        (condition.allowRelocation && moves)
      );
    }
    case "remote_ok":
      return member.remoteOk !== false;
    default:
      return true;
  }
}

/** Talent rows that Harper may show to this company for this Role. */
/**
 * Offline replay only (harper_eval): rank a past Role that has no row here,
 * over a fixed set of people, without the pair check (the people a company
 * already met are exactly the ones the replay scores). Never set by the app.
 */
export type ReplayScope = { talentIds: string[]; companyNames: string[] };

function eligibleCte(sql: Sql, roleId: string, excludeIds: string[], replay?: ReplayScope) {
  if (replay) {
    return sql`
      select t.user_id as talent_id
      from public.talent_users t
      join public.talent_setting s on s.user_id = t.user_id
      where t.deleted_at is null
        and s.is_onboarding_done is true
        and s.get_internal_recommendation is not false
        and s.profile_visibility = 'open_to_matches'
        and not exists (
          select 1 from unnest(coalesce(s.blocked_companies, '{}'::text[])) blocked(name)
          where lower(btrim(blocked.name)) = any(${replay.companyNames.map((name) => name.trim().toLowerCase())}::text[])
        )
        and t.user_id = any(${replay.talentIds}::uuid[])
        and not (t.user_id = any(${excludeIds}::uuid[]))
    `;
  }
  // Same talent/company gate as the company-first branch of the worker's
  // sql_safety guard; pair availability uses the same SQL function.
  return sql`
    select t.user_id as talent_id
    from public.talent_users t
    join public.talent_setting s on s.user_id = t.user_id
    join public.company_roles r on r.role_id = ${roleId}
    join public.company_workspace w on w.company_workspace_id = r.company_workspace_id
    where t.deleted_at is null
      and s.is_onboarding_done is true
      and s.get_internal_recommendation is not false
      and s.profile_visibility = 'open_to_matches'
      and not exists (
        select 1 from unnest(coalesce(s.blocked_companies, '{}'::text[])) blocked(name)
        where lower(btrim(blocked.name)) in (lower(btrim(w.company_name)), lower(btrim(coalesce(w.published_name, ''))))
      )
      and public.company_first_pair_is_available_v1(t.user_id, r.role_id)
      and not (t.user_id = any(${excludeIds}::uuid[]))
  `;
}

type EligibleFact = {
  talent_id: string;
  years: number | null;
  country_code: string | null;
  city: string | null;
  remote_ok: boolean | null;
  relocation_ok: boolean | null;
  relocation_countries: string[] | null;
};

/** Every eligible person with the facts required conditions read. */
function eligibleFacts(sql: Sql, roleId: string, excludeIds: string[], replay?: ReplayScope) {
  return sql<EligibleFact[]>`
    with eligible as (${eligibleCte(sql, roleId, excludeIds, replay)})
    select e.talent_id::text as talent_id, y.years::float8 as years, f.country_code, f.city, f.remote_ok, f.relocation_ok, f.relocation_countries
    from eligible e
    left join lateral (
      select extract(epoch from (now() - min(x.start_date)::timestamptz)) / 31557600.0 as years
      from public.talent_experiences x
      where x.talent_id = e.talent_id and x.start_date is not null
    ) y on true
    left join public.talent_location_facets f on f.talent_id = e.talent_id
  `;
}

function factMember(row: EligibleFact, retrieval: number): PoolMember {
  return {
    talentId: String(row.talent_id),
    years: row.years === null || row.years === undefined ? null : Number(row.years),
    countryCode: row.country_code ?? null,
    city: row.city ?? null,
    remoteOk: row.remote_ok ?? null,
    relocationOk: row.relocation_ok ?? null,
    relocationCountries: row.relocation_countries ?? [],
    retrieval,
  };
}

/**
 * Full-population counts for progress lines and the thin-pool notice, by the
 * same rule as the pick: required conditions in memory, years in this Role's
 * job when the Brief has job titles (total career years otherwise).
 */
export async function countByConditions(args: {
  roleId: string;
  brief: RoleStartBrief;
  excludeIds: string[];
}) {
  const sql = roleStartSql();
  const rows = await eligibleFacts(sql, args.roleId, args.excludeIds);
  const ids = rows.map((row) => String(row.talent_id));
  const job = args.brief.titles?.matching.length ? await computeJobScores({ brief: args.brief, talentIds: ids }) : null;
  const members = rows.map((row) => {
    const member = factMember(row, 0);
    const roleYears = job?.years[member.talentId];
    return roleYears === undefined || roleYears === null ? member : { ...member, years: roleYears };
  });
  const conditions = args.brief.hardConditions.filter((condition) => condition.kind !== "other");
  const onsite = onsiteRole(args.brief);
  const passing = (member: PoolMember, skip?: RoleStartHardCondition) =>
    conditions.every((condition) => condition === skip || passesCondition(member, condition, onsite));
  const filtered = members.filter((member) => passing(member));
  return {
    eligibleCount: rows.length,
    filteredIds: filtered.map((member) => member.talentId),
    conditionCounts: conditions.map((condition) => ({
      id: condition.id,
      label: condition.label,
      removed: members.filter((member) => passing(member, condition)).length - filtered.length,
    })),
  };
}

export function jdQueryText(args: { roleName: string; description?: string | null; brief?: RoleStartBrief | null }) {
  return [
    args.roleName,
    args.brief?.summary,
    ...(args.brief?.criteria ?? []).map((criterion) => `${criterion.name}: ${criterion.criteria}`),
    args.brief ? null : args.description,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 6_000);
}

/** Reciprocal rank fusion (k=60) of several orderings of the same ids. */
function fuse(ids: string[], rankings: string[][]) {
  const totals = new Map(ids.map((id) => [id, 0]));
  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      if (totals.has(id)) totals.set(id, totals.get(id)! + 1 / (60 + index + 1));
    });
  }
  return [...totals.entries()].sort((left, right) => right[1] - left[1]);
}

/**
 * The broad pool: every company-visible, unseen person, ranked by whole-profile
 * and best-section similarity to the JD; the top ~1,000 keep their SQL facts.
 */
export async function buildBroadPool(args: {
  roleId: string;
  queryText: string;
  excludeIds: string[];
  replay?: ReplayScope;
}): Promise<RoleStartPool> {
  const sql = roleStartSql();
  const started = Date.now();
  const [facts, embedded] = await Promise.all([eligibleFacts(sql, args.roleId, args.excludeIds, args.replay), embedTexts([args.queryText])]);
  const factsMs = Date.now() - started;
  const ids = facts.map((row) => String(row.talent_id));
  const query = vectorLiteral(embedded.vectors[0] ?? []);
  // Everyone when the population allows it; otherwise the top by JD similarity.
  const full = ids.length <= ROLE_START_FULL_POOL_MAX;
  const limit = full ? ids.length : ROLE_START_BROAD_SIZE;
  const [profileRank, sectionRank] = ids.length
    ? await Promise.all([
        sql<Array<{ talent_id: string }>>`
          select p.talent_id::text as talent_id
          from public.talent_profile_search_embeddings p
          where p.talent_id = any(${ids}::uuid[]) and p.embedding_model = 'text-embedding-3-small'
          order by (p.embedding::vector(1536)) <=> ${query}::vector
          limit ${limit}
        `,
        sql<Array<{ talent_id: string }>>`
          select c.talent_id::text as talent_id, min(c.embedding <=> ${query}::vector) as distance
          from public.talent_profile_chunk_embeddings c
          where c.talent_id = any(${ids}::uuid[])
          group by c.talent_id
          order by distance
          limit ${limit}
        `,
      ])
    : [[], []];
  const fused = fuse(ids, [
    profileRank.map((row) => String(row.talent_id)),
    sectionRank.map((row) => String(row.talent_id)),
  ]).slice(0, limit);
  const factMap = new Map(facts.map((row) => [String(row.talent_id), row]));
  const maxScore = fused[0]?.[1] || 1;
  return {
    builtAt: new Date().toISOString(),
    queryText: args.queryText,
    eligibleCount: ids.length,
    filteredCount: ids.length,
    conditionCounts: [],
    members: fused.map(([talentId, score]) => {
      const fact = factMap.get(talentId);
      return {
        talentId,
        years: fact?.years === null || fact?.years === undefined ? null : Number(fact.years),
        countryCode: fact?.country_code ?? null,
        city: fact?.city ?? null,
        remoteOk: fact?.remote_ok ?? null,
        relocationOk: fact?.relocation_ok ?? null,
        relocationCountries: fact?.relocation_countries ?? [],
        retrieval: score / maxScore,
      };
    }),
    scores: {},
    timings: { factsMs, broadMs: Date.now() - started },
    embeddingTokens: embedded.tokens,
  };
}

/**
 * After the rubric: add up to 300 eligible people outside the pool whose
 * profiles literally name the criteria's tools (any spelling). The JD-only
 * pool misses people who describe the same stack in different words.
 */
export async function supplementPoolWithTerms(args: {
  pool: RoleStartPool;
  roleId: string;
  criteria: RoleStartCriterion[];
  excludeIds?: string[];
  replay?: ReplayScope;
}) {
  const started = Date.now();
  const sql = roleStartSql();
  const patterns = Array.from(
    new Set(args.criteria.flatMap((criterion) => criterionTerms(criterion).flat()).map(termPattern))
  );
  if (!patterns.length) return { added: 0, ms: 0 };
  const present = args.pool.members.map((member) => member.talentId);
  const rows = await sql<
    Array<{
      talent_id: string;
      hits: number;
      years: number | null;
      country_code: string | null;
      city: string | null;
      remote_ok: boolean | null;
      relocation_ok: boolean | null;
      relocation_countries: string[] | null;
    }>
  >`
    with eligible as (${eligibleCte(sql, args.roleId, [...(args.excludeIds ?? []), ...present], args.replay)}),
    matched as (
      select c.talent_id, count(distinct p.pattern)::int as hits
      from public.talent_profile_chunk_embeddings c
      join eligible e on e.talent_id = c.talent_id
      join unnest(${patterns}::text[]) as p(pattern) on lower(c.chunk_text) ~ p.pattern
      group by c.talent_id
      order by hits desc
      limit 300
    )
    select m.talent_id::text as talent_id, m.hits, y.years::float8 as years, f.country_code, f.city, f.remote_ok, f.relocation_ok, f.relocation_countries
    from matched m
    left join lateral (
      select extract(epoch from (now() - min(x.start_date)::timestamptz)) / 31557600.0 as years
      from public.talent_experiences x
      where x.talent_id = m.talent_id and x.start_date is not null
    ) y on true
    left join public.talent_location_facets f on f.talent_id = m.talent_id
  `;
  for (const row of rows) {
    args.pool.members.push({
      talentId: String(row.talent_id),
      years: row.years === null ? null : Number(row.years),
      countryCode: row.country_code,
      city: row.city,
      remoteOk: row.remote_ok,
      relocationOk: row.relocation_ok,
      relocationCountries: row.relocation_countries ?? [],
      // Not found by JD similarity; criteria decide their place.
      retrieval: 0.3,
    });
  }
  // Criterion scores must cover the newcomers too.
  args.pool.scores = {};
  args.pool.timings.supplementMs = Date.now() - started;
  return { added: rows.length, ms: Date.now() - started };
}

/**
 * After the rubric: tool-name top-up, then job-match scores for every eligible
 * person and a top-up of the best job matches the JD similarity missed.
 */
export async function completePool(args: {
  pool: RoleStartPool;
  roleId: string;
  brief: RoleStartBrief;
  excludeIds?: string[];
  replay?: ReplayScope;
}) {
  const started = Date.now();
  const terms = await supplementPoolWithTerms({ ...args, criteria: args.brief.criteria });
  const key = jobScoreKey(args.brief);
  if (!args.brief.titles?.matching.length) return { termsAdded: terms.added, jobAdded: 0, ms: Date.now() - started };
  const sql = roleStartSql();
  const eligible = (
    await sql<Array<{ talent_id: string }>>`
      with eligible as (${eligibleCte(sql, args.roleId, args.excludeIds ?? [], args.replay)}) select talent_id::text from eligible
    `
  ).map((row) => String(row.talent_id));
  const computed = await computeJobScores({ brief: args.brief, talentIds: eligible });
  const scores = computed?.scores ?? {};
  const present = new Set(args.pool.members.map((member) => member.talentId));
  const extra = eligible
    .filter((id) => !present.has(id) && (scores[id] ?? 0) >= JOB_MUST)
    .sort((left, right) => (scores[right] ?? 0) - (scores[left] ?? 0))
    .slice(0, ROLE_START_JOB_SUPPLEMENT);
  if (extra.length) {
    const facts = await memberFacts(extra);
    for (const id of extra) {
      const fact = facts.get(id);
      args.pool.members.push({
        talentId: id,
        years: fact?.years ?? null,
        countryCode: fact?.countryCode ?? null,
        city: fact?.city ?? null,
        remoteOk: fact?.remoteOk ?? null,
        relocationOk: fact?.relocationOk ?? null,
        relocationCountries: fact?.relocationCountries ?? [],
        // Not found by JD similarity; the job score and criteria decide its place.
        retrieval: 0.3,
      });
    }
    args.pool.scores = {};
  }
  args.pool.job = {
    key,
    scores: Object.fromEntries(args.pool.members.map((member) => [member.talentId, scores[member.talentId] ?? null])),
    years: Object.fromEntries(
      args.pool.members.map((member) => [member.talentId, computed?.years[member.talentId] ?? null])
    ),
  };
  args.pool.timings.completeMs = Date.now() - started;
  return { termsAdded: terms.added, jobAdded: extra.length, ms: Date.now() - started };
}

/** Job-match scores for the current members when the Brief's titles changed. */
export async function ensureJobScores(args: { pool: RoleStartPool; brief: RoleStartBrief }) {
  const key = jobScoreKey(args.brief);
  if (!args.brief.titles?.matching.length || args.pool.job?.key === key) return;
  const computed = await computeJobScores({ brief: args.brief, talentIds: args.pool.members.map((member) => member.talentId) });
  args.pool.job = { key, scores: computed?.scores ?? {}, years: computed?.years ?? {} };
}

async function memberFacts(ids: string[]) {
  const sql = roleStartSql();
  const rows = await sql<
    Array<{
      talent_id: string;
      years: number | null;
      country_code: string | null;
      city: string | null;
      remote_ok: boolean | null;
      relocation_ok: boolean | null;
      relocation_countries: string[] | null;
    }>
  >`
    select t.id::text as talent_id, y.years::float8 as years, f.country_code, f.city, f.remote_ok, f.relocation_ok, f.relocation_countries
    from unnest(${ids}::uuid[]) as t(id)
    left join lateral (
      select extract(epoch from (now() - min(x.start_date)::timestamptz)) / 31557600.0 as years
      from public.talent_experiences x
      where x.talent_id = t.id and x.start_date is not null
    ) y on true
    left join public.talent_location_facets f on f.talent_id = t.id
  `;
  return new Map(
    rows.map((row) => [
      String(row.talent_id),
      {
        years: row.years === null ? null : Number(row.years),
        countryCode: row.country_code,
        city: row.city,
        remoteOk: row.remote_ok,
        relocationOk: row.relocation_ok,
        relocationCountries: row.relocation_countries ?? [],
      },
    ])
  );
}

/** Members passing the Brief's hard conditions, with in-pool removal counts. */
export function applyHardConditions(pool: RoleStartPool, brief: RoleStartBrief, excludeIds: string[] = []) {
  const exclude = new Set(excludeIds);
  const conditions = brief.hardConditions.filter((condition) => condition.kind !== "other");
  const job = pool.job && pool.job.key === jobScoreKey(brief) ? pool.job : null;
  // Years conditions read years in this Role's job when the job can be read.
  const members = pool.members
    .filter((member) => !exclude.has(member.talentId))
    .map((member): PoolMember => {
      if (!job) return member;
      const roleYears = job.years?.[member.talentId];
      return roleYears === undefined || roleYears === null
        ? { ...member, yearsBasis: "total" }
        : { ...member, years: roleYears, yearsBasis: "role" };
    });
  const onsite = onsiteRole(brief);
  const passing = members.filter((member) => conditions.every((condition) => passesCondition(member, condition, onsite)));
  return {
    members: passing,
    conditionCounts: conditions.map((condition) => ({
      id: condition.id,
      label: condition.label,
      removed:
        members.filter((member) =>
          conditions.every((other) => other === condition || passesCondition(member, other, onsite))
        ).length - passing.length,
    })),
  };
}

/**
 * Literal evidence for a criterion: one group per named tool/product, each
 * with its spellings. The rubric model writes the groups (Korean spellings and
 * aliases); older Briefs fall back to Latin-script names plus a small alias
 * table. Generic words are excluded so that "data" does not count as evidence.
 */
const GENERIC_TERMS = new Set([
  "and", "or", "the", "with", "for", "b2b", "b2c", "api", "data", "service", "team", "lead", "experience",
]);
const COMMON_ALIASES: Record<string, string[]> = {
  kafka: ["카프카"],
  airflow: ["에어플로우", "에어플로"],
  bigquery: ["빅쿼리", "bq", "gcp bigquery"],
  snowflake: ["스노우플레이크", "스노플레이크"],
  spark: ["스파크", "pyspark"],
  python: ["파이썬"],
  kubernetes: ["쿠버네티스", "k8s"],
  docker: ["도커"],
  redshift: ["레드시프트"],
  databricks: ["데이터브릭스"],
  terraform: ["테라폼"],
  react: ["리액트"],
  typescript: ["타입스크립트"],
  java: ["자바"],
  kotlin: ["코틀린"],
  golang: ["고랭"],
  postgresql: ["postgres", "포스트그레스"],
  elasticsearch: ["엘라스틱서치", "elastic"],
};
export function criterionTerms(criterion: OrgRoleCriterion & { evidenceTerms?: string[][] }): string[][] {
  // Two-letter spellings ("Go", "TS") would match unrelated words.
  if (criterion.evidenceTerms?.length) {
    return criterion.evidenceTerms
      .map((group) => group.filter((term) => term.trim().length >= 3 || /[가-힣]/.test(term)))
      .filter((group) => group.length)
      .slice(0, 8);
  }
  const text = `${criterion.name} ${criterion.criteria}`;
  const terms = text.match(/[A-Za-z][A-Za-z0-9+#.\-]{1,24}/g) ?? [];
  const names = Array.from(
    new Set(terms.map((term) => term.replace(/[.\-]+$/, "").toLowerCase()).filter((term) => term.length >= 3 && !GENERIC_TERMS.has(term)))
  ).slice(0, 8);
  return names.map((name) => [name, ...(COMMON_ALIASES[name] ?? [])]);
}


/** Most a literal tool mention can add to a criterion score (provisional until a job-match score lands). */
export const TERM_BONUS = 0.25;

/**
 * Fill per-criterion scores for the broad pool: whole criteria that are new
 * or changed, and, for unchanged criteria, only members without a score yet
 * (people added when the pool was rebuilt), ranked against the stored scores.
 */
export async function scoreCriteria(args: { pool: RoleStartPool; criteria: RoleStartCriterion[] }) {
  const started = Date.now();
  const ids = args.pool.members.map((member) => member.talentId);
  const missingIn = (criterion: RoleStartCriterion) => {
    const map = args.pool.scores[criterionHash(criterion)];
    return map ? ids.filter((id) => !map[id]) : ids;
  };
  const pending = args.criteria.filter((criterion) => missingIn(criterion).length > 0);
  const similarity = pending.filter((criterion) => (criterion.kind ?? "similarity") === "similarity");
  const whole = similarity.filter((criterion) => !args.pool.scores[criterionHash(criterion)]);
  const partial = similarity.filter((criterion) => args.pool.scores[criterionHash(criterion)]);
  let tokens = 0;
  if (whole.length && ids.length) tokens += await scoreSimilarity(args.pool, whole, ids);
  if (partial.length) {
    const missing = [...new Set(partial.flatMap(missingIn))];
    tokens += await scoreSimilarity(args.pool, partial, missing);
  }
  for (const criterion of pending) {
    if ((criterion.kind ?? "similarity") === "similarity") continue;
    const map: Record<string, CriterionScore> = { ...(args.pool.scores[criterionHash(criterion)] ?? {}) };
    for (const member of args.pool.members) {
      if (map[member.talentId]) continue;
      const rule = criterion.rule;
      if (criterion.kind === "rule" && rule && member.years !== null) {
        const tooFew = rule.minYears !== null && member.years < rule.minYears;
        const tooMany = rule.maxYears !== null && member.years > rule.maxYears;
        const gap = tooFew ? rule.minYears! - member.years : tooMany ? member.years - rule.maxYears! : 0;
        map[member.talentId] = {
          score: gap === 0 ? 0.9 : Math.max(0.1, 0.6 - gap * 0.12),
          raw: member.years,
          evidence: `경력 약 ${Math.floor(member.years)}년`,
        };
      } else {
        // Judgment criteria (and rules without data) are decided by the verdict step.
        map[member.talentId] = { score: 0.5, raw: 0, evidence: null };
      }
    }
    args.pool.scores[criterionHash(criterion)] = map;
  }
  return { ms: Date.now() - started, tokens, scored: pending.length };
}

/** Section similarity and tool mentions for these people; stored scores of others set the percentile scale. */
async function scoreSimilarity(pool: RoleStartPool, similarity: RoleStartCriterion[], ids: string[]) {
  const sql = roleStartSql();
  const embedded = await embedTexts(similarity.map(criterionQueryText));
  const literals = embedded.vectors.map(vectorLiteral);
  const rows = await sql<Array<{ talent_id: string; idx: number; distance: number; best_text: string | null }>>`
    with q as materialized (
      -- Parse each query vector once; an inline cast re-parsed it per row.
      select v.vec::vector as vec, v.idx from unnest(${literals}::text[]) with ordinality as v(vec, idx)
    )
    select c.talent_id::text as talent_id, q.idx::int as idx,
      min(c.embedding <=> q.vec) as distance,
      (array_agg(c.chunk_text order by c.embedding <=> q.vec))[1] as best_text
    from public.talent_profile_chunk_embeddings c
    cross join q
    where c.talent_id = any(${ids}::uuid[])
    group by c.talent_id, q.idx
  `;
  // Literal mentions per criterion, in one query over all sections.
  const termLists = similarity.map(criterionTerms);
  // A group counts once whichever spelling matched.
  const patterns = termLists.flatMap((groups, index) =>
    groups.flatMap((group, groupIndex) =>
      group.map((term) => ({ index: index + 1, group: groupIndex, pattern: termPattern(term) }))
    )
  );
  const hits = patterns.length
    ? await sql<Array<{ talent_id: string; idx: number; hits: number }>>`
        select c.talent_id::text as talent_id, p.idx::int as idx, count(distinct p.grp)::int as hits
        from public.talent_profile_chunk_embeddings c
        join unnest(${patterns.map((item) => item.index)}::int[], ${patterns.map((item) => item.group)}::int[],
          ${patterns.map((item) => item.pattern)}::text[]) as p(idx, grp, pattern)
          on lower(c.chunk_text) ~ p.pattern
        where c.talent_id = any(${ids}::uuid[])
        group by c.talent_id, p.idx
      `
    : [];
  const wanted = new Set(ids);
  similarity.forEach((criterion, index) => {
    const hash = criterionHash(criterion);
    const kept = Object.fromEntries(Object.entries(pool.scores[hash] ?? {}).filter(([id]) => !wanted.has(id)));
    const own = rows.filter((row) => Number(row.idx) === index + 1);
    // Rank percentile instead of a z-score: raw section similarity varies
    // little, and a logistic over it saturated most of the pool near 1.
    const ordered = [
      ...Object.values(kept).filter((score) => !score.unknown).map((score) => score.raw),
      ...own.map((row) => 1 - Number(row.distance)),
    ].sort((left, right) => left - right);
    const percentile = (raw: number) => {
      let low = 0;
      let high = ordered.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (ordered[mid]! < raw) low = mid + 1;
        else high = mid;
      }
      return ordered.length > 1 ? low / (ordered.length - 1) : 0.5;
    };
    const termCount = termLists[index]!.length;
    const hitMap = new Map(
      hits.filter((row) => Number(row.idx) === index + 1).map((row) => [String(row.talent_id), Number(row.hits)])
    );
    const map: Record<string, CriterionScore> = { ...kept };
    for (const row of own) {
      const raw = 1 - Number(row.distance);
      const similarityScore = percentile(raw);
      const lexical = termCount ? Math.min(1, (hitMap.get(String(row.talent_id)) ?? 0) / Math.min(termCount, 3)) : null;
      map[String(row.talent_id)] = {
        // Similarity decides; a named tool adds a capped bonus, so a profile
        // that describes the work without the tool name is not pushed down.
        score: lexical === null ? similarityScore : Math.min(1, similarityScore + TERM_BONUS * lexical),
        similarity: similarityScore,
        raw,
        evidence: row.best_text ? String(row.best_text).slice(0, 600) : null,
      };
    }
    for (const id of ids) {
      map[id] ??= { score: UNKNOWN_SCORE, raw: 0, evidence: null, unknown: true };
    }
    pool.scores[hash] = map;
  });
  return embedded.tokens;
}

export type RankedMember = PoolMember & {
  overall: number;
  perCriterion: Record<string, CriterionScore>;
  passesMust: boolean;
  /** Job-match score, null when unknown. */
  job?: number | null;
};

export const MUST_THRESHOLD = 0.3;
/** Share of the overall score taken by the job-match score. */
export const JOB_WEIGHT = 0.4;
/** Job-match score at or above which the person does this Role's job for the must check. */
export const JOB_MUST = 0.4;
/** Below this the person is clearly in another job and is not ranked. */
export const JOB_DROP = 0.1;
/** Used in the overall score when no recent experience can be read. */
export const JOB_UNKNOWN = 0.3;
/** People added to the broad pool by job-match score alone. */
export const ROLE_START_JOB_SUPPLEMENT = 300;

/** Hard conditions in memory, then the top ~300 by retrieval, ranked by criteria. */
export function rankPool(args: {
  pool: RoleStartPool;
  brief: RoleStartBrief;
  excludeIds?: string[];
  adjustments?: Map<string, number>;
}): { ranked: RankedMember[]; filteredCount: number; conditionCounts: RoleStartPool["conditionCounts"] } {
  const { members, conditionCounts } = applyHardConditions(args.pool, args.brief, args.excludeIds);
  const criteria: OrgRoleCriterion[] = args.brief.criteria;
  const job = args.pool.job && args.pool.job.key === jobScoreKey(args.brief) ? args.pool.job.scores : null;
  // Scores cover the whole broad pool, so every member passing the hard
  // conditions is ranked; people clearly in another job are left out.
  const ranked = members
    .filter((member) => {
      const value = job?.[member.talentId];
      return value === undefined || value === null || value >= JOB_DROP;
    })
    .map((member) => {
      let weighted = 0;
      let weights = 0;
      let criteriaPass = true;
      const perCriterion: Record<string, CriterionScore> = {};
      for (const criterion of criteria) {
        const score = args.pool.scores[criterionHash(criterion)]?.[member.talentId] ?? {
          score: UNKNOWN_SCORE,
          raw: 0,
          evidence: null,
          unknown: true,
        };
        perCriterion[criterion.id ?? criterion.name] = score;
        // Weight 1 / 2 / 3 by importance; only 필수 (required) also filters.
        const weight = weightOf(criterion);
        weighted += score.score * weight;
        weights += weight;
        // A named tool alone does not pass an excluding criterion, and judgment
        // criteria are left to the verdict.
        if (
          isRequired(criterion) &&
          criterion.kind !== "judgment" &&
          !score.unknown &&
          (score.similarity ?? score.score) < MUST_THRESHOLD
        ) {
          criteriaPass = false;
        }
      }
      const criteriaScore = weights ? weighted / weights : 0.5;
      const jobScore = job ? job[member.talentId] ?? null : undefined;
      const jobPass = jobScore === undefined || jobScore === null || jobScore >= JOB_MUST;
      const overall =
        (jobScore === undefined
          ? criteriaScore * 0.9
          : JOB_WEIGHT * (jobScore ?? JOB_UNKNOWN) + (0.9 - JOB_WEIGHT) * criteriaScore) +
        member.retrieval * 0.1 +
        (args.adjustments?.get(member.talentId) ?? 0);
      return { ...member, overall, perCriterion, passesMust: criteriaPass && jobPass, job: jobScore ?? null };
    })
    .sort((left, right) => right.overall - left.overall);
  return { ranked, filteredCount: members.length, conditionCounts };
}

export type PickedCandidate = RankedMember & {
  probe: RoleStartProbe | null;
};

export const MAX_INFO_CANDIDATES = 1;

/** Best fits plus at most one info candidate that settles an open criterion. */
export function pickFirstThree(args: {
  ranked: RankedMember[];
  probes: RoleStartProbe[];
  criteria: OrgRoleCriterion[];
}): PickedCandidate[] {
  const passing = args.ranked.filter((member) => member.passesMust);
  const picked: PickedCandidate[] = [];
  const used = new Set<string>();
  // At most one of the three settles an open point; the rest are the best fits.
  const probeCount = Math.min(MAX_INFO_CANDIDATES, args.probes.length, Math.max(0, passing.length - 1));
  const probes: PickedCandidate[] = [];
  for (const probe of args.probes) {
    if (probes.length >= probeCount) break;
    // Info candidates also pass every required criterion; only the open point is weak.
    const match = passing.find((member) => {
      if (used.has(member.talentId)) return false;
      if (probe.type === "years_above") return member.years !== null && member.years > (probe.years ?? 0);
      if (probe.type === "years_below") return member.years !== null && member.years < (probe.years ?? 0);
      const target = args.criteria.find(
        (criterion) => criterion.id === probe.criterionId || criterion.name === probe.criterionId
      );
      if (!target) return false;
      const own = member.perCriterion[target.id ?? target.name]?.score ?? 0.5;
      const others = args.criteria
        .filter((criterion) => criterion !== target && isRequired(criterion))
        .every((criterion) => (member.perCriterion[criterion.id ?? criterion.name]?.score ?? 0.5) >= 0.5);
      return own < 0.35 && others;
    });
    if (match) {
      used.add(match.talentId);
      probes.push({ ...match, probe });
    }
  }
  for (const member of passing) {
    if (picked.length + probes.length >= 3) break;
    if (used.has(member.talentId)) continue;
    used.add(member.talentId);
    picked.push({ ...member, probe: null });
  }
  return [...picked, ...probes];
}
