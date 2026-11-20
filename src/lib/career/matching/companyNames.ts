import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

export type ResolvedCompanyName = {
  query: string;
  matches: { companyWorkspaceId: string; name: string }[];
  /** No directory company has exactly this name; the matches only contain it. */
  partial: boolean;
  /** The name belongs to a Harper-connected company, which this search does not cover. */
  excluded?: boolean;
};

const PARTIAL_MATCH_LIMIT = 3;
const comparable = (value: string) => value.toLowerCase().replace(/[\s.,()·&_-]+/g, "");

/** Map the employers an agent names to directory companies, preferring exact names over substring matches. */
export async function resolveCompanyNames(admin: TalentAdminClient, names: string[]): Promise<ResolvedCompanyName[]> {
  const { searchCareerCompanies } = await import("../companies/server");
  const queries = [...new Set(names.map(name => name.trim()).filter(Boolean))];
  const found = await Promise.all(queries.map(async query => ({
    query,
    companies: (await searchCareerCompanies({ admin, queries: [query] })).companies
      .filter(company => typeof company.companyWorkspaceId === "string"),
  })));
  const internal = await internalWorkspaceIds(admin, found.flatMap(item => item.companies.map(company => company.companyWorkspaceId as string)));
  return found.map(({ query, companies }) => {
    const known = companies.filter(company => !internal.has(company.companyWorkspaceId as string));
    const exact = known.filter(company => company.name && comparable(company.name) === comparable(query));
    const chosen = exact.length ? exact : known.slice(0, PARTIAL_MATCH_LIMIT);
    const excludedExact = !exact.length && companies.some(company => internal.has(company.companyWorkspaceId as string)
      && company.name && comparable(company.name) === comparable(query));
    return {
      query,
      matches: excludedExact ? [] : chosen.map(company => ({ companyWorkspaceId: company.companyWorkspaceId as string, name: company.name ?? query })),
      partial: !excludedExact && !exact.length && chosen.length > 0,
      ...(excludedExact ? { excluded: true } : {}),
    };
  });
}

async function internalWorkspaceIds(admin: TalentAdminClient, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Set<string>();
  const { data, error } = await (admin.from("company_workspace" as never) as any)
    .select("company_workspace_id").in("company_workspace_id", unique).eq("is_internal", true);
  if (error) throw new Error(error.message);
  return new Set<string>((data ?? []).map((row: { company_workspace_id: string }) => row.company_workspace_id));
}

/** Count the retrieved roles per named company so the agent sees which employers had nothing indexed. */
export async function countRolesByCompany(admin: TalentAdminClient, roleIds: unknown, companyWorkspaceIds: string[]) {
  const ids = Array.isArray(roleIds) ? roleIds.filter((id): id is string => typeof id === "string") : [];
  const counts = new Map(companyWorkspaceIds.map(id => [id, 0]));
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await (admin.from("company_roles" as never) as any)
      .select("company_workspace_id").in("role_id", ids.slice(i, i + 500));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) if (counts.has(row.company_workspace_id)) counts.set(row.company_workspace_id, counts.get(row.company_workspace_id)! + 1);
  }
  return counts;
}

/** The fit of each named company evaluated as an opportunity in itself during this search. */
export async function readCompanyOpportunityFit(admin: TalentAdminClient, runId: unknown, companyWorkspaceIds: string[]) {
  const fits = new Map<string, { mutualFit?: number; candidateInterest?: number }>();
  if (typeof runId !== "string" || !companyWorkspaceIds.length) return fits;
  const { data: run } = await (admin.from("external_recommendation_runs" as never) as any).select("evaluation_ids").eq("id", runId).maybeSingle();
  const ids = Array.isArray(run?.evaluation_ids) ? run.evaluation_ids : [];
  if (!ids.length) return fits;
  const { data } = await (admin.from("talent_external_evaluations" as never) as any)
    .select("company_workspace_id,assessment").in("id", ids).in("company_workspace_id", companyWorkspaceIds);
  for (const row of data ?? []) fits.set(row.company_workspace_id, {
    mutualFit: row.assessment?.fit?.mutualFit, candidateInterest: row.assessment?.fit?.candidateInterest,
  });
  return fits;
}

export function formatCompanyNameSearch(resolved: ResolvedCompanyName[], counts?: Map<string, number>,
  fits?: Map<string, { mutualFit?: number; candidateInterest?: number }>) {
  const score = (value?: number) => typeof value === "number" ? Math.round(value) : "?";
  const parts = resolved.map(item => {
    if (item.excluded) return `${item.query}: not covered by this search`;
    if (!item.matches.length) return `${item.query}: not in Harper's company directory`;
    const matches = item.matches.map(match => {
      const fit = fits?.get(match.companyWorkspaceId);
      return `${match.name}${counts ? ` (${counts.get(match.companyWorkspaceId) ?? 0} matching roles retrieved` : ""}${fit ? `${counts ? "; " : " ("}as a company opportunity itself: mutualFit ${score(fit.mutualFit)}, candidateInterest ${score(fit.candidateInterest)}, companyWorkspaceId ${match.companyWorkspaceId}` : ""}${counts || fit ? ")" : ""}`;
    });
    return `${item.query} → ${item.partial ? "no exact name; partial matches " : ""}${matches.join(", ")}`;
  });
  return `Named companies: ${parts.join("; ")}. A company with no indexed matching role may still be hiring; its official careers page is the place to check.`;
}
