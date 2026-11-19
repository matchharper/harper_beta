import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { formatCompanyPersonalContext, readCompanyPersonalContext, type CompanyPersonalContext } from "../companies/personalContext";
import { rankScore, scoreForLlm } from "@/lib/externalRecommendationsV2/contract";
import { readCompanyFacts, formatCompanyFacts, embedHint, type CompanyFacts } from "@/lib/career/companies/discovery";

/**
 * A matching's pool: every option evaluated for it, numbered once. A search
 * result reports what it found that the pool did not have, how high the best
 * of it ranks against everything already evaluated, and which routes have been
 * tried, so the agent can judge whether looking further is likely to change
 * its recommendation.
 */
type Row = Record<string, any>;
const db = (admin: TalentAdminClient, table: string) => admin.from(table as never) as any;

export type PoolKey = { roleId?: string | null; companyWorkspaceId?: string | null };
const keyOf = (k: PoolKey) => k.roleId ? `role:${k.roleId}` : `company:${k.companyWorkspaceId}`;

export type PoolEntry = { number: number; roleId: string | null; companyWorkspaceId: string | null; firstRunId: string | null; score: number | null };
/** Where a search's best new option ranks among the matching's available, scored options. */
export type NewRank = { number: number; rank: number; of: number };
export type Ledger = {
  search: number; evaluated: number; postings: number; companies: number; fresh: number;
  freshPostings?: number; freshCompanies?: number;
  bestNew?: NewRank | null; bestNewByAngle?: Record<string, NewRank>;
  angles: string[];
  /** Earlier ledgers recorded the three highest-scoring options instead. */
  topBefore?: number[]; topAfter?: number[];
};

function scoreOf(assessment: Row | null | undefined) {
  try { const s = rankScore(assessment?.fit ?? assessment); return Number.isFinite(s) ? s : null; } catch { return null; }
}

async function readPool(admin: TalentAdminClient, matchingId: string): Promise<PoolEntry[]> {
  const { data, error } = await db(admin, "talent_matching_candidates")
    .select("number,role_id,company_workspace_id,first_run_id,latest_score").eq("matching_id", matchingId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Row) => ({ number: r.number, roleId: r.role_id, companyWorkspaceId: r.company_workspace_id,
    firstRunId: r.first_run_id, score: r.latest_score }));
}

/** Options that cannot be the strongest any more: closed postings and ones the person declined. */
async function unavailable(admin: TalentAdminClient, userId: string, pool: PoolEntry[]) {
  // Ranks that matter for the stopping signal are near the top; check those postings.
  const roleIds = [...pool].filter(p => p.roleId && p.score != null).sort((a, b) => b.score! - a.score!).slice(0, 60).map(p => p.roleId!);
  const [closed, declined] = await Promise.all([
    roleIds.length ? db(admin, "company_roles").select("role_id").in("role_id", roleIds)
      .or("is_expired.eq.true,status.in.(expired,closed,inactive,archived,ended)") : { data: [] },
    db(admin, "talent_opportunity_recommendation").select("role_id,company_workspace_id")
      .eq("talent_id", userId).not("feedback", "is", null).neq("feedback", "like"),
  ]);
  return new Set<string>([
    ...(closed.data ?? []).map((r: Row) => `role:${r.role_id}`),
    ...(declined.data ?? []).map((r: Row) => keyOf({ roleId: r.role_id, companyWorkspaceId: r.company_workspace_id })),
  ]);
}

const ranked = (pool: PoolEntry[], skip: Set<string>) => pool
  .filter(p => p.score != null && !skip.has(keyOf(p)))
  .sort((a, b) => (b.score! - a.score!) || a.number - b.number);
function bestNewRank(order: PoolEntry[], fresh: Set<string>): NewRank | null {
  const index = order.findIndex(p => fresh.has(keyOf(p)));
  return index < 0 ? null : { number: order[index].number, rank: index + 1, of: order.length };
}

/** Records a completed search's evaluations in its matching and returns the ledger for it. */
export async function recordSearchInPool(admin: TalentAdminClient, args: { userId: string; matchingId: string; run: Row }) {
  const { userId, matchingId, run } = args;
  const ids: string[] = Array.isArray(run.evaluation_ids) ? run.evaluation_ids : [];
  const evaluations: Row[] = [];
  // Small batches keep the id list inside the request URL limit.
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db(admin, "talent_external_evaluations")
      .select("id,role_id,company_workspace_id,assessment").in("id", ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    evaluations.push(...(data ?? []));
  }
  const angleMap: Record<string, string[]> = run.request?.angles ?? {};
  const roleAngle = run.request?.roleIds?.length && !run.request?.plan ? "roles" : "postings";
  const items = evaluations.map(e => ({
    roleId: e.role_id, companyWorkspaceId: e.role_id ? null : e.company_workspace_id,
    evaluationId: e.id, score: scoreOf(e.assessment),
    angles: e.role_id ? [roleAngle] : angleMap[e.company_workspace_id] ?? ["companies"],
  })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const before = await readPool(admin, matchingId);
  const known = new Set(before.map(keyOf));
  const { error } = await (admin.rpc as any)("career_record_matching_candidates_v1", {
    p_matching: matchingId, p_talent: userId, p_run: run.id, p_items: items,
  });
  if (error) throw new Error(error.message);
  const after = await readPool(admin, matchingId);
  const skip = await unavailable(admin, userId, after);

  const { data: runs } = await db(admin, "external_recommendation_runs").select("id,created_at")
    .eq("matching_id", matchingId).eq("talent_id", userId).lte("created_at", run.created_at);
  const angles = [...new Set(items.flatMap(i => i.angles))];
  const freshItems = items.filter(i => !known.has(keyOf(i)));
  const order = ranked(after, skip);
  const bestNewByAngle: Record<string, NewRank> = {};
  for (const angle of angles) {
    const best = bestNewRank(order, new Set(freshItems.filter(i => i.angles.includes(angle)).map(keyOf)));
    if (best) bestNewByAngle[angle] = best;
  }
  const ledger: Ledger = {
    search: (runs ?? []).length || 1,
    evaluated: items.length,
    postings: items.filter(i => i.roleId).length,
    companies: items.filter(i => !i.roleId).length,
    fresh: freshItems.length,
    freshPostings: freshItems.filter(i => i.roleId).length,
    freshCompanies: freshItems.filter(i => !i.roleId).length,
    bestNew: bestNewRank(order, new Set(freshItems.map(keyOf))),
    bestNewByAngle,
    angles,
  };
  await db(admin, "external_recommendation_runs").update({ metrics: { ...(run.metrics ?? {}), ledger } }).eq("id", run.id);
  return { ledger, pool: after };
}

/** What each route has contributed in this matching so far. */
export async function readRouteHistory(admin: TalentAdminClient, matchingId: string, userId: string) {
  const { data } = await db(admin, "external_recommendation_runs").select("metrics,created_at")
    .eq("matching_id", matchingId).eq("talent_id", userId).order("created_at");
  const routes = new Map<string, RouteHistory>();
  for (const row of data ?? []) {
    const ledger: Ledger | undefined = row.metrics?.ledger;
    if (!ledger) continue;
    for (const angle of ledger.angles) {
      const r = routes.get(angle) ?? { searches: 0, best: null, latest: null };
      r.searches++;
      const found = ledger.bestNewByAngle?.[angle] ?? null;
      r.latest = { search: ledger.search, rank: found?.rank ?? null };
      if (found && (!r.best || found.rank <= r.best.rank)) r.best = { search: ledger.search, rank: found.rank };
      routes.set(angle, r);
    }
  }
  return routes;
}

const ANGLE_LABEL: Record<string, string> = {
  postings: "postings", roles: "exact roles", about: "companies by description", like: "similar companies", named: "named companies", companies: "companies",
};

type RouteHistory = { searches: number; best: { search: number; rank: number } | null; latest: { search: number; rank: number | null } | null };
const rankText = (rank: number | null | undefined) => rank ? `#${rank}` : "none";

/** Per route: how high its new options ranked at best, and in its latest search. */
export function formatRouteHistory(routes: Map<string, RouteHistory>) {
  if (!routes.size) return "";
  return "Routes so far (best new option's rank when found): " + [...routes].map(([angle, r]) => {
    const latest = r.latest && r.searches > 1 && r.latest.search !== r.best?.search ? `, latest search ${r.latest.search}: ${rankText(r.latest.rank)}` : "";
    return `${ANGLE_LABEL[angle] ?? angle} ${r.searches}× (${r.best ? `${rankText(r.best.rank)} in search ${r.best.search}` : "nothing new ranked"}${latest})`;
  }).join(" · ");
}

/** Resolves pool numbers of a matching to their option ids. */
export async function resolvePoolNumbers(admin: TalentAdminClient, matchingId: string | undefined, numbers: number[]) {
  if (!numbers.length) return new Map<number, PoolKey>();
  if (!matchingId) throw new Error("Option numbers belong to a matching; open or name the matching first.");
  const { data, error } = await db(admin, "talent_matching_candidates")
    .select("number,role_id,company_workspace_id").eq("matching_id", matchingId).in("number", numbers);
  if (error) throw new Error(error.message);
  const found = new Map<number, PoolKey>((data ?? []).map((r: Row) => [r.number, { roleId: r.role_id, companyWorkspaceId: r.company_workspace_id }]));
  const missing = numbers.filter(n => !found.has(n));
  if (missing.length) throw new Error(`No option ${missing.map(n => `[${n}]`).join(", ")} in this matching.`);
  return found;
}

const money = (n: number) => n >= 1e8 ? `${(n / 1e8).toFixed(1).replace(/\.0$/, "")}억` : `${Math.round(n / 1e4).toLocaleString("en")}만`;
/** Pay the employer published. A model estimate already shapes the score and is not a fact to report. */
function payText(r: Row) {
  if (r.salary_is_predicted || (r.salary_min == null && r.salary_max == null)) return "";
  const krw = r.salary_currency === "KRW" && (r.salary_period ?? "year") === "year";
  const range = krw ? ([r.salary_min, r.salary_max].filter((v: unknown) => v != null) as number[]).map(money).join("–")
    : `${[r.salary_min, r.salary_max].filter((v: unknown) => v != null).join("–")} ${r.salary_currency ?? ""}/${r.salary_period ?? "year"}`;
  return `pay ${range}`;
}

/** Compact lines for options, highest weighted score first. */
export async function formatPoolOptions(admin: TalentAdminClient, args: {
  userId: string; options: { key: PoolKey; number?: number; score: number | null; fresh?: boolean; angles?: string[] }[];
  /** What the search was after; picks each company's closest open roles. */
  titleHint?: string;
}) {
  const roleIds = args.options.flatMap(o => o.key.roleId ? [o.key.roleId] : []);
  const { data: roles } = roleIds.length
    ? await db(admin, "company_roles").select("role_id,name,location_text,salary_min,salary_max,salary_currency,salary_period,salary_is_predicted,posted_at,company_workspace_id").in("role_id", roleIds)
    : { data: [] };
  const roleOf = new Map((roles ?? []).map((r: Row) => [r.role_id, r]));
  const companyIds = [...new Set([...args.options.flatMap(o => o.key.companyWorkspaceId ? [o.key.companyWorkspaceId] : []),
    ...(roles ?? []).map((r: Row) => r.company_workspace_id)])];
  const [{ data: companies }, facts, personal] = await Promise.all([
    companyIds.length ? db(admin, "company_workspace").select("company_workspace_id,company_name,company_description").in("company_workspace_id", companyIds) : { data: [] },
    (async () => {
      const titleVector = await embedHint(args.titleHint);
      return readCompanyFacts(admin, companyIds, { userId: args.userId, titleVector });
    })(),
    readCompanyPersonalContext(admin, args.userId, companyIds).catch(() => new Map<string, CompanyPersonalContext>()),
  ]);
  const personalLine = (companyId: string | undefined) => {
    const text = companyId ? formatCompanyPersonalContext(personal.get(companyId)) : "";
    return text ? `\n  ${text}` : "";
  };
  const companyOf = new Map((companies ?? []).map((c: Row) => [c.company_workspace_id, c]));
  const now = new Date();
  return args.options.map(o => {
    const head = o.number != null ? `[${o.number}]` : `[${o.key.roleId ?? o.key.companyWorkspaceId}]`;
    const tail = [o.score != null ? String(Math.round(scoreForLlm(o.score))) : "not scored", o.fresh ? "new" : "",
      o.angles?.length ? o.angles.map(a => ANGLE_LABEL[a] ?? a).join("/") : ""].filter(Boolean).join(" · ");
    if (o.key.roleId) {
      const r = roleOf.get(o.key.roleId) as Row | undefined;
      const c = r ? companyOf.get(r.company_workspace_id) as Row | undefined : undefined;
      // For a posting, the employer's other openings are a count, not a list.
      const employer = facts.get(r?.company_workspace_id) as CompanyFacts | undefined;
      const employerFacts = employer ? { ...employer, hiring: employer.hiring ? { openRoles: employer.hiring.openRoles } : undefined } : undefined;
      const detail = [r?.location_text, r?.posted_at ? `posted ${String(r.posted_at).slice(0, 10)}` : "", r ? payText(r) : "",
        formatCompanyFacts(employerFacts, { now })].filter(Boolean).join(" · ");
      return `${head} ${c?.company_name ?? "?"} · ${r?.name ?? "role"} · ${tail}${detail ? `\n  ${detail}` : ""}${personalLine(r?.company_workspace_id)}`;
    }
    const c = companyOf.get(o.key.companyWorkspaceId!) as Row | undefined;
    const what = String(c?.company_description ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    const detail = [what, formatCompanyFacts(facts.get(o.key.companyWorkspaceId!) as CompanyFacts | undefined, { now })].filter(Boolean).join(" · ");
    return `${head} ${c?.company_name ?? "?"} · company · ${tail}${detail ? `\n  ${detail}` : ""}${personalLine(o.key.companyWorkspaceId!)}`;
  });
}

export function formatLedger(ledger: Ledger) {
  const best = ledger.bestNew;
  return [
    `Search ${ledger.search} · ${ledger.evaluated} evaluated (postings ${ledger.postings} · companies ${ledger.companies}), ${ledger.fresh} new to this matching`,
    !ledger.fresh || best === undefined ? "" : best
      ? `Best new option: [${best.number}], ranked #${best.rank} of ${best.of} available options in this matching by score`
      : "No new option has a score yet.",
  ].filter(Boolean).join("\n");
}
