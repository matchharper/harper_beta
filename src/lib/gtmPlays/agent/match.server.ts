import "server-only";

import { randomUUID } from "node:crypto";
import { buildFilterFirstRoleSql } from "@/lib/externalRecommendationsV2/filterFirstSql";
import { embedSearchTitles } from "@/lib/externalRecommendationsV2/retrieval";
import { directUsageCost } from "@/lib/externalRecommendationsV2/usage";
import { createCompanyRunUsage } from "@/lib/llm/runUsage";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { flattenRpcRows } from "@/lib/talentOnboarding/jobPostingRecommendations";
import { GTM_ROLE_PURPOSE, GTM_WORKSPACE_ID, HARPER_WORKSPACE_ID } from "../constants";
import { gtmRead } from "../db.server";
import { gtmStructuredCall } from "../llm.server";
import { cleanPublicDescription, gtmCandidateCompanyLabel, withoutCompanyName } from "../shared";
import {
  PICK_SCHEMA, PLANNER_SCHEMA, candidateId, detectLanguage, gtmRoleTitle, isExcludedCompany, pickPrompt, plannerPrompt,
  postingsFromPick, rankInternalRoles, searchPlanFrom, type CandidatePosting, type PickOutput, type PlannerOutput,
} from "./match";
import type { AgentPersonInput, AgentPosting } from "./types";

/** Public postings read from the shared search, and how many of them the picker sees. */
const SEARCH_ROWS = 60;
const PUBLIC_SHOWN = 30;
const INTERNAL_SHOWN = 15;

type PublicRow = { role_id?: string; role_name?: string; company_name?: string | null; external_jd_url?: string | null; location_text?: string | null };

/** The shared posting search (filter-first + title vector) for one plan, without any talent row. */
async function searchPublicPostings(plan: ReturnType<typeof searchPlanFrom>, excluded: string[], onEmbeddingCost: (usd: number) => void): Promise<PublicRow[]> {
  const [vector] = await embedSearchTitles(plan.roleTitles, undefined, (usage) => onEmbeddingCost(directUsageCost("embeddings", usage).usd ?? 0));
  const sql = buildFilterFirstRoleSql({
    plan,
    vector,
    // Only used to leave out postings already recommended to a member; nobody has this id.
    userId: randomUUID(),
    blockedCompanies: excluded.map((name) => name.trim().slice(0, 100)).filter(Boolean).slice(0, 20),
    candidateLimit: 500,
    listOnly: true,
    diagnostics: true,
    salaryWeight: 0,
    limit: SEARCH_ROWS,
  });
  const { data, error } = await getSupabaseAdmin().rpc("search_external_roles_filter_first" as never, { p_sql: sql } as never);
  if (error) throw new Error(error.message);
  const payload = flattenRpcRows(data)[0] as { rows?: PublicRow[] } | undefined;
  return Array.isArray(payload?.rows) ? payload.rows : [];
}

/** A short text of each public posting for the picker (the list search returns titles only). */
async function postingSnippets(roleIds: string[]): Promise<Map<string, string>> {
  if (!roleIds.length) return new Map();
  const rows = await gtmRead((sql) => sql<Array<{ role_id: string; text: string | null }>>`
    select role_id::text as role_id, left(regexp_replace(coalesce(description, ''), '\\s+', ' ', 'g'), 600) as text
    from public.company_roles where role_id = any(${roleIds}::uuid[])
  `);
  return new Map(rows.map((row) => [row.role_id, row.text ?? ""]));
}

type InternalRow = {
  role_id: string; kind: "customer" | "gtm"; name: string; company_name: string; location: string | null;
  snippet: string | null; public_description: string | null; gtm_company: string | null;
};

/**
 * Open Roles a mail can propose besides public postings: customers' own Roles (as #4 ③, the customer's name) and
 * saved GTM Roles (as #4 ②, "Harper 고객사(<설명>)" and the Role's candidate name; never the real company).
 */
async function internalRoles(): Promise<Array<Omit<CandidatePosting, "id">>> {
  const rows = await gtmRead((sql) => sql<InternalRow[]>`
    select r.role_id::text as role_id,
      case when w.company_workspace_id = ${GTM_WORKSPACE_ID}::uuid then 'gtm' else 'customer' end as kind,
      r.name, case when w.company_workspace_id = ${GTM_WORKSPACE_ID}::uuid then w.company_name
        else coalesce(nullif(btrim(w.published_name), ''), w.company_name) end as company_name,
      r.location_text as location,
      -- A GTM Role's text: its description only (its search request names the real company).
      left(regexp_replace(case when w.company_workspace_id = ${GTM_WORKSPACE_ID}::uuid then coalesce(r.description, '')
        else coalesce(nullif(btrim(i.request), ''), r.description, '') end, '\\s+', ' ', 'g'), 600) as snippet,
      r.information->'gtm'->>'publicDescription' as public_description,
      r.information->'gtm'->>'companyName' as gtm_company
    from public.company_roles r
    join public.company_workspace w on w.company_workspace_id = r.company_workspace_id
    left join public.company_internal_roles i on i.role_id = r.role_id
    where r.source_type = 'internal' and r.status in ('active', 'top_priority')
      and (
        (w.is_internal is true and w.company_workspace_id <> all(array[${HARPER_WORKSPACE_ID}, ${GTM_WORKSPACE_ID}]::uuid[])
          and coalesce(lower(btrim(r.information->>'testOnly')), '') not in ('true', '1', 'yes', 'on'))
        or (w.company_workspace_id = ${GTM_WORKSPACE_ID}::uuid and r.information->>'purpose' = ${GTM_ROLE_PURPOSE})
      )
    order by r.updated_at desc nulls last
    limit 400
  `);
  return rows.flatMap((row): Array<Omit<CandidatePosting, "id">> => {
    if (row.kind === "customer") {
      return [{ kind: "customer", roleId: row.role_id, url: null, companyName: row.company_name, title: row.name, location: row.location, snippet: row.snippet ?? "" }];
    }
    // A GTM Role made before candidates read "Harper 고객사(<설명>)" has no description to stand for its company:
    // it is never proposed (its name and text carry the real company).
    const description = cleanPublicDescription(row.public_description);
    if (!description) return [];
    const hide = (text: string) => withoutCompanyName(text, row.gtm_company, description);
    return [{
      kind: "gtm", roleId: row.role_id, url: null,
      companyName: gtmCandidateCompanyLabel(row.company_name, description),
      title: hide(gtmRoleTitle(row.name, description)), location: row.location, snippet: hide(row.snippet ?? ""),
      hide: row.gtm_company?.trim() ? { name: row.gtm_company.trim(), replacement: description } : undefined,
    }];
  });
}

export type AgentMatch = {
  postings: AgentPosting[];
  language: "ko" | "en";
  notJobSeeking: boolean;
  reason: string;
  costUsd: number;
};

/**
 * One outside person → 2-3 fitting postings: a planner call (search plan, language, whether they are looking at all),
 * the shared public posting search plus open customer and GTM Roles, then a picker call. Never a posting at their
 * current company (or `excludeCompanyNames`). Fewer than 2 fits → no postings (the caller records no_fit).
 */
export async function matchAgentPostings(person: AgentPersonInput, opts: { excludeCompanyNames?: string[] } = {}): Promise<AgentMatch> {
  const totals = createCompanyRunUsage();
  let embeddingUsd = 0;
  const excluded = [person.currentCompany, ...(opts.excludeCompanyNames ?? [])].filter((name): name is string => Boolean(name?.trim()));
  const textLanguage = detectLanguage([person.signalText, person.profileText, person.headline], "ko");
  const result = await withLlmUsageContext(
    { requestId: randomUUID(), careerOrigin: "server", careerCapability: { name: "gtm_agent", step: "match" }, companyRunUsage: totals },
    async (): Promise<Omit<AgentMatch, "costUsd">> => {
      const prompt = plannerPrompt(person);
      const planned = await gtmStructuredCall<PlannerOutput>({
        label: "gtm-agent:plan", schemaName: "gtm_agent_plan", schema: PLANNER_SCHEMA as unknown as Record<string, unknown>,
        system: prompt.system, user: prompt.user, maxTokens: 1_200,
      });
      const hasText = Boolean(person.signalText || person.profileText || person.headline);
      const language = hasText ? textLanguage : planned.language === "en" ? "en" : "ko";
      if (planned.jobSeeking === false) {
        return { postings: [], language, notJobSeeking: true, reason: String(planned.jobSeekingReason ?? "").slice(0, 300) };
      }
      const plan = searchPlanFrom(planned);
      const [publicRows, internal] = await Promise.all([
        searchPublicPostings(plan, excluded, (usd) => { embeddingUsd += usd; }).catch((error) => {
          console.warn("[gtm-agent:match] public search", error instanceof Error ? error.message : String(error));
          return [] as PublicRow[];
        }),
        internalRoles(),
      ]);
      const publicPicked = publicRows
        .filter((row): row is PublicRow & { role_id: string; role_name: string } => Boolean(row.role_id && row.role_name))
        .filter((row) => !isExcludedCompany(row.company_name ?? "", excluded))
        .slice(0, PUBLIC_SHOWN);
      const snippets = await postingSnippets(publicPicked.map((row) => row.role_id));
      const candidates: CandidatePosting[] = [
        ...publicPicked.map((row, index) => ({
          id: candidateId("external", index), kind: "external" as const, roleId: row.role_id, url: row.external_jd_url ?? null,
          companyName: row.company_name?.trim() || "—", title: row.role_name, location: row.location_text ?? null,
          snippet: snippets.get(row.role_id) ?? "",
        })),
        ...rankInternalRoles(internal.filter((role) => !isExcludedCompany(role.companyName, excluded)), plan, INTERNAL_SHOWN)
          .map((role, index) => ({ ...role, id: candidateId(role.kind, index) })),
      ];
      if (candidates.length < 2) {
        return { postings: [], language, notJobSeeking: false, reason: "맞는 공고 후보가 2개보다 적어요" };
      }
      const pickText = pickPrompt(person, candidates, language);
      const pick = await gtmStructuredCall<PickOutput>({
        label: "gtm-agent:pick", schemaName: "gtm_agent_pick", schema: PICK_SCHEMA as unknown as Record<string, unknown>,
        system: pickText.system, user: pickText.user, maxTokens: 1_500,
      });
      const postings = postingsFromPick(pick, candidates, excluded);
      return { postings, language, notJobSeeking: false, reason: String(pick.reason ?? "").slice(0, 300) };
    },
  );
  return { ...result, costUsd: Number((totals.costUsd + embeddingUsd).toFixed(6)) };
}
