import type { User } from "@supabase/supabase-js";
import { readOrgDecisionCounts, type OrgRoleDecisionRead } from "@/lib/org/decisionCounts.server";
import { untypedTable } from "@/lib/org/untypedTable";

/**
 * Facts Harper judges from in runs it starts itself (the proactive review and
 * its own scheduled runs): how long decisions have waited, where the last
 * search narrowed, and the company's recent written pass reasons. Facts only:
 * no threshold here decides whether Harper should ask or suggest anything.
 * Bounded so the run's input stays small.
 */
export const DECISION_EVIDENCE_LIMITS = {
  roles: 12,
  passReasons: 3,
  passReasonChars: 200,
  passReasonDays: 30,
  criteria: 3,
  criterionNameChars: 80,
} as const;

type Json = Record<string, any>;
const DAY_MS = 86_400_000;

function days(since: string | null | undefined, now: Date) {
  const at = since ? Date.parse(since) : NaN;
  return Number.isFinite(at) ? Math.max(0, Math.floor((now.getTime() - at) / DAY_MS)) : null;
}
function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Waiting decisions: how many, and since when the oldest has waited. */
export function summarizeDecisionWait(read: OrgRoleDecisionRead | undefined, now: Date) {
  if (!read) return null;
  const oldestToRequestAt = [...read.toRequest].map((row) => row.at).filter(Boolean).sort()[0] ?? null;
  return {
    waitingToConnect: read.waiting.length,
    oldestWaitingSince: read.oldestWaitingSince,
    oldestWaitingDays: days(read.oldestWaitingSince, now),
    awaitingIntroDecision: read.toRequest.length,
    oldestAwaitingIntroSince: oldestToRequestAt,
    oldestAwaitingIntroDays: days(oldestToRequestAt, now),
  };
}

/** The last finished search, from what its run recorded; absent numbers stay null. */
export function summarizeSearchRun(row: Json | null | undefined) {
  if (!row) return null;
  const counts = (row.counts ?? {}) as Json;
  const roleSearch = (row.roleSearch ?? {}) as Json;
  const funnel = (roleSearch.funnel ?? {}) as Json;
  const stats = Array.isArray(funnel.criteriaStats) ? funnel.criteriaStats
    : Array.isArray(roleSearch.criteriaStats) ? roleSearch.criteriaStats : [];
  const excludedBy = funnel.stage1ExcludedBy && typeof funnel.stage1ExcludedBy === "object"
    ? Object.fromEntries(Object.entries(funnel.stage1ExcludedBy as Json)
      .filter(([, value]) => count(value) !== null))
    : null;
  return {
    finishedAt: row.finished_at ?? null,
    retrieved: count(counts.retrieved) ?? count(funnel.pool),
    evaluated: count(counts.scored) ?? count(funnel.stage2Evaluated),
    selected: count(counts.selected),
    stage1Excluded: count(funnel.stage1Excluded) ?? count(roleSearch.counts?.stage1Excluded),
    stage1ExcludedBy: excludedBy && Object.keys(excludedBy).length ? excludedBy : null,
    lowestScoredCriteria: stats
      .filter((item: Json) => typeof item?.name === "string" && count(item.meanScore) !== null)
      .sort((a: Json, b: Json) => a.meanScore - b.meanScore)
      .slice(0, DECISION_EVIDENCE_LIMITS.criteria)
      .map((item: Json) => ({
        name: String(item.name).slice(0, DECISION_EVIDENCE_LIMITS.criterionNameChars),
        meanScore: Math.round(item.meanScore * 100) / 100,
        evaluated: count(item.count),
      })),
  };
}

/** The run columns selected below, back in the shape the run stored. */
function searchRow(row: Json | undefined) {
  return row ? { finished_at: row.finished_at, counts: row.counts,
    roleSearch: { funnel: row.funnel, criteriaStats: row.criteriaStats, counts: row.searchCounts } } : null;
}

export function summarizePassReasons(rows: Json[] | null | undefined) {
  return (rows ?? [])
    .filter((row) => typeof row.reason_text === "string" && row.reason_text.trim())
    .slice(0, DECISION_EVIDENCE_LIMITS.passReasons)
    .map((row) => {
      const text = row.reason_text.trim();
      return { at: row.created_at ?? null, text: text.slice(0, DECISION_EVIDENCE_LIMITS.passReasonChars),
        complete: text.length <= DECISION_EVIDENCE_LIMITS.passReasonChars };
    });
}

/**
 * One entry per Role (at most DECISION_EVIDENCE_LIMITS.roles). A part that
 * cannot be read is "unavailable", never an empty fact.
 */
export async function loadRoleDecisionEvidence(args: {
  admin: any;
  workspaceId: string;
  roleIds: string[];
  /** Null: the workspace owner reads, as for other runs without a person. */
  user: User | null;
  now?: Date;
}, dependencies = { readCounts: readOrgDecisionCounts }) {
  const now = args.now ?? new Date();
  const roleIds = [...new Set(args.roleIds.filter(Boolean))].slice(0, DECISION_EVIDENCE_LIMITS.roles);
  if (!roleIds.length) return [];
  const since = new Date(now.getTime() - DECISION_EVIDENCE_LIMITS.passReasonDays * DAY_MS).toISOString();
  const counts = await dependencies.readCounts({ admin: args.admin, user: args.user, workspaceId: args.workspaceId, roleIds })
    .catch((error) => {
      console.warn("[org/agent/decision-evidence] counts unavailable", { error: String(error?.message ?? error) });
      return null;
    });
  return Promise.all(roleIds.map(async (roleId) => {
    const [search, passes] = await Promise.all([
      untypedTable(args.admin, "company_first_search_runs")
        .select("finished_at,counts:result->counts,funnel:result->roleSearch->funnel,criteriaStats:result->roleSearch->criteriaStats,searchCounts:result->roleSearch->counts")
        .eq("company_workspace_id", args.workspaceId)
        .or(`role_id.eq.${roleId},scheduled_role_ids.cs.{${roleId}},requested_role_ids.cs.{${roleId}}`)
        .in("status", ["succeeded", "completed"])
        .order("finished_at", { ascending: false })
        .limit(1),
      untypedTable(args.admin, "company_decision_events")
        .select("reason_text,created_at")
        .eq("company_workspace_id", args.workspaceId)
        .eq("role_id", roleId)
        .eq("action", "pass")
        .not("reason_text", "is", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(DECISION_EVIDENCE_LIMITS.passReasons),
    ]);
    return {
      roleId,
      decisionWait: counts ? summarizeDecisionWait(counts.get(roleId), now) : "unavailable",
      lastSearch: search.error ? "unavailable"
        : summarizeSearchRun(searchRow(search.data?.[0] as Json | undefined)),
      recentPassReasons: passes.error ? "unavailable" : summarizePassReasons(passes.data),
    };
  }));
}
