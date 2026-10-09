import { randomUUID } from "node:crypto";
import type { PriorityReviewTestCase } from "./priorityReviewTestContract";

type Row = Record<string, any>;

// A closed, in-memory Supabase-shaped store. It has no live client, URL or
// network fallback. Production tool executors can only read/write these rows.
class SandboxQuery implements PromiseLike<{ data: any; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private maxRows = Infinity;
  private singleRow = false;
  private inserted: Row[] | null = null;
  private sorts: Array<{ key: string; ascending: boolean }> = [];

  constructor(
    private rows: Row[],
    private writable: boolean
  ) {}
  select() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }
  is(key: string, value: unknown) {
    this.filters.push((row) => {
      const [column, jsonKey] = key.split("->>");
      return (
        (jsonKey ? (row[column]?.[jsonKey] ?? null) : (row[column] ?? null)) ===
        value
      );
    });
    return this;
  }
  order(key: string, options?: { ascending?: boolean }) {
    this.sorts.push({ key, ascending: options?.ascending !== false });
    return this;
  }
  limit(value: number) {
    this.maxRows = value;
    return this;
  }
  maybeSingle() {
    this.singleRow = true;
    return this;
  }
  single() {
    this.singleRow = true;
    return this;
  }
  insert(input: Row | Row[]) {
    if (!this.writable) throw new Error("Sandbox table is read-only");
    this.inserted = (Array.isArray(input) ? input : [input]).map((row) => ({
      id: randomUUID(),
      created_at: new Date().toISOString(),
      ...structuredClone(row),
    }));
    return this;
  }
  then<TResult1 = { data: any; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: any;
          error: null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    const inserted = this.inserted;
    this.inserted = null;
    if (inserted) this.rows.push(...inserted);
    const result = (inserted ?? this.rows).filter((row) =>
      this.filters.every((filter) => filter(row))
    );
    result.sort((a, b) => {
      for (const sort of this.sorts) {
        const order = String(a[sort.key] ?? "").localeCompare(
          String(b[sort.key] ?? "")
        );
        if (order) return sort.ascending ? order : -order;
      }
      return 0;
    });
    const sliced = result.slice(0, this.maxRows);
    return Promise.resolve({
      data: this.singleRow ? (sliced[0] ?? null) : sliced,
      error: null,
    }).then(onfulfilled, onrejected);
  }
}

export function createPriorityReviewTestSandbox(args: {
  caseId: PriorityReviewTestCase;
  role: Row;
  userId: string;
}) {
  const role = structuredClone(args.role);
  // A snapshot of an existing real role, never a new DB role or test inventory.
  // No notification side effect is permitted from the copied role.
  role.information = {
    ...role.information,
    suppressPriorityReviewHiringNotification: true,
  };
  const now = new Date().toISOString();
  const fit: Row = {
    id: randomUUID(),
    talent_id: args.userId,
    opportunity_id: role.role_id,
    fit_contract_version: "talent_role_fit_v2",
    evaluated_stage: 2,
    input_fingerprint: "career-priority-review-test-v1",
    stage_one_result: "continue",
    evaluation_started_at: now,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    role_fit: args.caseId === "high" ? "perfect" : "bad",
    candidate_fit: "good",
    company_fit: args.caseId === "high" ? "perfect" : "bad",
    label: null,
    human_label: null,
    recommend: false,
    reason: null,
    candidate_reason: "Synthetic assessment for isolated response testing.",
    company_reason: "Synthetic assessment for isolated response testing.",
    reevaluation_criteria: null,
    reevaluation_checked_at: null,
    candidate_visible: false,
    priority_review_recommendable: args.caseId === "high",
  };
  const tables: Record<string, Row[]> = {
    company_roles: [role],
    talent_setting: [{ user_id: args.userId, is_onboarding_done: true }],
    talent_role_fit_with_selection_v1: args.caseId === "missing" ? [] : [fit],
    talent_progress: [],
    talent_opportunity_recommendation: [],
    talent_opportunity_tag: [],
    talent_opportunity_matching_review: [],
    logs: [],
    // History hydration reads these; there is no real activity in a clean round.
    talent_effective_opportunity_recommendations_v1: [],
    meeting_schedules: [],
    meeting_schedule_rounds: [],
    company_intro_candidates: [],
    company_talent_requests: [],
    company_talent_relays: [],
  };
  const writableTables = new Set(["talent_progress", "logs"]);
  const admin = {
    from(table: string) {
      if (!(table in tables))
        throw new Error(`Unsupported sandbox table: ${table}`);
      return new SandboxQuery(tables[table], writableTables.has(table));
    },
    async rpc(name: string, input: Row) {
      // The SQL side effect is simulated. The surrounding verification and
      // candidate-facing tool results still run through production executors.
      if (
        name !== "present_talent_internal_role_recommendation_for_review_v1"
      ) {
        throw new Error(`Unsupported sandbox RPC: ${name}`);
      }
      if (
        input.p_talent_id !== args.userId ||
        input.p_target_role_id !== role.role_id ||
        !fit.priority_review_recommendable ||
        !tables.talent_progress.some(
          (row) =>
            row.kind === "candidate_requested_connection" &&
            row.role_id === role.role_id
        )
      ) {
        throw new Error(
          "Sandbox presentation was not authorized by the priority request"
        );
      }
      const existing = tables.talent_opportunity_recommendation[0];
      if (existing)
        return {
          data: { status: "no_change", targetRoleName: role.name },
          error: null,
        };
      tables.talent_opportunity_recommendation.push({
        id: randomUUID(),
        talent_id: args.userId,
        role_id: role.role_id,
        created_at: now,
        updated_at: now,
        opportunity_type: "internal_recommendation",
        feedback: null,
        saved_stage: null,
        fit_reasons: input.p_context.fitReasons,
      });
      return {
        data: {
          status: "recommended",
          targetRoleName: role.name,
          recommendedAt: now,
        },
        error: null,
      };
    },
  };
  return { admin, tables };
}
