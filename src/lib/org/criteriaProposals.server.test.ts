import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import { before, beforeEach, test } from "node:test";

// The consolidation job, the To-do read and the answer path with the database
// replaced. The Brief save is a recorded stand-in; no model or network runs.
type Rpc = { name: string; args: Record<string, any> };
const rpcs: Rpc[] = [];
let rpcResults: Record<string, (args: Record<string, any>) => unknown> = {};
const tables: Record<string, Array<Record<string, any>>> = {};
const updates: Array<{ table: string; values: Record<string, any>; filters: Array<[string, unknown]> }> = [];

function query(table: string) {
  const filters: Array<[string, string, unknown]> = [];
  let order: { column: string; ascending: boolean } | null = null;
  let limit = Infinity;
  let patch: Record<string, any> | null = null;
  const run = () => {
    if (patch) {
      updates.push({ table, values: patch, filters: filters.map(([, column, value]) => [column, value]) });
      return { data: null, error: null };
    }
    let rows = (tables[table] ?? []).filter((row) =>
      filters.every(([op, column, value]) => (op === "eq" ? row[column] === value : String(row[column]) > String(value)))
    );
    if (order) {
      const { column, ascending } = order;
      rows = [...rows].sort((a, b) => (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1));
    }
    return { data: rows.slice(0, limit), error: null };
  };
  const builder: any = {
    select: () => builder,
    update: (values: Record<string, any>) => ((patch = values), builder),
    eq: (column: string, value: unknown) => (filters.push(["eq", column, value]), builder),
    gt: (column: string, value: unknown) => (filters.push(["gt", column, value]), builder),
    order: (column: string, options?: { ascending?: boolean }) => ((order = { column, ascending: options?.ascending !== false }), builder),
    limit: (count: number) => ((limit = count), builder),
    maybeSingle: async () => {
      const { data } = run();
      return { data: (data as any[])[0] ?? null, error: null };
    },
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}

const admin: any = {
  from: (table: string) => query(table),
  rpc: async (name: string, args: Record<string, any>) => {
    rpcs.push({ name, args });
    const handler = rpcResults[name];
    return { data: handler ? handler(args) : null, error: null };
  },
};

const workspaceId = "workspace";
const roleId = "role";
const user = { id: "kim" } as any;
const now = new Date("2026-11-07T00:00:00Z");
const criteria = [
  { id: "c-go", name: "Go 서비스 운영", criteria: "Go로 운영", requirement: "preferred", importance: 2 },
  { id: "c-lead", name: "리드 경험", criteria: "팀을 이끌어 봄", requirement: "preferred", importance: 1 },
];
const passes = (count: number, tags: string[], start = 100) =>
  Array.from({ length: count }, (_, index) => ({
    id: start - index,
    subjectId: `talent-${start - index}`,
    reasonTags: tags,
    hasReasonText: index % 2 === 0,
    createdAt: now.toISOString(),
  }));
const input = (overrides: Record<string, unknown> = {}) => ({
  roleId,
  workspaceId,
  open: true,
  criteria,
  cursor: 90,
  briefRevision: 3,
  decisions: passes(4, ["c-go"]),
  pending: null,
  answeredKeys: [],
  ...overrides,
});
const called = (name: string) => rpcs.filter((call) => call.name === name);

type Server = typeof import("./criteriaProposals.server");
let server: Server;
before(async () => {
  const mod = Module as any;
  const original = mod._load;
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request === "server-only" ? {} : original.call(this, request, parent, isMain);
  };
  try {
    server = await import("./criteriaProposals.server");
  } finally {
    mod._load = original;
  }
});

beforeEach(() => {
  rpcs.length = 0;
  updates.length = 0;
  rpcResults = {};
  for (const key of Object.keys(tables)) delete tables[key];
});

test("the dispatcher queues nothing while suggestions are off", async () => {
  assert.equal(await server.enqueueDueCriteriaConsolidations({ admin }), 0);
  assert.equal(rpcs.length, 0);
  rpcResults.enqueue_due_company_decision_consolidations_v1 = () => 2;
  assert.equal(await server.enqueueDueCriteriaConsolidations({ admin, enabled: true }), 2);
  assert.deepEqual(rpcs[0].args, { p_every: 3, p_limit: 20, p_wait_days: 7 });
  // The job itself does nothing while off either.
  assert.deepEqual(await server.runCriteriaConsolidation({ admin, roleId, workspaceId }), {
    status: "off",
    throughDecisionId: null,
  });
  assert.equal(rpcs.length, 1);
});

test("a supported change becomes one suggestion; the cursor moves past what was read", async () => {
  rpcResults.company_decision_consolidation_input_v1 = () => input();
  rpcResults.create_company_brief_proposal_v1 = () => ({ status: "created", proposalId: "proposal-1" });
  const result = await server.runCriteriaConsolidation({
    admin, roleId, workspaceId, enabled: true, locale: "ko", now, throughDecisionId: 120,
  });
  assert.deepEqual(result, { proposalId: "proposal-1", status: "proposed", throughDecisionId: 120 });
  const [create] = called("create_company_brief_proposal_v1");
  assert.equal(create.args.p_kind, "criteria_refinement");
  assert.equal(create.args.p_content_key, "criterion_level:c-go:important>required");
  assert.equal(create.args.p_base_brief_revision, 3);
  assert.equal(create.args.p_expires_at, "2026-11-21T00:00:00.000Z");
  assert.equal(create.args.p_preview, "Go 서비스 운영: 중요 → 필수");
  assert.match(create.args.p_summary, /^'Go 서비스 운영' 기준을 중요에서 필수로 올릴까요\? 최근 이유를 남기고 넘긴 후보 4명 중 4명/);
  assert.deepEqual(create.args.p_payload.change, {
    type: "criterion_level", criterionKey: "c-go", criterionName: "Go 서비스 운영", from: "important", to: "required",
  });
  assert.equal(create.args.p_payload.locale, "ko");
  // Reason texts are never read: the input only says whether one exists.
  assert.equal(JSON.stringify(create.args).includes("hasReasonText"), false);
  assert.deepEqual(called("consume_company_decisions_v1").map((call) => call.args), [
    { p_role_id: roleId, p_through_id: 120 },
  ]);
});

test("a pending suggestion waits; a stale one is closed first; an ended Role is only read", async () => {
  const pending = {
    id: "pending-1",
    expiresAt: "2026-11-10T00:00:00Z",
    payload: {
      version: 1,
      change: { type: "criterion_level", criterionKey: "c-lead", criterionName: "리드 경험", from: "nice", to: "important" },
      evidence: { count: 3, window: 5, decisionIds: [1, 2, 3] },
    },
  };
  rpcResults.company_decision_consolidation_input_v1 = () => input({ pending });
  assert.equal((await server.runCriteriaConsolidation({ admin, roleId, workspaceId, enabled: true, locale: "ko", now })).status, "pending");
  assert.equal(called("create_company_brief_proposal_v1").length, 0);
  assert.equal(called("consume_company_decisions_v1")[0].args.p_through_id, 100);

  // The team raised the criterion meanwhile: the old suggestion is stale.
  rpcs.length = 0;
  const raised = [criteria[0], { ...criteria[1], importance: 2 }];
  rpcResults.company_decision_consolidation_input_v1 = () => input({ pending, criteria: raised });
  rpcResults.resolve_company_brief_proposal_v1 = () => ({ status: "stale" });
  rpcResults.create_company_brief_proposal_v1 = () => ({ status: "created", proposalId: "proposal-2" });
  const after = await server.runCriteriaConsolidation({ admin, roleId, workspaceId, enabled: true, locale: "en", now });
  assert.equal(after.status, "proposed");
  assert.deepEqual(called("resolve_company_brief_proposal_v1")[0].args, {
    p_action: "stale", p_actor_user_id: null, p_detail: {}, p_proposal_id: "pending-1", p_role_id: roleId, p_workspace_id: workspaceId,
  });
  assert.match(called("create_company_brief_proposal_v1")[0].args.p_summary, /^Raise 'Go 서비스 운영' from Important to Required\?/);

  // Someone is applying it right now: leave it.
  rpcs.length = 0;
  rpcResults.resolve_company_brief_proposal_v1 = () => ({ status: "busy" });
  assert.equal((await server.runCriteriaConsolidation({ admin, roleId, workspaceId, enabled: true, locale: "ko", now })).status, "pending");
  assert.equal(called("create_company_brief_proposal_v1").length, 0);

  rpcs.length = 0;
  rpcResults.company_decision_consolidation_input_v1 = () => input({ open: false });
  assert.equal((await server.runCriteriaConsolidation({ admin, roleId, workspaceId, enabled: true, locale: "ko", now })).status, "skipped");
  assert.deepEqual(called("create_company_brief_proposal_v1"), []);
  assert.equal(called("consume_company_decisions_v1").length, 1);

  // Another workspace's Role is never read further.
  rpcs.length = 0;
  rpcResults.company_decision_consolidation_input_v1 = () => input({ workspaceId: "other" });
  assert.equal((await server.runCriteriaConsolidation({ admin, roleId, workspaceId, enabled: true, locale: "ko", now })).status, "skipped");
  assert.equal(called("consume_company_decisions_v1").length, 0);
});

test("the queued job completes silently under its lease", async () => {
  const job = {
    id: "job-1", role_id: roleId, company_workspace_id: workspaceId, locked_by: "worker-1",
    action_context: { roleId, throughDecisionId: 100 },
  };
  const result = await server.runQueuedCriteriaConsolidation({ admin, job, usage: { calls: 0 }, now });
  assert.equal(result.status, "off");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].table, "company_agent_web_action_jobs");
  assert.equal(updates[0].values.status, "completed_silent");
  assert.deepEqual(updates[0].values.usage, { calls: 0 });
  assert.deepEqual(updates[0].filters, [["id", "job-1"], ["status", "processing"], ["locked_by", "worker-1"]]);
});

test("the To-do shows the open suggestion under Harper's suggestions, in the reader's language", async () => {
  tables.company_agent_update_proposals = [
    {
      id: "p-1", workspace_id: workspaceId, scope_key: `brief:${roleId}`, status: "pending",
      expires_at: "2026-11-20T00:00:00Z", created_at: "2026-11-06T00:00:00Z",
      payload: {
        version: 1,
        change: { type: "criterion_level", criterionKey: "c-go", criterionName: "Go", from: "important", to: "required" },
        evidence: { count: 7, window: 10, decisionIds: [] },
        claim: { by: "lee", at: "2026-11-06T00:00:00Z" },
      },
    },
    { id: "p-2", workspace_id: workspaceId, scope_key: `brief:${roleId}`, status: "pending", expires_at: "2026-11-20T00:00:00Z",
      created_at: "2026-11-05T00:00:00Z", payload: { changes: [] } },
    { id: "p-3", workspace_id: workspaceId, scope_key: `brief:${roleId}`, status: "pending", expires_at: "2026-11-01T00:00:00Z",
      created_at: "2026-10-01T00:00:00Z", payload: {} },
    { id: "p-4", workspace_id: workspaceId, scope_key: "chat:conversation", status: "pending", expires_at: "2026-11-20T00:00:00Z",
      created_at: "2026-11-06T00:00:00Z", payload: {} },
  ];
  const items = await server.readRoleCriteriaProposalItems({ admin, workspaceId, roleId, locale: "en", now });
  assert.deepEqual(items, [
    {
      id: "criteria:p-1",
      column: "suggestion",
      kind: "criteria_proposal",
      at: "2026-11-06T00:00:00Z",
      detail: "Raise 'Go' from Important to Required? It was the reason for 7 of your last 10 passes with a reason.",
      source: "harper",
    },
  ]);
});

test("accepting saves the change through the Brief and records it; dismissing records it", async () => {
  const saved: Array<Record<string, any>> = [];
  const save = async (args: Record<string, any>) => {
    saved.push(args);
  };
  const payload = {
    version: 1,
    change: { type: "criterion_level", criterionKey: "c-go", criterionName: "Go 서비스 운영", from: "important", to: "required" },
    evidence: { count: 7, window: 10, decisionIds: [1] },
    locale: "ko",
  };
  tables.company_internal_roles = [{ role_id: roleId, criteria }];
  tables.company_role_brief_revisions = [
    { role_id: roleId, revision: 3 },
    { role_id: roleId, revision: 4 },
  ];
  const statuses: Record<string, unknown> = { claim: { status: "claimed", payload }, apply: { status: "applied", decisionId: 55 } };
  rpcResults.resolve_company_brief_proposal_v1 = (args) => statuses[args.p_action] ?? { status: "pending" };
  const accepted = await server.answerCriteriaProposal({
    admin, user, workspaceId, roleId, proposalId: "p-1", action: "accept", now, saveCriteria: save as any,
  });
  assert.deepEqual(accepted, { status: "applied", briefRevision: 4, decisionId: 55 });
  assert.deepEqual(called("resolve_company_brief_proposal_v1").map((call) => [call.args.p_action, call.args.p_actor_user_id]), [
    ["claim", "kim"], ["apply", "kim"],
  ]);
  assert.deepEqual(called("resolve_company_brief_proposal_v1")[1].args.p_detail, { briefRevision: 4 });
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].expectedCriteria, criteria);
  assert.deepEqual(saved[0].criteria[0], {
    ...criteria[0], requirement: "must", importance: 3,
    changeReason: "넘긴 이유 반영 (10명 중 7명)", changedAt: now.toISOString(),
  });
  assert.deepEqual(saved[0].criteria[1], criteria[1]);
  assert.equal(saved[0].user, user);

  // The criterion changed meanwhile: nothing is saved and the suggestion closes.
  rpcs.length = 0;
  tables.company_internal_roles = [{ role_id: roleId, criteria: [{ ...criteria[0], requirement: "must", importance: 3 }] }];
  await assert.rejects(
    server.answerCriteriaProposal({ admin, user, workspaceId, roleId, proposalId: "p-1", action: "accept", now, saveCriteria: save as any }),
    (error: any) => error.status === 409 && /바뀌어/.test(error.message)
  );
  assert.deepEqual(called("resolve_company_brief_proposal_v1").map((call) => call.args.p_action), ["claim", "stale"]);
  assert.equal(saved.length, 1);

  // A failed save releases the claim and reports the failure.
  rpcs.length = 0;
  tables.company_internal_roles = [{ role_id: roleId, criteria }];
  await assert.rejects(
    server.answerCriteriaProposal({
      admin, user, workspaceId, roleId, proposalId: "p-1", action: "accept", now,
      saveCriteria: async () => { throw Object.assign(new Error("그사이 기준이 바뀌었어요."), { status: 409 }); },
    }),
    /그사이/
  );
  assert.deepEqual(called("resolve_company_brief_proposal_v1").map((call) => call.args.p_action), ["claim", "release"]);

  // Someone else is applying it, or it was already answered.
  rpcs.length = 0;
  statuses.claim = { status: "busy" };
  await assert.rejects(
    server.answerCriteriaProposal({ admin, user, workspaceId, roleId, proposalId: "p-1", action: "accept", now, saveCriteria: save as any }),
    (error: any) => error.status === 409
  );
  statuses.reject = { status: "applied" };
  await assert.rejects(
    server.answerCriteriaProposal({ admin, user, workspaceId, roleId, proposalId: "p-1", action: "dismiss", now }),
    (error: any) => error.status === 409 && /이미 답한/.test(error.message)
  );
  statuses.reject = { status: "not_found" };
  await assert.rejects(
    server.answerCriteriaProposal({ admin, user, workspaceId, roleId, proposalId: "p-1", action: "dismiss", now }),
    (error: any) => error.status === 404
  );
  statuses.reject = { status: "rejected", decisionId: 56 };
  assert.deepEqual(
    await server.answerCriteriaProposal({ admin, user, workspaceId, roleId, proposalId: "p-1", action: "dismiss", now }),
    { status: "rejected", decisionId: 56 }
  );
  assert.equal(saved.length, 1);
});

test("the queue consumer counts without a model run; the dispatcher's call cannot stall other work", () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const consumer = source("./agent/webActionProcessor.server.ts");
  const branch = consumer.indexOf('job.action_name === "consolidate_decisions"');
  assert.ok(branch > 0);
  assert.ok(branch < consumer.indexOf("admin.auth.admin.getUserById(job.actor_user_id)"));
  assert.ok(branch < consumer.indexOf("runOrgAgentWebActionTurn(turnArgs)"));
  assert.match(consumer.slice(branch, branch + 400), /runQueuedCriteriaConsolidation\([\s\S]*return;/);
  const dispatch = source("../../app/api/internal/org-agent/web-action-dispatch/route.ts");
  assert.match(dispatch, /try \{\s*const \{ enqueueDueCriteriaConsolidations \}[\s\S]*?\} catch \(error\) \{/);
});
