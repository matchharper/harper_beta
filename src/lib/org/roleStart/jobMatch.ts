import "server-only";

import { stableHash, type RoleStartBrief } from "./brief";
import { roleStartSql } from "./db";
import { isBroadTitle, isInternship, normalizeTitle } from "./jobTitles";
import { embedTexts, vectorLiteral } from "./llm";

/**
 * Job-match score: does this person do this Role's job? Each recent
 * experience is read from its title against the Brief's matching titles and
 * near-miss titles; a title that names no specific job (rank, generic
 * function, team) is read from that experience's description instead.
 *
 * Title vectors come from one function (titleVectors) and one table keyed by
 * model, so a title model trained for job titles can replace this one by
 * filling the same table under a new model key.
 */

export const JOB_TITLE_MODEL = "text-embedding-3-large";
export const JOB_TITLE_DIMENSIONS = 1024;
const MODEL_KEY = `${JOB_TITLE_MODEL}@${JOB_TITLE_DIMENSIONS}`;

/** Only experiences that ended within this window count. */
const RECENT_YEARS = 7;
const INTERN_WEIGHT = 0.3;
const CURRENT_WEIGHT = 1.5;
/** Title cosine → 0..1 (text-embedding-3-large, 1024 dims), set from the local title set. */
const TITLE_LOW = 0.5;
const TITLE_HIGH = 0.72;
/** Description cosine (section vectors, text-embedding-3-small) → 0..1. Provisional. */
const DESCRIPTION_LOW = 0.3;
const DESCRIPTION_HIGH = 0.55;
/** An experience at or above this reads as this Role's job when counting years in the job. */
const ROLE_EXPERIENCE_MIN = 0.5;
/** Same, for a broad title read from its description (description similarity runs lower than title similarity). */
const ROLE_EXPERIENCE_MIN_DESCRIPTION = 0.35;
/** An experience whose title is closer to a near-miss title is an adjacent job, scored at most this. */
const ADJACENT_CAP = 0.3;

const SQL_TITLE = `left(lower(regexp_replace(btrim(coalesce(e.role, '')), '\\s+', ' ', 'g')), 200)`;

function scale(value: number | null | undefined, low: number, high: number) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, (value - low) / (high - low)));
}

/** Add vectors for titles not yet in the table (all people, or the given ones). */
export async function ensureTitleDictionary(talentIds?: string[]) {
  const sql = roleStartSql();
  const rows = await sql<Array<{ title: string }>>`
    select distinct ${sql.unsafe(SQL_TITLE)} as title
    from public.talent_experiences e
    where coalesce(btrim(e.role), '') <> ''
      ${talentIds ? sql`and e.talent_id = any(${talentIds}::uuid[])` : sql``}
      and not exists (
        select 1 from public.job_title_embeddings j
        where j.title = ${sql.unsafe(SQL_TITLE)} and j.model = ${MODEL_KEY}
      )
  `;
  const titles = rows.map((row) => row.title).filter(Boolean);
  let tokens = 0;
  for (let index = 0; index < titles.length; index += 1_000) {
    const batch = titles.slice(index, index + 1_000);
    const embedded = await embedTexts(batch, { model: JOB_TITLE_MODEL, dimensions: JOB_TITLE_DIMENSIONS });
    tokens += embedded.tokens;
    await insertTitles(batch, embedded.vectors);
  }
  return { added: titles.length, tokens };
}

async function insertTitles(titles: string[], vectors: number[][]) {
  const sql = roleStartSql();
  if (!titles.length) return;
  await sql`
    insert into public.job_title_embeddings (title, model, embedding, fingerprint)
    select t.title, ${MODEL_KEY}, t.vec::vector, md5(t.title || ${MODEL_KEY})
    from unnest(${titles}::text[], ${vectors.map(vectorLiteral)}::text[]) as t(title, vec)
    on conflict (title, model) do nothing
  `;
}

/** The one place a title becomes a vector. */
export async function titleVectors(titles: string[]) {
  const sql = roleStartSql();
  const wanted = [...new Set(titles.map(normalizeTitle).filter(Boolean))];
  const found = wanted.length
    ? await sql<Array<{ title: string; embedding: string }>>`
        select title, embedding::text as embedding from public.job_title_embeddings
        where model = ${MODEL_KEY} and title = any(${wanted}::text[])
      `
    : [];
  const vectors = new Map(found.map((row) => [row.title, JSON.parse(row.embedding) as number[]]));
  const missing = wanted.filter((title) => !vectors.has(title));
  if (missing.length) {
    const embedded = await embedTexts(missing, { model: JOB_TITLE_MODEL, dimensions: JOB_TITLE_DIMENSIONS });
    await insertTitles(missing, embedded.vectors);
    missing.forEach((title, index) => vectors.set(title, embedded.vectors[index]!));
  }
  return vectors;
}

export function jobScoreKey(brief: RoleStartBrief) {
  return stableHash({
    model: MODEL_KEY,
    version: "job-v1",
    matching: brief.titles?.matching ?? [],
    nearMiss: brief.titles?.nearMiss ?? [],
  });
}

/**
 * talentId → 0..1 job-match score from recent experiences (null when none can
 * be read: no titles in the window, or only broad titles without
 * descriptions), and years spent in this Role's job across the whole career
 * (null when no experience can be read; overlapping periods count once).
 * Returns null when the Brief has no matching titles yet.
 */
export async function computeJobScores(args: { brief: RoleStartBrief; talentIds: string[]; explain?: boolean }) {
  const matching = args.brief.titles?.matching ?? [];
  if (!matching.length || !args.talentIds.length) return null;
  const nearMiss = args.brief.titles?.nearMiss ?? [];
  await ensureTitleDictionary(args.talentIds);
  const vectors = await titleVectors([...matching, ...nearMiss]);
  const queries = [
    ...matching.map((title) => ({ title, kind: 0 })),
    ...nearMiss.map((title) => ({ title, kind: 1 })),
  ].flatMap((item) => {
    const vector = vectors.get(normalizeTitle(item.title));
    return vector ? [{ vec: vectorLiteral(vector), kind: item.kind }] : [];
  });
  const sql = roleStartSql();
  // Recent experiences, then title similarity once per distinct title (two
  // small queries; joined in one statement the planner scanned far more).
  const experiences = await sql<
    Array<{
      id: string;
      talent_id: string;
      title: string;
      employment_type: string | null;
      start_date: string | null;
      end_date: string | null;
      months: number | null;
    }>
  >`
    select e.id::text as id, e.talent_id::text as talent_id, ${sql.unsafe(SQL_TITLE)} as title, e.employment_type,
      e.start_date::text as start_date, e.end_date::text as end_date, e.months
    from public.talent_experiences e
    where e.talent_id = any(${args.talentIds}::uuid[])
  `;
  const distinctTitles = [...new Set(experiences.map((row) => row.title).filter(Boolean))];
  const maxSimilarity = async (kind: number) => {
    const vecs = queries.filter((item) => item.kind === kind).map((item) => item.vec);
    if (!distinctTitles.length || !vecs.length) return new Map<string, number>();
    const found = await sql<Array<{ title: string; sim: number }>>`
      with q as materialized (select v::vector(1024) as vec from unnest(${vecs}::text[]) as v)
      select j.title, max(1 - (j.embedding <=> q.vec))::float8 as sim
      from (select unnest(${distinctTitles}::text[]) as title) t
      join public.job_title_embeddings j on j.title = t.title and j.model = ${MODEL_KEY}
      cross join q
      group by j.title
    `;
    return new Map(found.map((row) => [row.title, Number(row.sim)]));
  };
  const [matchOf, nearOf] = await Promise.all([maxSimilarity(0), maxSimilarity(1)]);
  const similarities = distinctTitles.map((title) => ({
    title,
    match: matchOf.get(title) ?? null,
    near: nearOf.get(title) ?? null,
  }));
  const similarityOf = new Map(similarities.map((row) => [row.title, row]));
  const rows = experiences.map((row) => ({
    ...row,
    match: similarityOf.get(row.title)?.match ?? null,
    near: similarityOf.get(row.title)?.near ?? null,
  }));
  // Descriptions are read only where the title names no specific job.
  const broadIds = rows.filter((row) => isBroadTitle(row.title) || row.match === null).map((row) => row.id);
  let descriptionOf = new Map<string, { desc_sim: number | null; has_desc: boolean }>();
  if (broadIds.length) {
    const summary = await embedTexts([
      [args.brief.summary, `직무: ${matching.slice(0, 4).join(", ")}`].filter(Boolean).join("\n"),
    ]);
    const described = await sql<Array<{ id: string; desc_sim: number | null; has_desc: boolean }>>`
      select e.id::text as id,
        max(1 - (c.embedding <=> ${vectorLiteral(summary.vectors[0] ?? [])}::vector))::float8 as desc_sim,
        bool_or(length(c.chunk_text) - length(split_part(c.chunk_text, E'\\n', 1)) > 30) as has_desc
      from public.talent_experiences e
      join public.talent_profile_chunk_embeddings c
        on c.talent_id = e.talent_id and c.chunk_key like 'experience:%'
        and position(coalesce(e.role, '') in split_part(c.chunk_text, E'\\n', 1)) > 0
        and (e.start_date is null or position(e.start_date::text in split_part(c.chunk_text, E'\\n', 1)) > 0)
      where e.id = any(${broadIds}::bigint[])
      group by e.id
    `;
    descriptionOf = new Map(described.map((row) => [row.id, row]));
  }
  const windowStart = Date.now() - RECENT_YEARS * 365.25 * 86_400_000;
  const totals = new Map<string, { weighted: number; weight: number }>();
  const relevant = new Map<string, Array<[number, number]>>();
  const readable = new Set<string>();
  const undated = new Set<string>();
  const explained: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    let score: number | null;
    if (isBroadTitle(row.title) || row.match === null) {
      const description = descriptionOf.get(row.id);
      score = description?.has_desc ? scale(description.desc_sim, DESCRIPTION_LOW, DESCRIPTION_HIGH) : null;
    } else {
      score = scale(row.match, TITLE_LOW, TITLE_HIGH);
      if (score !== null && row.near !== null && row.near > row.match) score = Math.min(score, ADJACENT_CAP);
    }
    if (args.explain) {
      explained.push({ talentId: row.talent_id, title: row.title, start: row.start_date, end: row.end_date, score, broad: isBroadTitle(row.title), type: row.employment_type });
    }
    if (score === null) continue;
    readable.add(row.talent_id);
    const end = row.end_date ? Date.parse(row.end_date) : Date.now();
    const begin = row.start_date ? Date.parse(row.start_date) : null;
    // Years in this Role's job: periods of experiences that read as the job.
    const fromDescription = isBroadTitle(row.title) || row.match === null;
    if (score >= (fromDescription ? ROLE_EXPERIENCE_MIN_DESCRIPTION : ROLE_EXPERIENCE_MIN)) {
      if (begin !== null && end > begin) {
        relevant.set(row.talent_id, [...(relevant.get(row.talent_id) ?? []), [begin, end]]);
      } else {
        // The job is there but its period is not: years cannot be counted.
        undated.add(row.talent_id);
      }
    }
    if (end < windowStart) continue;
    const start = begin !== null ? Math.max(begin, windowStart) : null;
    const months = start !== null ? Math.max(1, (end - start) / (30.44 * 86_400_000)) : Math.max(1, row.months ?? 12);
    const weight =
      months * (isInternship(row.title, row.employment_type) ? INTERN_WEIGHT : 1) * (row.end_date ? 1 : CURRENT_WEIGHT);
    const total = totals.get(row.talent_id) ?? { weighted: 0, weight: 0 };
    total.weighted += score * weight;
    total.weight += weight;
    totals.set(row.talent_id, total);
  }
  const scores: Record<string, number | null> = {};
  const years: Record<string, number | null> = {};
  for (const id of args.talentIds) {
    const total = totals.get(id);
    scores[id] = total && total.weight ? Math.round((total.weighted / total.weight) * 1000) / 1000 : null;
    const periods = relevant.get(id) ?? [];
    // Unknown (total years apply) when nothing can be read, or the job's only periods are undated.
    years[id] = readable.has(id) && !(undated.has(id) && !periods.length) ? Math.round(unionYears(periods) * 10) / 10 : null;
  }
  return { scores, years, ...(args.explain ? { explained } : {}) };
}

/** Total length of possibly overlapping periods, counting overlaps once. */
export function unionYears(periods: Array<[number, number]>) {
  const sorted = [...periods].sort((left, right) => left[0] - right[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const [start, end] of sorted) {
    if (!current || start > current[1]) {
      if (current) total += current[1] - current[0];
      current = [start, end];
    } else {
      current[1] = Math.max(current[1], end);
    }
  }
  if (current) total += current[1] - current[0];
  return total / (365.25 * 86_400_000);
}
