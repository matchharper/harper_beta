import assert from "node:assert/strict";
import Module from "node:module";
import test, { type TestContext } from "node:test";

/** Server modules need env-built clients and Next's server-only marker; fixtures only, nothing is contacted. */
function serverModules(t: TestContext, env: Record<string, string> = {}) {
  const nodeModule = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const load = nodeModule._load;
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: "https://fixture.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key", SUPABASE_SERVICE_ROLE_KEY: "fixture-key", OPENAI_API_KEY: "unused-fixture-key", ...env })) {
    const before = process.env[key];
    process.env[key] = key in env ? value : before ?? value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  t.mock.method(nodeModule, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    return name === "server-only" ? {} : load.call(this, name, ...args);
  });
}

type Call = { table: string; op: string; patch?: Record<string, unknown>; filters: unknown[][] };

/** Supabase-shaped fake: every chain ends in `respond(call)`; calls are recorded in order. */
function fakeAdmin(respond: (call: Call) => unknown) {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      const finish = () => { calls.push(call); return Promise.resolve({ data: respond(call), error: null }); };
      const builder: object = new Proxy({}, {
        get(_target, key) {
          if (key === "then") return (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => finish().then(resolve, reject);
          if (key === "maybeSingle" || key === "single") return finish;
          return (...args: unknown[]) => {
            if (key === "update" || key === "upsert" || key === "insert") { call.op = String(key); call.patch = args[0] as Record<string, unknown>; }
            else if (key !== "select") call.filters.push([String(key), ...args]);
            return builder;
          };
        },
      });
      return builder;
    },
  };
  return { admin: admin as never, calls };
}

async function run(t: TestContext, companyDecision: string | null, env: Record<string, string>) {
  serverModules(t, env);
  const { processExternalCandidateReply } = await import("./externalReply");
  const { externalReplyDomain } = await import("@/lib/org/agent/externalInvite");
  const fake = fakeAdmin((call) => {
    if (call.table === "external_intro_requests" && call.op === "select") {
      return { id: "q1", status: "invited", recipient_email: "ada@example.com", external_candidate_id: "c1",
        company_workspace_id: "w1", role_id: "r1", result: {} };
    }
    if (call.table === "external_candidate_replies" && call.op === "select") {
      return { id: "rep1", reply_type: "interested", summary: "Wants to hear more.", created_at: "2026-11-02T08:00:00Z" };
    }
    if (call.table === "external_candidates") return { name: "Ada Kim", linkedin_url: null, company_decision: companyDecision };
    if (call.table === "company_roles") return { name: "Product Engineer" };
    return { id: "x" };
  });
  const notices: unknown[] = [];
  await processExternalCandidateReply({
    admin: fake.admin, job: { id: "job1" }, owner: "worker-1", inbound: {}, received: {} as never,
    body: "Sounds interesting, tell me more.", subject: "Re: Product Engineer", sender: "ada@example.com",
    recipients: [`candidate+fixturetoken0001@${externalReplyDomain()}`],
  }, { notify: (async (input: unknown) => { notices.push(input); return { jobId: "n1" }; }) as never });
  return { notices, calls: fake.calls };
}

test("a reply is recorded and the company is told how the person answered", async (t) => {
  const { notices, calls } = await run(t, "intro_requested", { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*" });
  assert.equal(notices.length, 1);
  const status = calls.find((call) => call.table === "external_intro_requests" && call.op === "update");
  assert.equal(status?.patch?.status, "replied");
  assert.equal(status?.patch?.reply_type, "interested");
  const notice = calls.find((call) => call.table === "external_candidate_replies" && call.op === "update");
  assert.equal((notice?.patch?.company_notice as { status?: string }).status, "sent");
});

test("after the company passed, a reply is kept but the company is not told", async (t) => {
  const { notices, calls } = await run(t, "passed", { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*" });
  assert.equal(notices.length, 0);
  const notice = calls.find((call) => call.table === "external_candidate_replies" && call.op === "update");
  assert.deepEqual(notice?.patch?.company_notice, { status: "skipped", reason: "company_passed" });
  const job = calls.at(-1);
  assert.equal(job?.patch?.skip_reason, "external_candidate_reply_recorded");
});

test("a workspace without the feature is not told either", async (t) => {
  const { notices, calls } = await run(t, null, { ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "" });
  assert.equal(notices.length, 0);
  const notice = calls.find((call) => call.table === "external_candidate_replies" && call.op === "update");
  assert.deepEqual(notice?.patch?.company_notice, { status: "skipped", reason: "not_enabled" });
});
