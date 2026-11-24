import "server-only";

import { randomUUID } from "node:crypto";
import { eligibilitySql } from "@/lib/externalRecommendationsV2/roleSql";
import { gtmRead } from "../db.server";
import { readDemandSummary, summarizeDemand, type DemandPosting, type DemandSummary } from "./demand";
import { MAX_POSTING_AGE_DAYS } from "./match";
import { internalRoles } from "./match.server";
import { readRunDemand, writeRunDemand } from "./store.server";

/**
 * #5 사람 찾기: what Harper can propose today (demand.ts), from the posting matcher's own pools (match.server.ts):
 *   - the open customer Roles it scores (internalRoles: the same query, a Role without a description left out);
 *   - the public postings its search can return: Career's eligibility (roleSql.ts eligibilitySql: external, open, not
 *     expired, not a member's own copy, from workspaces with public postings on), posted within the matcher's 180
 *     days, with the title vector the search reads. Same-titled postings are counted together (title, level, country,
 *     work mode), with the companies posting them.
 * Read once per run and kept on it (gtm_agent_runs.signal_log.demand): a day's run reads it on its first search of the
 * Korea-time day and its later searches reuse it.
 */

/** Same-titled public posting groups read at most (the most posted first); the rest is a long tail of one-offs. */
const PUBLIC_GROUPS = 20_000;

type PublicGroup = {
  name: string; seniority_level: string | null; country_code: string | null; work_mode: string | null; location_text: string | null;
  n: number; companies: string[];
};

async function publicDemand(): Promise<{ postings: DemandPosting[]; companyTexts: Map<string, string> }> {
  // Career's own eligibility (no member: previously recommended postings are not left out).
  const where = eligibilitySql({ userId: randomUUID(), blockedCompanies: [], includePreviouslyRecommended: true });
  return gtmRead(async (sql) => {
    const groups = await sql.unsafe<PublicGroup[]>(`
      SELECT cr.name, cr.seniority_level, cr.country_code, cr.work_mode, min(cr.location_text) AS location_text,
        count(*)::int AS n, array_agg(DISTINCT cr.company_workspace_id::text) AS companies
      FROM public.company_roles cr
      JOIN public.company_workspace cw ON cw.company_workspace_id = cr.company_workspace_id
      WHERE ${where}
        AND cr.posted_at >= now() - (${MAX_POSTING_AGE_DAYS} * INTERVAL '1 day')
        AND cr.title_embedding IS NOT NULL
      GROUP BY 1, 2, 3, 4
      ORDER BY n DESC, 1
      LIMIT ${PUBLIC_GROUPS}
    `);
    const ids = [...new Set(groups.flatMap((group) => group.companies))];
    const texts = ids.length ? await sql<Array<{ id: string; text: string }>>`
      select w.company_workspace_id::text as id,
        left(coalesce(nullif(btrim(cd.short_description), ''), nullif(btrim(w.company_description), ''), ''), 200) as text
      from public.company_workspace w left join public.company_db cd on cd.id = w.company_db_id
      where w.company_workspace_id = any(${ids}::uuid[])
    ` : [];
    return {
      postings: groups.map((group) => ({
        kind: "external" as const, title: group.name, count: group.n, companies: group.companies, seniorityLevel: group.seniority_level,
        countryCode: group.country_code, workMode: group.work_mode, locationText: group.location_text,
      })),
      companyTexts: new Map(texts.filter((row) => row.text).map((row) => [row.id, row.text])),
    };
  });
}

/** Harper's open postings, as the matcher can propose them, summarized for one Korea-time day. */
export async function readDemand(day: string): Promise<DemandSummary> {
  const [internal, external] = await Promise.all([internalRoles(), publicDemand()]);
  const companyTexts = new Map(external.companyTexts);
  const postings: DemandPosting[] = internal.map((item) => {
    const company = item.row.company_workspace_id ?? item.meta.roleId ?? item.title;
    // A customer's line and the start of its Role (names the business more often than the title).
    companyTexts.set(company, `${item.row.company_description ?? ""} ${String(item.row.description ?? "").slice(0, 200)}`);
    return {
      kind: "customer", title: item.title, companies: [company],
      seniorityLevel: item.row.seniority_level ?? null, countryCode: null, workMode: item.row.work_mode ?? null,
      locationText: item.row.location_text ?? null,
    };
  });
  return summarizeDemand([...postings, ...external.postings], day, companyTexts);
}

/**
 * The run's demand for `day`: the one it keeps when it was read that day, else read now and kept. A failed read gives
 * null (the search then runs without it, as before).
 */
export async function runDemand(runId: string, day: string): Promise<DemandSummary | null> {
  try {
    const kept = readDemandSummary(await readRunDemand(runId));
    if (kept && kept.day === day) return kept;
    const demand = await readDemand(day);
    await writeRunDemand(runId, demand).catch((error) => {
      console.warn("[gtm-agent] demand write", error instanceof Error ? error.message : String(error));
    });
    return demand;
  } catch (error) {
    console.warn("[gtm-agent] demand", error instanceof Error ? error.message : String(error));
    return null;
  }
}
