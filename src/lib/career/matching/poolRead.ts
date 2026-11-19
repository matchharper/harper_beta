import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { formatPoolOptions, formatRouteHistory, readRouteHistory } from "./candidatePool";

type Row = Record<string, any>;
const db = (admin: TalentAdminClient, table: string) => admin.from(table as never) as any;

/** Counts and routes only; the options themselves are read with section=pool. */
export async function readPoolSummary(admin: TalentAdminClient, args: { userId: string; matchingId: string }) {
  const [{ data: pool }, { data: recs }, routes] = await Promise.all([
    db(admin, "talent_matching_candidates").select("role_id,company_workspace_id").eq("matching_id", args.matchingId).eq("talent_id", args.userId),
    db(admin, "talent_opportunity_recommendation").select("role_id,company_workspace_id,feedback").eq("talent_id", args.userId),
    readRouteHistory(admin, args.matchingId, args.userId),
  ]);
  if (!(pool ?? []).length) return undefined;
  const key = (r: Row) => r.role_id ? `role:${r.role_id}` : `company:${r.company_workspace_id}`;
  const inPool = new Set((pool ?? []).map(key));
  const recommended = (recs ?? []).filter((r: Row) => inPool.has(key(r)));
  const reacted = recommended.filter((r: Row) => r.feedback).length;
  const companies = (pool ?? []).filter((r: Row) => !r.role_id).length;
  return [
    `Options evaluated for this matching: ${(pool ?? []).length} (postings ${(pool ?? []).length - companies} · companies ${companies}) · recommended ${recommended.length} · reactions ${reacted}. Read them with section=pool.`,
    formatRouteHistory(routes),
  ].filter(Boolean).join("\n");
}

/** The matching's options, highest weighted score first, with their numbers. */
export async function readPoolPage(admin: TalentAdminClient, args: { userId: string; matchingId: string; cursor?: string; limit?: number }) {
  const offset = Math.max(0, Number.parseInt(args.cursor ?? "0", 10) || 0);
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const { data, error, count } = await db(admin, "talent_matching_candidates")
    .select("number,role_id,company_workspace_id,latest_score,angles", { count: "exact" })
    .eq("matching_id", args.matchingId).eq("talent_id", args.userId)
    .order("latest_score", { ascending: false, nullsFirst: false }).order("number").range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const { data: recs } = await db(admin, "talent_opportunity_recommendation").select("role_id,company_workspace_id,feedback").eq("talent_id", args.userId);
  const key = (r: Row) => r.role_id ? `role:${r.role_id}` : `company:${r.company_workspace_id}`;
  const recOf = new Map((recs ?? []).map((r: Row) => [key(r), r]));
  const lines = await formatPoolOptions(admin, {
    userId: args.userId,
    options: (data ?? []).map((r: Row) => ({ key: { roleId: r.role_id, companyWorkspaceId: r.company_workspace_id }, number: r.number,
      score: r.latest_score, angles: r.angles })),
  });
  const marked = lines.map((line, index) => {
    const rec = recOf.get(key((data ?? [])[index])) as Row | undefined;
    return rec ? line.replace(/\n|$/, ` · recommended${rec.feedback ? ` (${rec.feedback})` : ""}$&`) : line;
  });
  const next = offset + limit < (count ?? 0) ? offset + limit : null;
  return {
    matchingId: args.matchingId,
    modelOutput: [`Options of matching ${args.matchingId}: ${count ?? 0}, highest weighted score first.`, "", ...marked, "",
      next != null ? `Next: cursor ${next}.` : "", "Team numbers come from Harper's career records as of the date shown."].filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n"),
  };
}
