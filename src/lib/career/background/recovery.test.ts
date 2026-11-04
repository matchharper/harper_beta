import assert from "node:assert/strict";
import Module from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";

test("recovery advances independent runs and waits for all receipts before returning a failure", async (t) => {
  const modules = Module as any;
  const original = modules._load;
  let finish: (id: string) => Promise<void>;
  t.mock.method(modules, "_load", function (this: unknown, name: string, parent: any, ...args: any[]) {
    if (parent?.filename?.endsWith("/career/background/server.ts")) {
      if (name === "../schedules/server")
        return { finishCareerSourceEvents: ({ run }: any) => finish(run.id) };
      // Other imports belong to normal agent execution, not this recovery scan.
      return {};
    }
    return original.call(this, name, parent, ...args);
  });
  const { recoverCareerBackgroundRuns } = require("./server");
  const rows = ["slow", "fast"].map((id) => ({ id, status: "completed" }));
  const admin = {
    from: () => {
      const query: any = {
        select: () => query, eq: () => query, in: () => query,
        is: () => query, order: () => query, update: () => query,
        limit: async () => ({ data: rows, error: null }),
        then: (resolve: (value: unknown) => void) => resolve({ error: null }),
      };
      return query;
    },
  };
  for (const failFast of [false, true]) {
    const completed: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    finish = async (id) => {
      if (id === "slow") await gate;
      completed.push(id);
      if (id === "fast" && failFast) throw new Error("receipt unavailable");
    };
    let settled = false;
    const pending = recoverCareerBackgroundRuns(admin);
    void pending.then(() => { settled = true; }, () => { settled = true; });
    await setImmediate();
    try {
      assert.deepEqual(completed, ["fast"]);
      assert.equal(settled, false);
    } finally {
      release();
    }
    if (failFast) await assert.rejects(pending, /receipt unavailable/);
    else assert.deepEqual(await pending, { inspected: 2 });
    assert.deepEqual(completed, ["fast", "slow"]);
  }
});
