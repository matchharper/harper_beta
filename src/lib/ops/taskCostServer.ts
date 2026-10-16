import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  taskGroupForSource,
  type OpsTaskCostResponse,
  type TaskCostRow,
} from "./taskCosts";

type Range = { from: string; through: string; endExclusive: string };
type Receipt = {
  id: string | number;
  source?: string;
  model?: string;
  cost: number | string | null;
  cost_status?: string;
  costKind?: string | null;
  status?: string;
  unpriced?: number | null;
  missing?: number | null;
};
const SOURCES = [
  {
    table: "llm_logs",
    source: null,
    select:
      "id,source,model,cost:estimated_cost_usd,cost_status,costKind:meta->>costKind",
  },
  {
    table: "opportunity_discovery_run",
    source: "opportunity_discovery",
    select:
      "id,status,cost:coverage->llmEstimatedCostUsd,unpriced:coverage->llmUsage->costSummary->unpricedCalls,missing:coverage->llmUsage->attemptsWithoutUsage",
  },
  {
    table: "company_first_search_runs",
    source: "company_first_search",
    select:
      "id,status,cost:model_manifest->usage->estimatedCostUsd,unpriced:model_manifest->usage->unpricedCalls",
  },
] as const;

export function taskCostReceipt(
  row: Receipt,
  sourceOverride: string | null,
  date: string
): TaskCostRow | null {
  // Attribution rows duplicate the parent completion. They are never additional spend.
  if (row.costKind === "attribution") return null;
  if (
    sourceOverride &&
    (row.status === "queued" || row.status === "running") &&
    row.cost == null
  )
    return null;
  const source = sourceOverride ?? row.source ?? "unknown";
  const parsed = row.cost == null ? NaN : Number(row.cost);
  const known = Number.isFinite(parsed) && row.cost_status !== "unpriced";
  const incomplete =
    !known || Number(row.unpriced ?? 0) > 0 || Number(row.missing ?? 0) > 0;
  return {
    date,
    source,
    taskId: taskGroupForSource(source),
    model: row.model || "전체 모델 (실행 합계)",
    amount: known ? parsed : 0,
    records: 1,
    unpricedRecords: incomplete ? 1 : 0,
  };
}

export async function fetchOpsTaskCosts(
  admin: TalentAdminClient,
  range: Range
): Promise<OpsTaskCostResponse> {
  const generatedAt = new Date().toISOString();
  const tasks: Array<{
    date: string;
    next: string;
    source: (typeof SOURCES)[number];
  }> = [];
  for (
    let cursor = new Date(`${range.from}T00:00:00Z`);
    cursor.toISOString().slice(0, 10) <= range.through;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const date = cursor.toISOString().slice(0, 10);
    const next = new Date(cursor.getTime() + 86400000).toISOString();
    for (const source of SOURCES) tasks.push({ date, next, source });
  }
  const grouped = new Map<string, TaskCostRow>();
  let excludedAttributions = 0;
  let cursor = 0;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 110_000);
  const signal = controller.signal;
  try {
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (cursor < tasks.length) {
          const { date, next, source } = tasks[cursor++];
          // Narrow date windows and keyset pagination avoid scanning large JSON payloads
          // and never silently stop at Supabase's default 1,000-row limit.
          let lastId: string | number | null = null;
          for (;;) {
            let query = admin
              .from(source.table as "llm_logs")
              .select(source.select)
              .gte("created_at", `${date}T00:00:00Z`)
              .lt("created_at", next < generatedAt ? next : generatedAt)
              .order("id")
              .limit(1000)
              .abortSignal(signal);
            if (lastId !== null) query = query.gt("id", lastId);
            const { data, error } = await query;
            if (error)
              throw new Error(
                `태스크 비용 조회 실패 (${source.table}, ${date}): ${error.message}`
              );
            const receipts = (data ?? []) as unknown as Receipt[];
            for (const receipt of receipts) {
              if (receipt.costKind === "attribution") excludedAttributions += 1;
              const row = taskCostReceipt(receipt, source.source, date);
              if (!row) continue;
              const key = JSON.stringify([date, row.source, row.model]);
              const current = grouped.get(key) ?? {
                ...row,
                amount: 0,
                records: 0,
                unpricedRecords: 0,
              };
              current.amount += row.amount;
              current.records += row.records;
              current.unpricedRecords += row.unpricedRecords;
              grouped.set(key, current);
            }
            if (receipts.length < 1000) break;
            const nextId = receipts.at(-1)!.id;
            if (nextId === lastId)
              throw new Error("태스크 비용 페이지 조회가 진행되지 않았습니다.");
            lastId = nextId;
          }
        }
      })
    );
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
  return {
    from: range.from,
    through: range.through,
    generatedAt,
    excludedAttributions,
    rows: [...grouped.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || b.amount - a.amount
    ),
  };
}
