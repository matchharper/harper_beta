import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { scheduleCareerDevelopmentJob } from "./developmentQueue.server";

function localEnvironment(t: TestContext) {
  const nodeEnv = process.env.NODE_ENV;
  const vercel = process.env.VERCEL;
  Object.assign(process.env, { NODE_ENV: "development" });
  delete process.env.VERCEL;
  t.after(() => {
    if (nodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: nodeEnv });
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
  });
}

test("local background work observes an existing run until completion and deduplicates active jobs", async (t) => {
  localEnvironment(t);
  const callbacks: Array<() => Promise<void>> = [];
  const waits: number[] = [];
  let observations = 0;
  const runtime = {
    schedule: (callback: () => Promise<void>) => {
      callbacks.push(callback);
    },
    wait: async (milliseconds: number) => {
      waits.push(milliseconds);
    },
    now: () => 0,
  };
  const observe = async () => ++observations > 1;
  assert.equal(
    scheduleCareerDevelopmentJob("test:browser-observation", observe, runtime),
    true
  );
  assert.equal(
    scheduleCareerDevelopmentJob("test:browser-observation", observe, runtime),
    true
  );
  assert.equal(callbacks.length, 1);
  assert.equal(observations, 0);
  await callbacks[0]();
  assert.equal(observations, 2);
  assert.deepEqual(waits, [5000]);
  assert.equal(
    scheduleCareerDevelopmentJob(
      "test:browser-observation",
      async () => {},
      runtime
    ),
    true
  );
  await callbacks[1]();
});

test("temporary observation failures retry the processor without creating another browser run", async (t) => {
  localEnvironment(t);
  t.mock.method(console, "error", () => {});
  let callback: (() => Promise<void>) | undefined;
  let attempts = 0;
  const waits: number[] = [];
  scheduleCareerDevelopmentJob(
    "test:retry",
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Temporary provider read failure");
    },
    {
      schedule: (value) => {
        callback = value;
      },
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
      now: () => 0,
    }
  );
  await callback!();
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [60_000]);
});

test("Vercel and production requests continue using durable queues", (t) => {
  localEnvironment(t);
  const runtime = {
    schedule: () => {
      throw new Error("Must not schedule locally");
    },
    wait: async () => {},
    now: () => 0,
  };
  process.env.VERCEL = "1";
  assert.equal(
    scheduleCareerDevelopmentJob("test:vercel", async () => {}, runtime),
    false
  );
  delete process.env.VERCEL;
  Object.assign(process.env, { NODE_ENV: "production" });
  assert.equal(
    scheduleCareerDevelopmentJob("test:production", async () => {}, runtime),
    false
  );
});
