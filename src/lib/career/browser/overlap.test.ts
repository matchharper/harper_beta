import assert from "node:assert/strict";
import test from "node:test";
import { executeUseBrowser } from "./tool";
import { browserUseAgents } from "../simulation/browserUseAgents";
import type { ExternalOperation, ExternalToolContext } from "../externalOperations/store";

const userId = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function store(rows: ExternalOperation[]) {
  const from = (table: string) => {
    // Every assertion below is about the overlap check, which only reads browser operations.
    if (table !== "talent_external_operations") throw new Error(`reached ${table}`);
    const filters: [string, string, unknown][] = [];
    let changes: Record<string, unknown> | undefined;
    const matches = (row: Record<string, any>) => filters.every(([op, key, value]) =>
      op === "eq" ? row[key] === value : (value as unknown[]).includes(row[key]));
    const found = () => rows.filter(matches);
    const chain: any = {
      select: () => chain, order: () => chain,
      eq: (key: string, value: unknown) => { filters.push(["eq", key, value]); return chain; },
      in: (key: string, value: unknown) => { filters.push(["in", key, value]); return chain; },
      update: (value: Record<string, unknown>) => { changes = value; return chain; },
      limit: async () => ({ data: structuredClone(found()), error: null }),
      maybeSingle: async () => {
        const row = found()[0];
        if (row && changes) Object.assign(row, changes);
        return { data: row ? structuredClone(row) : null, error: null };
      },
    };
    return chain;
  };
  return { from, rpc: async (name: string) => { throw new Error(`reached ${name}`); } } as any;
}
const operation = (n: number, kind: string, status: string, extra: Partial<ExternalOperation> = {}) => ({
  id: id(n), user_id: userId, conversation_id: id(99), parent_id: null, kind, status, revision: 1,
  idempotency_key: `k${n}`, request: {}, result: {}, provider_refs: {},
  created_at: "2026-11-18T00:00:00Z", updated_at: "2026-11-18T00:00:00Z", ...extra,
}) as ExternalOperation;
const context = (rows: ExternalOperation[]): ExternalToolContext => ({
  admin: store(rows), userId, conversationId: id(99), requestId: "second-approval",
});
const busyBrowser = (request: Record<string, unknown>) => [
  operation(1, "browser_session", "running", { provider_refs: { current_execution_id: id(2), workspace_id: "ws" } }),
  operation(2, "browser_run", "running", { parent_id: id(1), request, provider_refs: { run_id: "remote-run" } }),
];

test("a second approved application on a busy browser is not started and waits for the active run", async (t) => {
  const rows = busyBrowser({ mode: "execute", role_refs: ["role-a"] });
  t.mock.method(browserUseAgents, "status", async () => ({ status: "running" }));
  const result: any = await executeUseBrowser(
    { action: "run", session_id: id(1), mode: "execute", effect_key: "apply:role-b", role_refs: ["role-b"], task: "Submit the approved application" },
    context(rows)
  );
  assert.deepEqual(result.careerContinuation, { kind: "browser_run", id: id(2) });
  assert.match(result.modelOutput, /^Not started: this browser is still working on browser run/);
  assert.equal(rows.length, 2);
});

test("a second submission run for the same role waits even when it asks for another browser", async (t) => {
  const rows = busyBrowser({ mode: "execute", role_refs: ["role-a"] });
  t.mock.method(browserUseAgents, "status", async () => ({ status: "running" }));
  const result: any = await executeUseBrowser(
    { action: "run", mode: "execute", effect_key: "apply:role-a:again", role_refs: ["role-a"], task: "Submit the approved application" },
    context(rows)
  );
  assert.deepEqual(result.careerContinuation, { kind: "browser_run", id: id(2) });
  assert.match(result.modelOutput, /one role has one submission in flight/);
});

test("preparing the same role in another browser and a stale finished run do not block a new run", async (t) => {
  const prepareRows = busyBrowser({ mode: "execute", role_refs: ["role-a"] });
  t.mock.method(browserUseAgents, "status", async () => ({ status: "running" }));
  await assert.rejects(executeUseBrowser(
    { action: "run", mode: "prepare", role_refs: ["role-a"], task: "Inspect the form" }, context(prepareRows)
  ), /Error: reached /); // went past the overlap check to the normal run path

  const staleRows = busyBrowser({ mode: "prepare", role_refs: ["role-a"] });
  // The saved status still says running, but the provider already finished the run.
  t.mock.method(browserUseAgents, "status", async () => ({ status: "completed" }));
  t.mock.method(browserUseAgents, "result", async () => ({ status: "completed", output: JSON.stringify({
    summary: "Read the form.", evidence: [], needsUser: false, url: "", submitted: "no",
  }) }));
  await assert.rejects(executeUseBrowser(
    { action: "run", session_id: id(1), mode: "prepare", role_refs: ["role-b"], task: "Inspect the next form" }, context(staleRows)
  ), /Error: reached /);
  assert.equal(staleRows[1].status, "completed");
  assert.equal(staleRows[0].status, "idle");
});

test("a run parked while a newer message is answered does not block that answer's run", async () => {
  // The parked run went back to reserved and its browser to idle; the newer reply may run on that browser.
  const rows = [
    operation(1, "browser_session", "idle", { provider_refs: { current_execution_id: id(2), workspace_id: "ws" } }),
    operation(2, "browser_run", "reserved", { parent_id: id(1), request: { mode: "execute", role_refs: ["role-a"] } }),
  ];
  await assert.rejects(executeUseBrowser(
    { action: "run", session_id: id(1), mode: "execute", effect_key: "apply:role-a", role_refs: ["role-a"], task: "Submit with the corrected answer" },
    context(rows)
  ), /Error: reached /);
});

test("a run of another delegated work is not waited on, because this reply could not read it back", async (t) => {
  const rows = busyBrowser({ mode: "execute", role_refs: ["role-a"], work_id: id(70) });
  t.mock.method(browserUseAgents, "status", async () => ({ status: "running" }));
  await assert.rejects(executeUseBrowser(
    { action: "run", mode: "execute", effect_key: "apply:role-a", role_refs: ["role-a"], task: "Submit the approved application" },
    context(rows)
  ), /Error: reached /);
});
