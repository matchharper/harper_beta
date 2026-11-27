import assert from "node:assert/strict";
import test from "node:test";
import { earlierSubmitAttempts } from "./tool";

const userId = "00000000-0000-4000-8000-000000000001";
const run = (id: string, roles: string[], result: Record<string, unknown>, provider_refs: Record<string, unknown> = {}, mode = "execute") =>
  ({ id, user_id: userId, kind: "browser_run", request: { mode, role_refs: roles }, result, provider_refs });

function admin(rows: Record<string, any>[], failed = false) {
  return {
    from: () => {
      const filters: [string, unknown][] = [];
      const chain: any = {
        select: () => chain, order: () => chain,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
        limit: async () => failed ? { data: null, error: { message: "down" } } : {
          data: rows.filter((row) => filters.every(([key, value]) => (key === "request->>mode" ? row.request.mode : row[key]) === value)),
          error: null,
        },
      };
      return chain;
    },
  } as any;
}

test("an execute run is told Harper's receipts of earlier submit attempts for the same posting", async () => {
  const rows = [
    run("now", ["role-a"], {}),
    run("no", ["role-a"], { submitted: "no" }, { run_id: "r1" }),
    run("cut", ["role-a", "role-b"], {}, { run_id: "r2" }),
    run("never", ["role-a"], {}),
    run("other", ["role-z"], { submitted: "yes" }, { run_id: "r3" }),
    run("prepared", ["role-a"], { submitted: "no" }, { run_id: "r4" }, "prepare"),
  ];
  assert.equal(await earlierSubmitAttempts({ admin: admin(rows), userId }, ["role-a"], "now"),
    "Harper's records for this application: 3 earlier submit attempts (1 did not submit, 1 was cut off before its receipt, 1 never reached a browser).");
  assert.equal(await earlierSubmitAttempts({ admin: admin(rows), userId }, ["role-q"], "now"), "");
  assert.equal(await earlierSubmitAttempts({ admin: admin(rows), userId }, [], "now"), "");
});

test("a reported submission is called out, and a failed read only leaves the line out", async () => {
  const rows = [run("yes", ["role-a"], { submitted: "Yes" }, { run_id: "r1" }), run("unclear", ["role-a"], { submitted: "unclear" }, { run_id: "r2" })];
  assert.equal(await earlierSubmitAttempts({ admin: admin(rows), userId }, ["role-a"], "now"),
    "Harper's records for this application: 2 earlier submit attempts (1 reported a submission, 1 pressed submit without a confirmed receipt). One reported a submission: do not submit again; report what the site shows about it.");
  assert.equal(await earlierSubmitAttempts({ admin: admin(rows, true), userId }, ["role-a"], "now"), "");
});
