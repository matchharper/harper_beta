import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import { parseEmailRuntimeMessage } from "./types";
let dispatcher: typeof import("./queue");
before(async () => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "unit",
    SUPABASE_SERVICE_ROLE_KEY: "unit",
    OPENAI_API_KEY: "unit",
    OPENROUTER_API_KEY: "unit",
    EMAIL_RUNTIME_TARGET: "vercel_queue",
  });
  const mod = Module as any,
    load = mod._load;
  mod._load = function (name: string, parent: unknown, main: boolean) {
    return name === "server-only" ? {} : load.call(this, name, parent, main);
  };
  try {
    dispatcher = await import("./queue");
  } finally {
    mod._load = load;
  }
});
const jobId = "00000000-0000-4000-8000-000000000001";
function store() {
  const job: any = { id: jobId, status: "queued", worker_target: "legacy" };
  const admin: any = {
    from() {
      let patch: any;
      const filters: any = {};
      return {
        update(value: any) {
          patch = value;
          return this;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return this;
        },
        select() {
          return this;
        },
        async maybeSingle() {
          if (Object.entries(filters).some(([k, v]) => job[k] !== v))
            return { data: null, error: null };
          Object.assign(job, patch);
          return { data: job, error: null };
        },
        then(resolve: any, reject: any) {
          Object.assign(job, patch);
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
    },
    async rpc() {
      return { data: [{ version: 1, kind: "reply", jobId }], error: null };
    },
  };
  return { job, admin };
}
test("publish failure leaves a durable owned job for Cron recovery and does not lose the inbound event", async () => {
  const { job, admin } = store();
  await dispatcher.dispatchInboundEmailReply(jobId, admin, async () => {
    throw new Error("temporary queue outage");
  });
  assert.equal(job.status, "queued");
  assert.equal(job.worker_target, "vercel_queue");
  assert.match(job.queue_dispatch_error, /outage/);
  let published = 0;
  const result = await dispatcher.dispatchEmailRuntimeJobs(
    admin,
    async (message, generation) => {
      assert.deepEqual(message, { version: 1, kind: "reply", jobId });
      assert.ok(generation);
      published++;
      return { messageId: "retry" } as any;
    }
  );
  assert.equal(published, 1);
  assert.equal(result.dispatched, 1);
});
test("dispatcher cannot move an active legacy claim to the new runtime", async () => {
  const { job, admin } = store();
  job.status = "processing";
  job.locked_by = "legacy";
  let calls = 0;
  await dispatcher.dispatchInboundEmailReply(jobId, admin, async () => {
    calls++;
    return { messageId: "unexpected" } as any;
  });
  assert.equal(calls, 0);
  assert.equal(job.worker_target, "legacy");
});
test("Queue payload validates only the minimal machine contract and drops arbitrary private fields", () => {
  assert.equal(
    parseEmailRuntimeMessage({ version: 1, kind: "reply", jobId: "not-an-id" }),
    null
  );
  assert.equal(
    parseEmailRuntimeMessage({ version: 1, kind: "unexpected", jobId }),
    null
  );
  assert.deepEqual(
    parseEmailRuntimeMessage({
      version: 1,
      kind: "contact",
      jobId,
      body: "private",
      token: "secret",
    }),
    { version: 1, kind: "contact", jobId }
  );
});
