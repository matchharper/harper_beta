import assert from "node:assert/strict";
import test from "node:test";
import { reconcileStaleBrowserRuns } from "./staleRuns";
import { browserUseAgents } from "../simulation/browserUseAgents";
import type { ExternalOperation } from "../externalOperations/store";

const userId = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function store(rows: ExternalOperation[]) {
  const from = () => {
    const filters: [string, string, unknown][] = [];
    let changes: Record<string, unknown> | undefined;
    const matches = (row: Record<string, any>) => filters.every(([op, key, value]) =>
      op === "eq" ? row[key] === value : op === "in" ? (value as unknown[]).includes(row[key]) : row[key] < (value as string));
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain,
      eq: (key: string, value: unknown) => { filters.push(["eq", key, value]); return chain; },
      in: (key: string, value: unknown) => { filters.push(["in", key, value]); return chain; },
      lt: (key: string, value: unknown) => { filters.push(["lt", key, value]); return chain; },
      update: (value: Record<string, unknown>) => { changes = value; return chain; },
      maybeSingle: async () => {
        const row = rows.find(matches);
        if (row && changes) Object.assign(row, changes);
        return { data: row ? structuredClone(row) : null, error: null };
      },
      then: (resolve: (value: unknown) => void) => {
        const found = rows.filter(matches);
        if (changes) for (const row of found) Object.assign(row, changes);
        resolve({ data: structuredClone(found), error: null });
      },
    };
    return chain;
  };
  return { from } as any;
}
const operation = (n: number, kind: string, status: string, extra: Partial<ExternalOperation> = {}) => ({
  id: id(n), user_id: userId, conversation_id: id(99), parent_id: null, kind, status, revision: 1,
  idempotency_key: `k${n}`, request: {}, result: {}, provider_refs: {}, created_at: minutesAgo(60), updated_at: minutesAgo(60), ...extra,
}) as ExternalOperation;

test("an abandoned reservation closes as not submitted and frees its browser; a recent one is left alone", async () => {
  const rows = [
    operation(1, "browser_session", "running", { provider_refs: { current_execution_id: id(2) } }),
    operation(2, "browser_run", "reserved", { parent_id: id(1) }),
    operation(3, "browser_run", "reserved", { parent_id: id(1), updated_at: minutesAgo(5) }),
  ];
  const observed = await reconcileStaleBrowserRuns({ admin: store(rows) });
  assert.deepEqual(observed, { refreshed: 0, closed: 1, failed: 0 });
  assert.equal(rows[1].status, "cancelled");
  assert.equal(rows[1].result.submitted, "no");
  assert.equal(rows[0].status, "idle");
  assert.equal(rows[2].status, "reserved");
});

test("a run that finished at the provider while nobody watched saves its real outcome", async (t) => {
  const rows = [operation(4, "browser_run", "running", { provider_refs: { run_id: "remote-run" } })];
  t.mock.method(browserUseAgents, "status", async () => ({ status: "completed" }));
  t.mock.method(browserUseAgents, "result", async () => ({ status: "completed", output: JSON.stringify({
    summary: "Submitted once.", evidence: ["Thank you page"], needsUser: false, url: "https://jobs.example/thanks", submitted: "no" }) }));
  const observed = await reconcileStaleBrowserRuns({ admin: store(rows) });
  assert.deepEqual(observed, { refreshed: 1, closed: 0, failed: 0 });
  assert.equal(rows[0].status, "completed");
  assert.equal(rows[0].result.summary, "Submitted once.");
});

test("a run still going at the provider is rotated behind the others, not changed", async (t) => {
  const rows = [operation(5, "browser_run", "running", { provider_refs: { run_id: "remote-run" } })];
  t.mock.method(browserUseAgents, "status", async () => ({ status: "running" }));
  const before = rows[0].updated_at;
  assert.deepEqual(await reconcileStaleBrowserRuns({ admin: store(rows) }), { refreshed: 0, closed: 0, failed: 0 });
  assert.equal(rows[0].status, "running");
  assert.ok(rows[0].updated_at > before);
});
