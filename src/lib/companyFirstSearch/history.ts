import type { OrgAgentAdminClient } from "@/lib/org/agent/data";

export type CandidateOutreachPause = {
  roleId: string;
  pendingCount: number;
  maxPendingTalents: number;
};

/** Only measured capacity facts are shared, never private reranker reasons. */
export function readCandidateOutreachPauses(value: unknown): CandidateOutreachPause[] {
  const facts = record(value).candidateOutreachPauses;
  if (!Array.isArray(facts)) return [];
  return facts.flatMap(value => {
    const row = record(value);
    const roleId = text(row.roleId);
    const pendingCount = count(row.pendingCount);
    const maxPendingTalents = count(row.maxPendingTalents);
    return roleId && pendingCount !== null && maxPendingTalents !== null && pendingCount >= maxPendingTalents
      ? [{ roleId, pendingCount, maxPendingTalents }] : [];
  });
}

export type MatchingRunHistoryItem = {
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: string;
  trigger: string;
  roles: Array<{ roleId: string; name: string | null }>;
  evaluatedPairs: number | null;
  cachedPairs: number | null;
  reviewedTalents?: number | null;
  companyProposals: number | null;
  candidateProposalsSelected: number | null;
  priorityRequestsSelected: number | null;
  selected: number | null;
  selectionReused: boolean;
  searchStrategy: string | null;
  searchReason: string | null;
  candidateOutreachPauses?: CandidateOutreachPause[];
};

export type MatchingRunHistory = {
  items: MatchingRunHistoryItem[];
  offset: number;
  nextOffset: number | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function roleIds(row: Record<string, unknown>) {
  return [...new Set([row.scheduled_role_ids, row.requested_role_ids]
    .flatMap(value => Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []))];
}

/** Company-safe aggregate history; no private pair reasons or candidate identities. */
export async function readMatchingRunHistory(args: {
  admin: OrgAgentAdminClient; workspaceId: string; offset?: number; limit?: number;
}): Promise<MatchingRunHistory> {
  const offset = args.offset ?? 0;
  const limit = args.limit ?? 5;
  if (!Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("History requires a nonnegative integer offset and a limit between 1 and 20");
  }
  const { data, error } = await (args.admin.from("company_first_search_runs" as any) as any)
    .select("id,created_at,started_at,finished_at,status,trigger_reason,scheduled_role_ids,requested_role_ids,query_plan,result")
    .eq("company_workspace_id", args.workspaceId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + limit);
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  const page = rows.slice(0, limit);
  const ids = [...new Set(page.flatMap(roleIds))];
  const names = new Map<string, string | null>();
  if (ids.length) {
    const { data: roles, error: roleError } = await args.admin.from("company_roles")
      .select("role_id,name").eq("company_workspace_id", args.workspaceId).in("role_id", ids);
    if (roleError) throw roleError;
    for (const role of roles ?? []) names.set(role.role_id, text(role.name));
  }
  const items = page.map(row => {
    const result = record(row.result);
    const counts = record(result.counts);
    const plan = record(row.query_plan);
    const ids = roleIds(row);
    const evaluatedPairs = count(counts.freshScorePairs);
    const cachedPairs = count(counts.reusedFitPairs);
    // Existing counts already identify the distinct talents sent to fit review.
    // Pair totals are equivalent to people only for a single-role legacy run.
    const reviewedTalents = count(counts.hard_filtered) ?? count(counts.packets) ??
      (ids.length === 1 && evaluatedPairs !== null && cachedPairs !== null
        ? evaluatedPairs + cachedPairs : null);
    return {
      createdAt: text(row.created_at), startedAt: text(row.started_at), finishedAt: text(row.finished_at),
      status: text(row.status) ?? "unknown", trigger: text(row.trigger_reason) ?? "unknown",
      roles: ids.map(roleId => ({ roleId, name: names.get(roleId) ?? null })),
      evaluatedPairs, cachedPairs, reviewedTalents,
      companyProposals: count(counts.companyFirst),
      candidateProposalsSelected: count(counts.candidateFirst),
      priorityRequestsSelected: count(counts.priorityReviewSelected), selected: count(counts.selected),
      selectionReused: Boolean(result.reusedSelectionRunId),
      candidateOutreachPauses: Array.isArray(result.candidateOutreachPauses)
        ? readCandidateOutreachPauses(result).filter(fact => roleIds(row).includes(fact.roleId))
        : undefined,
      // The planner reads company-side evidence. Rerank noSelectionReason and
      // pair reasons may contain private talent evidence and are not shared.
      searchStrategy: text(plan.searchStrategy), searchReason: text(plan.reason),
    };
  });
  return { items, offset, nextOffset: rows.length > limit ? offset + limit : null };
}
