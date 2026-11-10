import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, test } from "node:test";

type Job = Record<string, any>;
let jobs: Job[] = [];
let afterRead: (() => void) | undefined;
let onPublish: (() => Promise<void>) | undefined;
const publications: any[] = [];
const admin = {
  rpc: async (name: string) => ({ data: name === "recover_company_agent_web_action_jobs_v1" ? 0 : [], error: null }),
  from: () => {
    let patch: Job | undefined;
    let single = false;
    let limit = Infinity;
    const filters: Array<(job: Job) => boolean> = [];
    const query: any = {
      select: () => query,
      update: (value: Job) => { patch = value; return query; },
      eq: (key: string, value: any) => { filters.push(job => job[key] === value); return query; },
      in: (key: string, values: any[]) => { filters.push(job => values.includes(job[key])); return query; },
      lt: (key: string, value: any) => { filters.push(job => job[key] < value); return query; },
      order: () => query,
      limit: (value: number) => { limit = value; return query; },
      maybeSingle: () => { single = true; return query; },
      then: (resolve: any, reject: any) => {
        const selected = jobs.filter(job => filters.every(filter => filter(job))).slice(0, limit);
        if (patch) for (const job of selected) Object.assign(job, patch);
        const data = selected.map(job => ({ ...job }));
        if (!patch && afterRead) { const run = afterRead; afterRead = undefined; run(); }
        return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
};
let turn: typeof import("./webActionTurn");
let processor: typeof import("./webActionProcessor.server");
let queue: typeof import("./webActionQueue");
before(async () => {
  const mod = Module as any;
  const original = mod._load;
  const mocks: Record<string, any> = {
    "server-only": {},
    "@vercel/queue": { send: async (...args: any[]) => { publications.push(args); await onPublish?.(); return { messageId: `receipt-${publications.length}` }; } },
    "../requestScope.server": { deferOrgResponseWork: () => false },
    "@/lib/org/stageTiming.server": { traceStageStep: (_: string, run: () => unknown) => run() },
    "@/lib/org/agent/store": {},
    "@/lib/org/agent/webActionConversation": {},
    "@/lib/server/candidateAccess": { getSupabaseAdmin: () => admin },
    "./scheduledMatching.server": {},
    "@/lib/agentContacts/store": { AgentContactSupersededError: class extends Error {} },
    "@/lib/agentContacts/executionBudget": { AgentContactBudgetBusyError: class extends Error {}, AgentContactBudgetExhaustedError: class extends Error {} },
    "./contactEvent.server": {},
    "@/lib/org/server": {},
    "./chat": { OrgAgentWebActionSupersededError: class extends Error {} },
    "./proactiveReview.server": {},
    "./companyMessageDelivery.server": {},
    "./roleSearchKickoff.server": {},
    "@/lib/llm/usageContext": {},
    "@/lib/llm/runUsage": {},
  };
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request in mocks ? mocks[request] : original.call(this, request, parent, isMain);
  };
  try {
    queue = await import("./webActionQueue");
    mocks["@/lib/org/agent/webActionQueue"] = queue;
    turn = await import("./webActionTurn");
    mocks["./webActionTurn"] = turn;
    mocks["./webActionQueue"] = queue;
    processor = await import("./webActionProcessor.server");
  } finally { mod._load = original; }
});
beforeEach(() => {
  jobs = [{ id: "job", status: "queued", attempt_count: 0, action_context: {},
    queue_dispatch_status: "dispatched", queue_dispatch_attempt_count: 0,
    queue_dispatched_at: "2020-01-01T00:00:00.000Z", updated_at: "2020-01-01T00:00:00.000Z" }];
  publications.length = 0; afterRead = undefined; onPublish = undefined;
});

test("waiting for a preceding turn remains recoverable after SDK redeliveries end", async () => {
  for (let delivery = 0; delivery < 11; delivery++) {
    await assert.rejects(processor.processCompanyAgentWebActionJob(
      { jobId: "job", kind: "web_action_job", version: 1 }, { messageId: `delivery-${delivery}` }
    ), processor.WebActionQueueRetryError);
  }
  assert.equal(jobs[0].status, "queued");
  assert.equal(jobs[0].attempt_count, 0);
  assert.equal(jobs[0].queue_dispatch_status, "pending");
  assert.ok(Date.parse(jobs[0].queue_next_attempt_at) > Date.now());
  // The existing cron can publish the same job under a fresh transport receipt.
  await turn.dispatchOrgAgentWebActionJob({ admin: admin as any, jobId: "job" });
  assert.equal(publications[0][1].jobId, "job");
  assert.equal(publications[0][2].idempotencyKey, undefined);
});

test("batching delays also retain a durable wake-up", async () => {
  jobs[0].action_context.batchUntil = new Date(Date.now() + 45_000).toISOString();
  await assert.rejects(processor.processCompanyAgentWebActionJob(
    { jobId: "job", kind: "web_action_job", version: 1 }, { messageId: "batch" }
  ), processor.WebActionQueueRetryError);
  assert.equal(jobs[0].queue_dispatch_status, "pending");
  assert.equal(jobs[0].attempt_count, 0);
});

test("a late publisher cannot overwrite the consumer's durable deferral", async () => {
  onPublish = async () => {
    await turn.markOrgAgentWebActionQueueDispatched("job");
    await turn.deferOrgAgentWebActionQueue("job", 5);
  };
  await turn.dispatchOrgAgentWebActionJob({ admin: admin as any, jobId: "job" });
  assert.equal(jobs[0].queue_dispatch_status, "pending");
});

test("unclaimed lost publications recover; fresh, running and completed jobs do not", async () => {
  const old = { ...jobs[0] };
  jobs.push({ ...old, id: "fresh", queue_dispatched_at: new Date().toISOString() },
    { ...old, id: "running", status: "processing" },
    { ...old, id: "done", status: "completed_message" });
  assert.equal(await turn.recoverOrgAgentWebActionJobs(admin as any), 1);
  assert.equal(jobs[0].queue_dispatch_status, "pending");
  for (const job of jobs.slice(1)) assert.equal(job.queue_dispatch_status, "dispatched");
});

test("recovery rechecks the claim after its read", async () => {
  afterRead = () => { jobs[0].status = "processing"; };
  assert.equal(await turn.recoverOrgAgentWebActionJobs(admin as any), 0);
  assert.equal(jobs[0].queue_dispatch_status, "dispatched");
});

test("deferring an old delivery does not change a running or completed job", async () => {
  for (const status of ["processing", "completed_message"]) {
    jobs[0].status = status;
    await turn.deferOrgAgentWebActionQueue("job", 5);
    assert.equal(jobs[0].status, status);
    assert.equal(jobs[0].queue_dispatch_status, "dispatched");
  }
});
