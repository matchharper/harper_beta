import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { annualSalaryKrw } from "@/lib/externalRecommendationsV2/salary";

type Owner = { admin: TalentAdminClient; userId: string };
type Row = Record<string, any>;

const won = (value: number) => value >= 100_000_000
  ? `${(value / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}억 원`
  : `${Math.round(value / 10_000).toLocaleString("en-US")}만 원`;

/** Pay as the employer disclosed it, with a KRW reading; nothing when the employer did not publish it. */
export function payFact(role: Row): string | null {
  if (role.salary_is_predicted) return null;
  const disclosed = String(role.salary_range ?? "").trim()
    || [role.salary_min, role.salary_max].filter(value => value != null).join("–");
  if (!disclosed) return null;
  const krw = annualSalaryKrw(role) as { min?: number | null; max?: number | null } | null | undefined;
  const reading = krw && (krw.min || krw.max)
    ? ` (≈ ${[krw.min, krw.max].filter((value): value is number => typeof value === "number" && value > 0).map(won).join("–")} per year)`
    : "";
  return `Pay disclosed by the employer: ${disclosed}${role.salary_currency && !disclosed.includes(role.salary_currency) ? ` ${role.salary_currency}` : ""}${reading}.`;
}

/**
 * Facts for making the case for opportunities just published that this request has
 * not shown yet: pay an employer published, and the shared overview of employers
 * not already read. alreadyRead is updated with the employers described here.
 */
export async function describePublishedOpportunities(owner: Owner, recommendationIds: unknown, signal?: AbortSignal, alreadyRead?: Set<string>) {
  const ids = Array.isArray(recommendationIds) ? recommendationIds.filter((id): id is string => typeof id === "string") : [];
  if (!ids.length) return undefined;
  const { data: recs } = await (owner.admin.from("talent_opportunity_recommendation" as never) as any)
    .select("id,role_id,company_workspace_id").eq("talent_id", owner.userId).in("id", ids);
  const roleIds = (recs ?? []).flatMap((rec: Row) => rec.role_id ? [rec.role_id] : []);
  const { data: roles } = roleIds.length
    ? await (owner.admin.from("company_roles" as never) as any)
      .select("role_id,name,source_type,company_workspace_id,salary_min,salary_max,salary_range,salary_currency,salary_period,salary_is_predicted").in("role_id", roleIds)
    : { data: [] };
  const workspaceIds = [...new Set([...(roles ?? []).map((role: Row) => role.company_workspace_id), ...(recs ?? []).map((rec: Row) => rec.company_workspace_id)].filter(Boolean))];
  const { data: workspaces } = workspaceIds.length
    ? await (owner.admin.from("company_workspace" as never) as any).select("company_workspace_id,company_name").in("company_workspace_id", workspaceIds)
    : { data: [] };
  const names = new Map((workspaces ?? []).map((row: Row) => [row.company_workspace_id, row.company_name]));
  const lines = (recs ?? []).flatMap((rec: Row) => {
    const role = (roles ?? []).find((item: Row) => item.role_id === rec.role_id);
    const pay = role ? payFact(role) : null;
    if (!role || !pay) return [];
    const company = role.source_type === "internal" ? "a Harper-connected company" : names.get(role.company_workspace_id) ?? "the employer";
    return [`${role.name} @ ${company}: ${pay}`];
  });
  const { readPublishedCompanyOverviews } = await import("./store");
  const overviews = await readPublishedCompanyOverviews(owner, ids, signal, alreadyRead).catch(() => undefined);
  const text = [
    lines.length ? ["Pay published by the employer:", ...lines.map((line: string) => `- ${line}`)].join("\n") : "",
    overviews ? `Employer overviews not yet shown in this request:\n${overviews}` : "",
  ].filter(Boolean).join("\n");
  return text || undefined;
}
