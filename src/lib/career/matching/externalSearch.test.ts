import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const plan = {
  searchIntentSummary: "Engineering roles", roleTitles: ["Engineer"], ftsKeywords: [],
  countries: [{ countryCode: "KR", weight: 1, remoteOnly: false }],
  includeContract: false, includeParttime: false, includeIntern: false,
  includeRemote: true, remoteOnly: false, isPreferEntry: 0, postingRecency: null,
};
const copy = <T>(value: T): T => structuredClone(value);
class SearchFixture {
  rows: any[];
  autoScope: string[] | undefined;
  retrievalCalls = 0;
  retrievalWorkspaceIds?: string[];
  salaryCalls: string[][] = [];
  calls: { input: string; ids: string[] }[] = [];
  data: Record<string, any[]>;
  evaluate?: (ids: string[], signal?: AbortSignal) => void | Promise<void>;
  queued: unknown[] = [];
  attached: unknown[] = [];
  contextLoads = 0;
  cacheSqls: string[] = [];
  resultSqls: string[] = [];
  failResultRead = false;
  failAttachment?: string;
  queries: {
    table: string;
    action: string;
    columns?: string;
    count?: number;
  }[] = [];
  beforeUpsert?: (rows: any[]) => void;
  failUpsert?: (rows: any[]) => boolean;
  searchBlocked: string[] = [];
  behavior: string | null = "Stored behavior";
  profile = {
    profileId: id(9),
    revision: 3,
    snapshot: {
      talentUser: { headline: "Complete profile" },
      talentExperiences: [{ role: "Engineer", description: "Full experience" }],
      talentEducations: [],
      talentExtras: [],
    },
  };
  constructor(count: number) {
    this.rows = Array.from({ length: count }, (_, i) => ({
      role_id: id(100 + i),
      role_name: "Engineer",
      company_workspace_id: id(2),
      company_name: "Synthetic",
      description: `Complete duties ${i}`,
      type: ["full_time"],
      location_text: "Seoul",
    }));
    this.data = {
      external_recommendation_runs: [
        {
          id: id(10),
          talent_id: id(1),
          variant: "career_agent",
          status: "queued",
          context_ready_at: "2026-10-30",
          provider: "openai",
          locale: "en",
          evaluation_ids: [],
          candidate_role_ids: [],
          request: {
            profileId: id(9),
            profileRevision: 3,
            roleIds: this.rows.map((row) => row.role_id),
            evaluationLimit: 50,
          },
          input_snapshot: {
            profile: {
              headline: "Complete profile",
              experiences: [
                { role: "Engineer", description: "Full experience" },
              ],
            },
            search_brief: [
              { label: "Scope", content: "Frozen complete Brief" },
            ],
            behavior_context: "Frozen behavior",
            behavior_version: 7,
          },
        },
      ],
      talent_external_evaluations: [],
      talent_company_follow: [],
      talent_opportunity_recommendation: [],
      talent_users: [{ user_id: id(1), deleted_at: null }],
      talent_setting: [{ user_id: id(1), blocked_companies: [] }],
      talent_matchings: [
        {
          id: id(30),
          talent_id: id(1),
          criteria: {
            brief: [{ label: "Scope", content: "Frozen complete Brief" }],
          },
        },
      ],
    };
  }
  get run() {
    return this.data.external_recommendation_runs[0];
  }
  admin = {
    from: (table: string) => ({
      select: (columns?: string) => new Query(this, table).select(columns),
      update: (patch: any) => new Query(this, table, "update", patch),
      upsert: (patch: any) => new Query(this, table, "upsert", patch),
      insert: (patch: any) => new Query(this, table, "insert", patch),
    }),
    rpc: async (name: string, args: any) => {
      if (name === "attach_career_import_evaluation") {
        this.attached.push(copy(args));
        if (args.p_run === this.failAttachment) return { data: null, error: { message: "Synthetic attachment failure" } };
        return { data: null, error: null };
      }
      assert.equal(name, "claim_career_external_search");
      if (
        !["queued", "running"].includes(this.run.status) ||
        this.run.cancelled_at ||
        !this.run.context_ready_at ||
        new Date(this.run.lease_expires_at).getTime() > Date.now()
      )
        return { data: null, error: null };
      Object.assign(this.run, {
        status: "running",
        lease_token: args.p_token,
        lease_expires_at: new Date(Date.now() + 900_000).toISOString(),
      });
      return { data: copy(this.run), error: null };
    },
  };
  async decisions(
    _provider: string,
    input: string,
    ids: string[],
    signal?: AbortSignal
  ) {
    this.calls.push({ input, ids });
    await this.evaluate?.(ids, signal);
    return {
      evaluations: ids.map((roleId) => ({
        roleId,
        fit: { mutualFit: 80 },
        raw: {},
      })),
      invalid: [],
      attempts: 1,
      elapsedMs: 1,
      usage: {},
    };
  }
}
class Query {
  filters: ((row: any) => boolean)[] = [];
  max: number | undefined;
  columns?: string;
  constructor(
    private fixture: SearchFixture,
    private table: string,
    private action = "read",
    private patch?: any
  ) {}
  select(columns?: string) {
    this.columns = columns;
    return this;
  }
  eq(key: string, value: any) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  in(key: string, values: any[]) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }
  is(key: string, value: any) {
    this.filters.push((row) => (row[key] ?? null) === value);
    return this;
  }
  or(_filter: string) { return this; }
  order(_key: string, _options?: unknown) {
    return this;
  }
  limit(value: number) {
    this.max = value;
    return this;
  }
  async result(single = false) {
    this.fixture.queries.push({
      table: this.table,
      action: this.action,
      columns: this.columns,
      count:
        this.action === "upsert"
          ? Array.isArray(this.patch)
            ? this.patch.length
            : 1
          : undefined,
    });
    const rows =
      this.fixture.data[
        this.table === "talent_external_evaluation_index"
          ? "talent_external_evaluations"
          : this.table
      ];
    assert.ok(rows, `Unexpected table ${this.table}`);
    let selected = rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.action === "update")
      selected.forEach((row) => Object.assign(row, copy(this.patch)));
    if (this.action === "insert") {
      const row = {
        id: id(10 + rows.length),
        evaluation_ids: [],
        candidate_role_ids: [],
        ...copy(this.patch),
      };
      rows.push(row);
      selected = [row];
    }
    if (this.action === "upsert") {
      assert.ok(
        Array.isArray(this.patch),
        "Evaluations must be written as a batch"
      );
      this.fixture.beforeUpsert?.(this.patch);
      if (this.fixture.failUpsert?.(this.patch))
        return {
          data: null,
          error: { message: "Synthetic batch storage failure" },
        };
      selected = [];
      for (const patch of this.patch) {
        const existing = rows.find(
          (row) =>
            row.talent_id === patch.talent_id &&
            row.role_id === patch.role_id &&
            row.input_fingerprint === patch.input_fingerprint
        );
        if (!existing) {
          const row = { id: id(1000 + rows.length), ...copy(patch) };
          rows.push(row);
          selected.push(row);
        }
      }
    }
    if (this.max !== undefined) selected = selected.slice(0, this.max);
    return {
      data: copy(single ? (selected[0] ?? null) : selected),
      error: null,
    };
  }
  maybeSingle() {
    return this.result(true);
  }
  single() {
    return this.result(true);
  }
  then(resolve: any, reject: any) {
    return this.result().then(resolve, reject);
  }
}

test("external search real executor with local I/O and synthetic Decisions receipts", async (t) => {
  process.env.OPENAI_API_KEY ??= "synthetic-no-network";
  let fixture: SearchFixture;
  const resultDb = new PGlite();
  t.after(() => resultDb.close());
  const modules = Module as any;
  const original = modules._load;
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Network forbidden in search fixture");
  });
  t.mock.method(
    modules,
    "_load",
    function (this: unknown, name: string, ...args: any[]) {
      if (name === "@/lib/talentOnboarding/admin")
        return { getTalentSupabaseAdmin: () => fixture.admin };
      if (name === "@vercel/queue")
        return {
          send: async (...args: unknown[]) => {
            fixture.queued.push(args);
          },
        };
      if (name === "../developmentQueue.server")
        return { scheduleCareerDevelopmentJob: () => false };
      if (name === "@/lib/career/profiles/store")
        return { readProfileSnapshot: async () => copy(fixture.profile) };
      if (name === "@/lib/externalRecommendationsV2/context")
        return {
          ...original.call(this, name, ...args),
          loadExternalContext: async () => {
            fixture.contextLoads++;
            return {
              blockedCompanies: [],
              externalEnabled: true,
              context: {
                search_brief: [{ content: "Changed current Brief" }],
                behavior_context: fixture.behavior,
                behavior_version: fixture.behavior ? 7 : 0,
              },
            };
          },
        };
      if (name === "@/lib/externalRecommendationsV2/decisions")
        return {
          callDecisions: (...args: any[]) =>
            fixture.decisions(args[0], args[1], args[2], args[3]),
        };
      if (name === "@/lib/externalRecommendationsV2/salaryEstimation.server")
        return {
          fillExternalRoleSalaries: async (_admin: unknown, ids: string[], signal?: AbortSignal) => {
            signal?.throwIfAborted();
            fixture.salaryCalls.push([...ids]);
            return { requested: ids.length, estimated: 0, saved: 0, failed: ids.length, calls: ids.length ? 1 : 0 };
          },
        };
      if (name === "@/lib/externalRecommendationsV2/retrieval")
        return {
          ROLE_SELECT: "*",
          ROLE_JOINS: "",
          eligibilitySql: (args: any) => {
            fixture.searchBlocked = args.blockedCompanies;
            return "true";
          },
          executeSql: async (_admin: unknown, sql: string) => {
            if (sql.includes("WITH follows AS")) {
              return [{ companies: [], roles: fixture.rows.filter(row => !fixture.autoScope || fixture.autoScope.includes(row.role_id)).map(row => ({
                id: row.role_id, source: "external", recommendationId: null,
                evaluation: fixture.data.talent_external_evaluations.find(e => e.talent_id === id(1) && e.role_id === row.role_id) ?? null,
              })) }];
            }
            if (sql.includes("WITH referenced AS")) {
              fixture.resultSqls.push(sql);
              if (fixture.failResultRead)
                throw new Error("Synthetic result read failure");
              const tables = {
                "public.external_recommendation_runs": "fixture_runs",
                "public.talent_external_evaluation_index":
                  "fixture_evaluation_index",
                "public.talent_external_evaluations": "fixture_evaluations",
                "public.company_roles": "fixture_roles",
                "public.company_workspace": "fixture_companies",
                "public.talent_opportunity_recommendation":
                  "fixture_recommendations",
              };
              let query = sql.trim().replace(/^WITH /, "");
              for (const [table, replacement] of Object.entries(tables))
                query = query.replaceAll(table, replacement);
              const input = {
                runs: fixture.data.external_recommendation_runs,
                evaluations: fixture.data.talent_external_evaluations,
                roles: fixture.rows.map((row) => ({
                  ...row,
                  name: row.role_name,
                })),
                companies: [
                  { company_workspace_id: id(2), company_name: "Synthetic" },
                ],
                recommendations: fixture.data.talent_opportunity_recommendation,
              };
              return (
                await resultDb.query(
                  `WITH
                fixture_runs AS (SELECT * FROM jsonb_to_recordset($1::jsonb->'runs') AS r(id uuid,talent_id uuid,variant text,matching_id uuid,evaluation_ids uuid[])),
                fixture_evaluations AS (SELECT * FROM jsonb_to_recordset($1::jsonb->'evaluations') AS e(id uuid,talent_id uuid,role_id uuid,assessment jsonb,evaluated_at timestamptz,input_fingerprint text,input_snapshot jsonb)),
                fixture_evaluation_index AS (SELECT e.*,(assessment#>>'{fit,mutualFit}')::float8 AS mutual_fit_score FROM fixture_evaluations e),
                fixture_roles AS (SELECT * FROM jsonb_to_recordset($1::jsonb->'roles') AS r(role_id uuid,name text,summary jsonb,company_workspace_id uuid,is_expired boolean,expires_at timestamptz,status text)),
                fixture_companies AS (SELECT * FROM jsonb_to_recordset($1::jsonb->'companies') AS c(company_workspace_id uuid,company_name text)),
                fixture_recommendations AS (SELECT * FROM jsonb_to_recordset($1::jsonb->'recommendations') AS p(talent_id uuid,role_id uuid)),
                ${query}`,
                  [JSON.stringify(input)]
                )
              ).rows;
            }
            if (sql.includes("JOIN public.talent_external_evaluations")) {
              fixture.cacheSqls.push(sql);
              const keys = JSON.parse(
                sql.match(/jsonb_to_recordset\('([^']*)'::jsonb\)/)![1]
              );
              const owner = sql.match(/e.talent_id = '([^']+)'::uuid/)![1];
              return copy(
                fixture.data.talent_external_evaluations.filter(
                  (row) =>
                    row.talent_id === owner &&
                    keys.some(
                      (key: any) =>
                        key.role_id === row.role_id &&
                        key.input_fingerprint === row.input_fingerprint
                    )
                )
              );
            }
            const roleArray = sql.match(/cr\.role_id=ANY\(ARRAY\[([^\]]*)\]/)?.[1];
            const workspaceArray = sql.match(/cr\.company_workspace_id = ANY\(ARRAY\[([^\]]*)\]/)?.[1];
            return copy(
              fixture.rows.filter(
                (row) => (!roleArray || roleArray.includes(row.role_id)) &&
                  (!workspaceArray || workspaceArray.includes(row.company_workspace_id))
              )
            );
          },
          retrieveRoles: async (args: any) => {
            fixture.retrievalCalls++;
            fixture.retrievalWorkspaceIds = args.companyWorkspaceIds;
            return { rows: copy(fixture.rows.filter(row => !args.companyWorkspaceIds || args.companyWorkspaceIds.includes(row.company_workspace_id))) };
          },
        };
      if (name === "@/lib/talentOnboarding/jobPostingRecommendations")
        return {
          ...original.call(this, name, ...args),
          attachCompanyContextToCards: async ({ cards }: { cards: any[] }) =>
            cards.map((card) => ({
              ...card,
              companyLeadership: ["Full leadership evidence"],
            })),
        };
      return original.call(this, name, ...args);
    }
  );
  const { processCareerMatchingSearch, requestExternalMatchingSearch, publishImportedPostingEvaluations, controlExternalMatchingSearch, recoverCareerMatchingSearches } =
    await import("./externalSearch");
  const { CAREER_AGENTIC_TOOLS } = await import("../generalTools");
  const { withCompactTalentToolModelResult } =
    await import("@/lib/talentOnboarding/toolModelResult");
  const searchTool = (
    extra: Record<string, unknown> = {},
    signal?: AbortSignal,
    deadlineAt?: number
  ) =>
    CAREER_AGENTIC_TOOLS.search_opportunities.execute!(
      {
        matchingId: id(30),
        roleIds: fixture.rows.map((r) => r.role_id),
        ...extra,
      },
      {
        admin: fixture.admin as any,
        userId: id(1),
        conversationId: id(8),
        resumeRequestId: "message:42",
        abortSignal: signal,
        deadlineAt,
      }
    );
  const runSearch = () =>
    processCareerMatchingSearch({ runId: fixture.run.id });
  await t.test("a direct search without a matching uses the current Brief and exposes readable evaluations", async () => {
    fixture = new SearchFixture(2);
    fixture.data.external_recommendation_runs = [];
    const result: any = await searchTool({ matchingId: undefined });
    assert.equal(fixture.run.matching_id, null);
    assert.equal(fixture.run.status, "completed", fixture.run.error);
    assert.match(fixture.calls[0].input, /Changed current Brief/);
    assert.doesNotMatch(fixture.calls[0].input, /Frozen complete Brief/);
    assert.equal(result.evaluations.length, 2);
    assert.ok(result.modelOutput.includes(fixture.run.id));
    assert.equal(fixture.queries.some(q => q.table === "talent_matchings"), false);
  });

  await t.test("imported recommendations dispatch without scoring and evaluate only in the background", async () => {
    fixture = new SearchFixture(1);
    Object.assign(fixture.run, {
      surface: "import", context_ready_at: null, input_snapshot: null,
      operation_id: `job-posting:${id(40)}`,
      request: { roleIds: [fixture.rows[0].role_id], evaluationLimit: 1, recommendationId: id(40) },
    });
    fixture.data.talent_opportunity_recommendation.push({ id: id(40), talent_id: id(1), role_id: fixture.rows[0].role_id });
    const recommendation = copy(fixture.data.talent_opportunity_recommendation);
    await publishImportedPostingEvaluations(fixture.admin as any, id(2), [id(40)]);
    assert.equal(fixture.queued.length, 0);
    await publishImportedPostingEvaluations(fixture.admin as any, id(1), [id(40)]);
    assert.equal(fixture.queued.length, 1);
    assert.equal(fixture.contextLoads, 0);
    assert.equal(fixture.calls.length, 0);
    assert.equal(fixture.run.status, "queued");
    await runSearch();
    assert.equal(fixture.run.status, "completed", fixture.run.error);
    assert.equal(fixture.contextLoads, 1);
    assert.deepEqual(fixture.calls.flatMap(call => call.ids), [fixture.rows[0].role_id]);
    assert.match(fixture.calls[0].input, /Full experience/);
    assert.match(fixture.calls[0].input, /Changed current Brief/);
    assert.equal(fixture.run.request.profileRevision, 3);
    assert.deepEqual(fixture.attached, [{ p_run: fixture.run.id, p_token: fixture.run.lease_token }]);
    assert.ok(fixture.run.completion_notified_at);
    await runSearch();
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.attached.length, 1);
    assert.deepEqual(fixture.data.talent_opportunity_recommendation, recommendation);
  });
  await t.test("import scoring failure preserves the recommendation and resumes through the queue", async () => {
    fixture = new SearchFixture(1);
    Object.assign(fixture.run, {
      surface: "import", context_ready_at: null, input_snapshot: null,
      request: { roleIds: [fixture.rows[0].role_id], evaluationLimit: 1, recommendationId: id(40) },
    });
    fixture.data.talent_opportunity_recommendation.push({ id: id(40), talent_id: id(1), role_id: fixture.rows[0].role_id, feedback: "dislike" });
    const recommendation = copy(fixture.data.talent_opportunity_recommendation);
    fixture.evaluate = () => { throw new Error("Synthetic scorer outage"); };
    await runSearch();
    assert.equal(fixture.run.status, "failed");
    assert.equal(fixture.run.metrics.retryable, true);
    assert.equal(fixture.attached.length, 0);
    assert.deepEqual(fixture.data.talent_opportunity_recommendation, recommendation);
    const attempts = fixture.calls.length;
    fixture.evaluate = undefined;
    await controlExternalMatchingSearch({ admin: fixture.admin as any, userId: id(1), runId: fixture.run.id, action: "resume" });
    assert.equal(fixture.run.status, "queued");
    assert.equal(fixture.queued.length, 1);
    assert.equal(fixture.calls.length, attempts);
    await runSearch();
    assert.equal(fixture.run.status, "completed", fixture.run.error);
    assert.equal(fixture.contextLoads, 1);
    assert.equal(fixture.attached.length, 1);
    assert.deepEqual(fixture.data.talent_opportunity_recommendation, recommendation);
  });
  await t.test("invalid plan formats fail before storage, queueing, context loading or evaluation", async () => {
    for (const invalid of [JSON.stringify(plan), '{"roleTitles":["Engineer"]}}', { ...plan, roleTitles: "Engineer" }, { roleTitles: [] }]) {
      fixture = new SearchFixture(1);
      fixture.data.external_recommendation_runs = [];
      await assert.rejects(searchTool({ roleIds: undefined, plan: invalid }), /Invalid search plan/);
      assert.equal(fixture.data.external_recommendation_runs.length, 0);
      assert.equal(fixture.queued.length, 0);
      assert.equal(fixture.contextLoads, 0);
      assert.equal(fixture.calls.length, 0);
    }
    const { externalSearchPlanSchema } = await import("./searchPlan");
    const schema = (CAREER_AGENTIC_TOOLS.search_opportunities.parameters as any).properties;
    assert.ok(!("plan" in schema));
    assert.deepEqual(schema.countries, externalSearchPlanSchema.properties.countries);
  });
  await t.test("read never starts a new search and a missing run is an explicit read outcome", async () => {
    fixture = new SearchFixture(2);
    fixture.data.external_recommendation_runs = [];
    await assert.rejects(searchTool({ action: "read", matchingId: id(30), roleIds: undefined }), /read requires the runId/);
    const missing: any = await searchTool({ action: "read", runId: id(999) });
    assert.equal(missing.status, "not_found");
    assert.equal(fixture.retrievalCalls, 0);
    assert.equal(fixture.data.external_recommendation_runs.length, 0);
    assert.equal(fixture.queued.length, 0);
  });
  await t.test("keyed country conditions reach the actual search executor", async () => {
    fixture = new SearchFixture(2);
    fixture.data.external_recommendation_runs = [];
    const { postingRecency: _recency, isPreferEntry: _entry, ftsKeywords: _keywords, ...minimal } = plan;
    const result: any = await searchTool({ action: "search", roleIds: undefined,
      ...minimal, countries: { KR: { weight: 1, remoteOnly: false }, US: { weight: 0.5, remoteOnly: true } },
      targetSalaryKrw: null });
    assert.equal(result.status, "completed");
    assert.deepEqual(fixture.run.request.plan.countries, [
      { countryCode: "KR", weight: 1, remoteOnly: false }, { countryCode: "US", weight: 0.5, remoteOnly: true },
    ]);
    assert.equal(fixture.run.request.plan.postingRecency, null);
  });
  await t.test("recovery attempts later completed searches even when the first attachment fails", async t => {
    fixture = new SearchFixture(1);
    Object.assign(fixture.run, { status: "completed", surface: "import", evaluation_ids: [id(200)], metrics: {} });
    fixture.data.external_recommendation_runs.push({ ...copy(fixture.run), id: id(11) });
    fixture.failAttachment = id(10);
    t.mock.method(console, "error", () => {});
    await assert.rejects(recoverCareerMatchingSearches(fixture.admin as any), /Failed to recover 1/);
    assert.equal(fixture.attached.length, 2);
    assert.equal(fixture.run.completion_notified_at, undefined);
    assert.ok(fixture.data.external_recommendation_runs[1].completion_notified_at);
  });
  await t.test("company workspace scope persists and intersects both exact IDs and retrieval plans", async () => {
    for (const planned of [false, true]) {
      fixture = new SearchFixture(2);
      fixture.rows[1].company_workspace_id = id(3);
      fixture.data.external_recommendation_runs = [];
      const result: any = await searchTool({
        companyWorkspaceIds: [id(2), id(2)],
        ...(planned ? { roleIds: undefined, plan } : {}),
      });
      assert.deepEqual(fixture.run.request.companyWorkspaceIds, [id(2)]);
      assert.equal(result.evaluations.length, 1);
      assert.deepEqual(fixture.calls.flatMap(call => call.ids), [fixture.rows[0].role_id]);
      if (planned) assert.deepEqual(fixture.retrievalWorkspaceIds, [id(2)]);
    }
    fixture = new SearchFixture(2);
    fixture.data.external_recommendation_runs = [];
    const unrestricted: any = await searchTool({ companyWorkspaceIds: [] });
    assert.equal(unrestricted.status, "completed");
    assert.equal(fixture.run.request.companyWorkspaceIds, undefined);
    fixture = new SearchFixture(2);
    fixture.data.external_recommendation_runs = [];
    await assert.rejects(searchTool({ companyWorkspaceIds: ["not-a-uuid"] }));
    assert.equal(fixture.data.external_recommendation_runs.length, 0);
  });

  await t.test("summary selection and four-metric receipts survive storage, reading and exact-cache reuse", async () => {
    fixture = new SearchFixture(3);
    fixture.rows[0].summary = { en: { content: "Selected English summary", version: "old", sourceHash: "old" } };
    fixture.rows[1].summary = { ko: { content: "Other-language summary" } };
    const expectedFit = { candidateInterest: 75, companyInterest: 70, mutualFit: 80, constraintPass: 90 };
    const decisions = fixture.decisions.bind(fixture);
    fixture.decisions = async (...args) => {
      const receipt = await decisions(...args);
      return { ...receipt, evaluations: receipt.evaluations.map(row => ({ ...row, fit: expectedFit })) };
    };
    await runSearch();
    assert.equal(fixture.run.status, "completed");
    assert.equal(fixture.data.talent_external_evaluations.length, 3);
    const input = fixture.calls[0].input;
    assert.ok(input.includes("Selected English summary"));
    assert.ok(!input.includes("Complete duties 0"));
    assert.ok(input.includes("Complete duties 1") && input.includes("Complete duties 2"));
    assert.ok(!input.includes("Other-language summary"));
    for (const row of fixture.data.talent_external_evaluations) {
      assert.deepEqual(row.assessment.fit, expectedFit);
      assert.match(row.input_snapshot.evaluator, /^external-fit-questions-v9-summary-four-metrics:/);
    }
    const stored = copy(fixture.data.talent_external_evaluations);
    fixture.run.status = "queued";
    await runSearch();
    assert.equal(fixture.run.metrics.reused, 3);
    assert.equal(fixture.calls.length, 1);
    assert.deepEqual(fixture.data.talent_external_evaluations, stored);
    const page: any = await searchTool({ action: "read", runId: fixture.run.id });
    assert.equal(page.evaluations.length, 3);
    assert.ok(page.evaluations.every((row: any) => Object.keys(row.assessment.fit).length === 4));
  });
  await t.test("fills only missing candidate pay, records failures, and still evaluates published-only cards", async () => {
    fixture = new SearchFixture(4);
    Object.assign(fixture.rows[1], { salary_min: 100000, salary_max: 150000, salary_currency: "USD", salary_period: "year" });
    Object.assign(fixture.rows[2], { salary_min: 65432109, salary_max: 87654321, salary_currency: "KRW", salary_period: "year", salary_is_predicted: true });
    fixture.rows[3].salary_range = "Negotiable";
    await runSearch();
    assert.deepEqual(fixture.salaryCalls, [[fixture.rows[0].role_id]]);
    assert.equal(fixture.run.status, "completed");
    assert.equal(fixture.run.metrics.salaryFill.failed, 1);
    assert.equal(fixture.run.metrics.salaryFill.saved, 0);
    assert.equal(fixture.data.talent_external_evaluations.length, 4);
    assert.ok(fixture.calls.every(call => !/65432109|87654321/.test(call.input)));
  });
  await t.test(
    "cold and warm searches use batched DB calls, including the existing 500-row RPC boundary",
    async () => {
      for (const count of [100, 500, 501, 1001]) {
        fixture = new SearchFixture(count);
        fixture.data.external_recommendation_runs = [];
        const result: any = await searchTool();
        assert.equal(result.status, "completed");
        assert.equal(result.evaluations.length, 30);
        assert.equal(result.evaluationCount, count);
        assert.equal(result.remainingEvaluationCount, count - 30);
        assert.equal(result.evaluationCursor, result.evaluations.at(-1).id);
        for (const evaluation of fixture.data.talent_external_evaluations)
          assert.ok(!fixture.resultSqls[0].includes(evaluation.id));
        assert.equal(fixture.cacheSqls.length, Math.ceil(count / 500));
        const writes = fixture.queries.filter(
          (q) =>
            q.table === "talent_external_evaluations" && q.action === "upsert"
        );
        assert.equal(writes.length, Math.ceil(count / 10));
        assert.equal(
          writes.reduce((sum, q) => sum + q.count!, 0),
          count
        );
        assert.equal(fixture.contextLoads, 1);
        assert.deepEqual(
          fixture.queries
            .filter((q) => q.table === "talent_setting")
            .map((q) => q.columns),
          ["blocked_companies"]
        );
        assert.equal(
          fixture.queries.filter(
            (q) =>
              q.table === "talent_external_evaluations" && q.action === "read"
          ).length,
          0
        );
        const calls = fixture.calls.length,
          queries = fixture.queries.length;
        fixture.run.status = "queued";
        fixture.cacheSqls = [];
        await searchTool();
        assert.equal(fixture.run.status, "completed");
        assert.equal(fixture.run.metrics.reused, count);
        assert.equal(fixture.cacheSqls.length, Math.ceil(count / 500));
        assert.equal(fixture.calls.length, calls);
        assert.equal(fixture.contextLoads, 1);
        assert.equal(
          fixture.queries.slice(queries).filter((q) => q.action === "upsert")
            .length,
          0
        );
      }
    }
  );
  await t.test(
    "result read failures preserve the completed run and reading again never evaluates again",
    async () => {
      fixture = new SearchFixture(35);
      fixture.data.external_recommendation_runs = [];
      fixture.failResultRead = true;
      const result: any = await searchTool();
      assert.equal(result.status, "completed");
      assert.match(result.evaluationReadError, /Synthetic result read failure/);
      assert.equal(result.evaluations, undefined);
      assert.equal(fixture.run.evaluation_ids.length, 35);
      const rendered: any = withCompactTalentToolModelResult(
        "search_opportunities",
        result
      );
      assert.match(rendered.modelOutput, /results could not be read/);
      assert.doesNotMatch(rendered.modelOutput, /No evaluated roles/);
      const calls = fixture.calls.length;
      fixture.failResultRead = false;
      const page: any = await searchTool({
        action: "read",
        runId: result.runId,
      });
      assert.equal(page.evaluations.length, 30);
      assert.equal(page.remainingEvaluationCount, 5);
      const last: any = await searchTool({
        action: "read",
        runId: result.runId,
        cursor: page.evaluationCursor,
      });
      assert.equal(last.evaluations.length, 5);
      assert.equal(last.remainingEvaluationCount, 0);
      assert.equal(last.evaluationCursor, null);
      assert.equal(fixture.calls.length, calls);
    }
  );
  await t.test(
    "a mixed-conflict bulk insert preserves concurrent evidence and retrieves all conflict IDs in one read",
    async () => {
      fixture = new SearchFixture(10);
      fixture.data.external_recommendation_runs = [];
      let concurrent: any[] = [];
      fixture.beforeUpsert = (rows) => {
        concurrent = rows
          .filter((_, i) => i % 2 === 0)
          .map((row, i) => ({
            ...copy(row),
            id: id(5000 + i),
            run_id: id(900),
            assessment: {
              fit: { mutualFit: 72 },
              raw: "Immutable concurrent evidence",
            },
          }));
        fixture.data.talent_external_evaluations.push(...copy(concurrent));
        fixture.beforeUpsert = undefined;
      };
      const result: any = await searchTool();
      assert.equal(result.status, "completed");
      assert.equal(result.evaluations.length, 10);
      assert.equal(fixture.cacheSqls.length, 2);
      assert.equal(
        fixture.queries.filter((q) => q.action === "upsert").length,
        1
      );
      for (const row of concurrent) {
        assert.deepEqual(
          fixture.data.talent_external_evaluations.find((e) => e.id === row.id),
          row
        );
        assert.ok(fixture.run.evaluation_ids.includes(row.id));
      }
    }
  );
  await t.test(
    "failed bulk storage keeps other batches and resume evaluates only unsaved roles",
    async () => {
      fixture = new SearchFixture(12);
      fixture.data.external_recommendation_runs = [];
      fixture.failUpsert = (rows) =>
        rows.some((row) => row.role_id === id(111));
      const partial: any = await searchTool();
      assert.equal(partial.status, "partial");
      assert.equal(partial.evaluations.length, 10);
      assert.equal(partial.failures.length, 2);
      fixture.failUpsert = undefined;
      const result: any = await searchTool({
        action: "resume",
        runId: partial.runId,
      });
      assert.equal(result.status, "completed");
      assert.equal(result.evaluations.length, 12);
      assert.equal(fixture.calls.length, 3);
      assert.deepEqual(fixture.calls[2].ids, [id(110), id(111)]);
    }
  );
  await t.test(
    "execution reads current blocked companies and rejects a deleted user without reloading scoring context",
    async () => {
      fixture = new SearchFixture(1);
      fixture.data.talent_setting[0].blocked_companies = [
        "Newly blocked company",
      ];
      await runSearch();
      assert.deepEqual(fixture.searchBlocked, ["Newly blocked company"]);
      assert.equal(fixture.contextLoads, 0);
      fixture = new SearchFixture(1);
      fixture.data.talent_users[0].deleted_at = "2026-11-02";
      await runSearch();
      assert.equal(fixture.run.status, "failed");
      assert.match(fixture.run.error, /Talent is unavailable/);
      assert.equal(fixture.calls.length, 0);
      assert.equal(fixture.contextLoads, 0);
    }
  );
  await t.test(
    "generated bulk cache SQL matches exact owner, role and fingerprint in Postgres",
    async () => {
      fixture = new SearchFixture(2);
      fixture.data.external_recommendation_runs = [];
      await searchTool();
      const { PGlite } = await import("@electric-sql/pglite");
      const db = new PGlite();
      try {
        await db.exec(`CREATE TABLE public.talent_external_evaluations (
        id uuid PRIMARY KEY, talent_id uuid, role_id uuid, input_fingerprint text,
        UNIQUE(talent_id,role_id,input_fingerprint));`);
        const valid = fixture.data.talent_external_evaluations.map(
          ({ id, talent_id, role_id, input_fingerprint }) => ({
            id,
            talent_id,
            role_id,
            input_fingerprint,
          })
        );
        const rows = [
          ...valid,
          { ...valid[0], id: id(6000), talent_id: id(999) },
          { ...valid[0], id: id(6001), input_fingerprint: "older-input" },
          { ...valid[0], id: id(6002), role_id: id(777) },
        ];
        await db.query(
          `INSERT INTO public.talent_external_evaluations
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(id uuid,talent_id uuid,role_id uuid,input_fingerprint text)`,
          [JSON.stringify(rows)]
        );
        const result = await db.query<{ id: string }>(fixture.cacheSqls[0]);
        assert.deepEqual(
          result.rows.map((r) => r.id).sort(),
          valid.map((r) => r.id).sort()
        );
      } finally {
        await db.close();
      }
    }
  );
  await t.test(
    "search returns the first 30 assessments and remaining count without Worker preparation or a continuation",
    async () => {
      fixture = new SearchFixture(31);
      fixture.data.external_recommendation_runs = [];
      const raw: any = await searchTool();
      assert.equal(raw.status, "completed");
      assert.equal(raw.evaluations.length, 30);
      assert.equal(raw.evaluationCount, 31);
      assert.equal(raw.remainingEvaluationCount, 1);
      assert.equal(raw.evaluationCursor, raw.evaluations.at(-1).id);
      assert.equal(raw.careerContinuation, undefined);
      assert.deepEqual(fixture.queued, []);
      assert.deepEqual(fixture.data.talent_opportunity_recommendation, []);
      assert.equal(
        fixture.run.input_snapshot.behavior_context,
        "Stored behavior"
      );
      for (const call of fixture.calls) {
        assert.match(call.input, /Stored behavior/);
        assert.match(call.input, /Frozen complete Brief/);
        assert.match(call.input, /Full experience/);
      }
      const rendered: any = withCompactTalentToolModelResult(
        "search_opportunities",
        raw
      );
      assert.match(rendered.modelOutput, /status completed/);
      for (const e of raw.evaluations)
        assert.ok(rendered.modelOutput.includes(e.role_id));
      assert.doesNotMatch(
        rendered.modelOutput,
        /"input_snapshot"|"assessment"|"raw"/
      );
      const calls = fixture.calls.length;
      const repeated: any = await searchTool();
      assert.deepEqual(repeated.evaluations, raw.evaluations);
      assert.equal(fixture.calls.length, calls);
      assert.equal(fixture.data.external_recommendation_runs.length, 1);
    }
  );
  await t.test(
    "missing Behavior cache does not prevent a direct search",
    async () => {
      fixture = new SearchFixture(1);
      fixture.behavior = null;
      fixture.data.external_recommendation_runs = [];
      const raw: any = await searchTool();
      assert.equal(raw.status, "completed");
      assert.equal(raw.evaluations.length, 1);
      assert.deepEqual(fixture.queued, []);
    }
  );
  await t.test(
    "direct search and resume return partial and recovered results in the same call",
    async () => {
      fixture = new SearchFixture(12);
      fixture.data.external_recommendation_runs = [];
      fixture.evaluate = (ids) => {
        if (ids.includes(id(111)))
          throw new Error("Synthetic provider failure");
      };
      const partial: any = await searchTool();
      assert.equal(partial.status, "partial");
      assert.equal(partial.evaluations.length, 10);
      assert.equal(partial.failures.length, 2);
      fixture.evaluate = undefined;
      const resumed: any = await searchTool({
        action: "resume",
        runId: partial.runId,
      });
      assert.equal(resumed.status, "completed");
      assert.equal(resumed.evaluations.length, 12);
      assert.equal(fixture.calls.length, 3);
      assert.deepEqual(fixture.queued, []);
    }
  );
  await t.test(
    "concurrent replay waits for the existing execution without duplicate scoring",
    async () => {
      fixture = new SearchFixture(1);
      fixture.data.external_recommendation_runs = [];
      let release!: () => void, started!: () => void;
      const began = new Promise<void>((resolve) => {
        started = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      fixture.evaluate = async () => {
        started();
        await hold;
      };
      const first = searchTool();
      await began;
      const second = searchTool();
      release();
      const results: any[] = await Promise.all([first, second]);
      assert.equal(fixture.calls.length, 1);
      assert.equal(results[0].runId, results[1].runId);
      assert.equal(results[1].evaluations.length, 1);
    }
  );
  await t.test(
    "caller cancellation reaches scoring and stops further batches",
    async () => {
      fixture = new SearchFixture(60);
      fixture.data.external_recommendation_runs = [];
      const controller = new AbortController();
      fixture.evaluate = async (_ids, signal) => {
        assert.equal(signal, controller.signal);
        controller.abort(new Error("User stopped search"));
        signal?.throwIfAborted();
      };
      await assert.rejects(
        searchTool({}, controller.signal),
        /User stopped search/
      );
      assert.equal(fixture.run.status, "cancelled");
      assert.ok(fixture.calls.length <= 4);
      assert.deepEqual(fixture.queued, []);
    }
  );
  await t.test(
    "company-follow requests retain their background delivery contract",
    async () => {
      fixture = new SearchFixture(1);
      fixture.data.external_recommendation_runs = [];
      const result: any = await requestExternalMatchingSearch({
        admin: fixture.admin as any,
        userId: id(1),
        operationId: "follow",
        roleIds: [id(100)],
        sourceEvents: [{ sourceId: id(20) }],
      });
      assert.equal(result.status, "queued");
      assert.equal(result.careerContinuation.kind, "external_evaluation");
      assert.equal(fixture.queued.length, 1);
      assert.equal(fixture.calls.length, 0);
    }
  );
  await t.test(
    "the real request deadline returns saved partial results without treating it as user cancellation",
    async () => {
      fixture = new SearchFixture(12);
      fixture.data.external_recommendation_runs = [];
      fixture.evaluate = async (ids, signal) => {
        if (ids.includes(id(111))) await delay(1000, undefined, { signal });
      };
      const result: any = await searchTool({}, undefined, Date.now() + 100);
      assert.equal(result.status, "partial");
      assert.equal(result.evaluations.length, 10);
      assert.match(result.error, /deadline/);
      assert.equal(fixture.run.cancelled_at, undefined);
      assert.equal(result.careerContinuation, undefined);
      fixture.evaluate = undefined;
      const resumed: any = await searchTool({
        action: "resume",
        runId: result.runId,
      });
      assert.equal(resumed.status, "completed");
      assert.equal(resumed.evaluations.length, 12);
      assert.equal(fixture.calls.length, 3);
    }
  );
  await t.test(
    "the next original-agent provider request receives completed search evidence without another read or checkpoint",
    async (st) => {
      fixture = new SearchFixture(500);
      fixture.data.external_recommendation_runs = [];
      fixture.beforeUpsert = () => {
        fixture.rows[0].is_expired = true;
        fixture.rows[1].expires_at = "2000-01-01";
        fixture.rows[2].status = "closed";
      };
      const { runCareerChatAssistant } = await import("../llm");
      const { CareerCapabilityRuntime } =
        await import("../capabilities/runtime");
      const tool = CAREER_AGENTIC_TOOLS.search_opportunities;
      const tools = [
        {
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters as Record<string, unknown>,
          },
        },
      ];
      const runtime = new CareerCapabilityRuntime({
        mode: "full",
        eligibleTools: tools,
        promptArgs: () => ({
          channel: "chat",
          isOnboardingDone: true,
          profile: null,
          structuredProfileText: "Complete profile",
          talentContextSection: "",
        }),
        checkpoint: async () => {
          assert.fail("A completed direct search must not defer the reply");
        },
      });
      let requests = 0;
      st.mock.method(
        globalThis,
        "fetch",
        async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
          assert.ok(String(url).startsWith("https://api.openai.com/"));
          const body = JSON.parse(String(init?.body));
          requests++;
          assert.ok(requests <= 2);
          if (requests === 2) {
            const outputs = body.input.filter(
              (item: any) => item.type === "function_call_output"
            );
            assert.equal(outputs.length, 1);
            assert.match(outputs[0].output, /status completed/);
            assert.equal(
              (outputs[0].output.match(/- roleId: /g) ?? []).length,
              30
            );
            assert.match(outputs[0].output, /showing 30 of 497; 467 remaining/);
            assert.match(
              outputs[0].output,
              /Expired or closed roles excluded: 3/
            );
            const expired = fixture.data.talent_external_evaluations.filter(
              (e) => [id(100), id(101), id(102)].includes(e.role_id)
            );
            for (const e of expired) {
              assert.ok(!outputs[0].output.includes(e.id));
              assert.ok(!outputs[0].output.includes(e.role_id));
            }
            const ordered = fixture.data.talent_external_evaluations
              .filter((e) => !expired.some((x) => x.id === e.id))
              .sort((a, b) => a.id.localeCompare(b.id));
            for (const e of ordered.slice(0, 30))
              assert.ok(outputs[0].output.includes(e.role_id));
            for (const e of ordered.slice(30)) {
              assert.ok(!outputs[0].output.includes(e.id));
              assert.ok(!outputs[0].output.includes(e.role_id));
            }
            assert.doesNotMatch(
              outputs[0].output,
              /"input_snapshot"|"assessment"|"raw"/
            );
          }
          return Response.json({
            id: `direct-search-${requests}`,
            model: "gpt-6-luna",
            status: "completed",
            output:
              requests === 1
                ? [
                    {
                      type: "function_call",
                      call_id: "search",
                      name: "search_opportunities",
                      arguments: JSON.stringify({
                        source: "external",
                        matchingId: id(30),
                        roleIds: fixture.rows.map((row) => row.role_id),
                      }),
                    },
                  ]
                : [
                    {
                      type: "message",
                      role: "assistant",
                      content: [
                        {
                          type: "output_text",
                          text: "평가 결과를 확인했습니다.",
                        },
                      ],
                    },
                  ],
            usage: { input_tokens: 1, output_tokens: 1 },
          });
        }
      );
      const step = runtime.resolveStep(false);
      const answer = await runCareerChatAssistant({
        primaryModel: "gpt-6-luna",
        toolRuntime: runtime,
        tools: step.tools,
        systemBlocks: step.systemBlocks,
        messages: [{ role: "user", content: "외부 공고를 추천해줘" }],
        executeTool: async ({ name, input }) => {
          assert.equal(name, "search_opportunities");
          return searchTool(input);
        },
      });
      assert.equal(answer, "평가 결과를 확인했습니다.");
      assert.equal(requests, 2);
      assert.deepEqual(fixture.queued, []);
    }
  );
  await t.test(
    "zero results completes without scoring or publication",
    async () => {
      fixture = new SearchFixture(0);
      fixture.run.request.plan = copy(plan);
      await runSearch();
      assert.equal(fixture.run.status, "completed");
      assert.equal(fixture.calls.length, 0);
      assert.deepEqual(fixture.run.evaluation_ids, []);
      assert.ok(fixture.run.completion_notified_at);
      assert.deepEqual(fixture.data.talent_opportunity_recommendation, []);
    }
  );
  await t.test(
    "partial batch failure retains receipts and retry scores only missing roles",
    async () => {
      fixture = new SearchFixture(12);
      fixture.evaluate = (ids) => {
        if (ids.includes(id(111)))
          throw new Error("Synthetic provider failure");
      };
      await runSearch();
      assert.equal(fixture.run.status, "partial");
      assert.equal(fixture.run.evaluation_ids.length, 10);
      fixture.evaluate = undefined;
      fixture.run.status = "queued";
      await runSearch();
      assert.equal(fixture.run.status, "completed");
      assert.equal(fixture.run.evaluation_ids.length, 12);
      assert.equal(fixture.run.metrics.reused, 10);
      assert.equal(fixture.calls.length, 3);
      assert.equal(fixture.calls[2].ids.length, 2);
      for (const call of fixture.calls) {
        for (const fact of [
          "Complete profile",
          "Full experience",
          "Frozen complete Brief",
          "Frozen behavior",
          "Full leadership evidence",
        ])
          assert.ok(call.input.includes(fact), fact);
        assert.ok(!call.input.includes("Changed current Brief"));
      }
    }
  );
  await t.test(
    "cancellation preserves completed receipts and resume reuses them",
    async () => {
      fixture = new SearchFixture(2);
      fixture.evaluate = () => {
        fixture.run.cancelled_at = "2026-10-30";
        fixture.run.status = "cancelled";
      };
      await runSearch();
      assert.equal(fixture.run.status, "cancelled");
      assert.equal(fixture.run.evaluation_ids.length, 2);
      fixture.evaluate = undefined;
      fixture.run.cancelled_at = null;
      fixture.run.status = "queued";
      await runSearch();
      assert.equal(fixture.run.status, "completed");
      assert.equal(fixture.calls.length, 1);
      assert.equal(fixture.run.metrics.reused, 2);
    }
  );
  await t.test(
    "source edits and selected profile revision invalidate exact scoring cache while originals stay immutable",
    async () => {
      fixture = new SearchFixture(1);
      await runSearch();
      const original = copy(fixture.data.talent_external_evaluations[0]);
      fixture.rows[0].description = "Changed exact role duties";
      fixture.run.status = "queued";
      await runSearch();
      assert.equal(fixture.calls.length, 2);
      assert.equal(fixture.run.evaluation_ids.length, 2);
      assert.deepEqual(fixture.data.talent_external_evaluations[0], original);
      assert.notEqual(
        fixture.data.talent_external_evaluations[1].input_fingerprint,
        original.input_fingerprint
      );
      fixture.data.external_recommendation_runs = [
        {
          ...copy(fixture.run),
          id: id(11),
          status: "queued",
          evaluation_ids: [],
          request: { ...fixture.run.request, profileRevision: 4 },
        },
      ];
      await runSearch();
      assert.equal(fixture.calls.length, 3);
      assert.equal(
        fixture.data.talent_external_evaluations[2].input_snapshot
          .profileRevision,
        4
      );
    }
  );
  await t.test(
    "unfollow, new follow revision, or newer source cancels before evaluation",
    async () => {
      for (const follow of [
        null,
        { revision: 3 },
        { revision: 2, unfollowed_at: "2026-10-30" },
        { revision: 2, scan_state: { latestSourceKey: "newer" } },
      ]) {
        fixture = new SearchFixture(1);
        fixture.run.request.sourceEvents = [
          {
            sourceId: id(20),
            revision: 2,
            sourceKey: "old",
            roleIds: [id(100)],
          },
        ];
        fixture.data.talent_company_follow = follow
          ? [{ id: id(20), talent_id: id(1), ...follow }]
          : [];
        await runSearch();
        assert.equal(fixture.run.status, "cancelled");
        assert.equal(fixture.calls.length, 0);
      }
    }
  );
  await t.test(
    "actual registered read tool exposes partial failures, role IDs and pagination as text",
    async () => {
      fixture = new SearchFixture(12);
      fixture.evaluate = (ids) => {
        if (ids.includes(id(111)))
          throw new Error("Synthetic provider failure");
      };
      await runSearch();
      const { CAREER_AGENTIC_TOOLS } = await import("../generalTools");
      const { withCompactTalentToolModelResult } =
        await import("@/lib/talentOnboarding/toolModelResult");
      const raw = await CAREER_AGENTIC_TOOLS.search_opportunities.execute!(
        {
          source: "external",
          action: "read",
          runId: fixture.run.id,
          limit: 1,
          userId: id(999),
        },
        { admin: fixture.admin as any, userId: id(1), conversationId: id(8) }
      );
      const rendered = withCompactTalentToolModelResult(
        "search_opportunities",
        raw
      ) as any;
      assert.equal(rendered.status, "partial");
      assert.equal(rendered.evaluations.length, 1);
      assert.match(
        rendered.modelOutput,
        /Private assessment \(reasoning-only\)/
      );
      assert.match(rendered.modelOutput, /Frozen complete Brief/);
      assert.match(rendered.modelOutput, /Synthetic provider failure/);
      assert.ok(rendered.modelOutput.includes(rendered.evaluations[0].role_id));
      assert.ok(
        rendered.modelOutput.includes(
          `evaluationCursor: ${rendered.evaluationCursor}`
        )
      );
      assert.doesNotMatch(
        rendered.modelOutput,
        /"input_snapshot"|"assessment"|"raw"/
      );
    }
  );
  await t.test("scheduled follow preparation queues exact IDs and reuses historical non-fit despite profile changes", async () => {
    fixture = new SearchFixture(2);
    fixture.data.external_recommendation_runs=[];
    fixture.data.opportunity_discovery_run=[{id:id(80),talent_id:id(1),status:"handed_off",trigger_payload:{runContract:"career_agent_v1",sourceEvents:[]}}];
    fixture.data.talent_external_evaluations=[{id:id(90),talent_id:id(1),role_id:id(100),input_fingerprint:"older-profile",assessment:{fit:{mutualFit:2}}}];
    fixture.profile.revision=99;
    const queued:any=await requestExternalMatchingSearch({admin:fixture.admin as any,userId:id(1),operationId:"follow-only",roleIds:[id(100),id(101)],preparationRunId:id(80)});
    assert.equal(queued.status,"queued");assert.equal(fixture.calls.length,0);assert.equal(fixture.queued.length,1);
    await runSearch();
    assert.equal(fixture.run.status,"completed");
    assert.deepEqual(fixture.calls.flatMap(call=>call.ids),[id(101)]);
    assert.equal(fixture.retrievalCalls,0);
    assert.equal(fixture.run.request.replyId,undefined);
    assert.equal(fixture.run.request.sourceEvents,undefined);
  });
  await t.test("empty or no-longer-followed scope never falls through to global retrieval", async () => {
    fixture = new SearchFixture(2);
    fixture.autoScope=[];
    fixture.run.request.preparationRunId=id(80);
    fixture.data.opportunity_discovery_run=[{id:id(80),talent_id:id(1),status:"handed_off",trigger_payload:{runContract:"career_agent_v1",sourceEvents:[]}}];
    await runSearch();
    assert.equal(fixture.run.status,"completed");assert.equal(fixture.calls.length,0);assert.equal(fixture.retrievalCalls,0);
    assert.deepEqual(fixture.run.candidate_role_ids,[]);
  });

});
