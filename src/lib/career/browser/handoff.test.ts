import assert from "node:assert/strict";
import test from "node:test";
import { executeUseBrowser, refreshBrowserExecution } from "./tool";
import { browserUseAgents } from "../simulation/browserUseAgents";
import type { ExternalOperation, ExternalToolContext } from "../externalOperations/store";

const userId = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function store(tables: Record<string, Record<string, any>[]>) {
  const from = (table: string) => {
    const rows = tables[table] ?? [];
    const filters: [string, string, unknown][] = [];
    let changes: Record<string, unknown> | undefined;
    const matches = (row: Record<string, any>) => filters.every(([op, key, value]) =>
      op === "eq" ? row[key] === value : (value as unknown[]).includes(row[key]));
    const chain: any = {
      select: () => chain, order: () => chain,
      eq: (key: string, value: unknown) => { filters.push(["eq", key, value]); return chain; },
      in: (key: string, value: unknown) => { filters.push(["in", key, value]); return chain; },
      update: (value: Record<string, unknown>) => { changes = value; return chain; },
      insert: () => { throw new Error(`reached ${table} insert`); },
      limit: async () => ({ data: structuredClone(rows.filter(matches)), error: null }),
      maybeSingle: async () => {
        const row = rows.find(matches);
        if (row && changes) Object.assign(row, changes);
        return { data: row ? structuredClone(row) : null, error: null };
      },
      then: (resolve: (value: unknown) => void) => resolve({ data: structuredClone(rows.filter(matches)), error: null }),
    };
    return chain;
  };
  // Every assertion here stops before anything new is written for the run.
  return { from, rpc: async (name: string) => { throw new Error(`reached ${name}`); } } as any;
}
const operation = (n: number, kind: string, status: string, extra: Partial<ExternalOperation> = {}) => ({
  id: id(n), user_id: userId, conversation_id: id(99), parent_id: null, kind, status, revision: 1,
  idempotency_key: `k${n}`, request: {}, result: {}, provider_refs: {},
  created_at: minutesAgo(30), updated_at: minutesAgo(10), ...extra,
}) as ExternalOperation;
const handedOff = () => [
  operation(1, "browser_session", "human", { provider_refs: { current_execution_id: id(2), workspace_id: "ws", session_id: "remote" } }),
  operation(2, "browser_run", "completed", { parent_id: id(1), result: { summary: "Greenhouse asked for an 8-character code.", needsUser: true } }),
];
const context = (tables: Record<string, Record<string, any>[]>, userMessageId: number): ExternalToolContext => ({
  admin: store(tables), userId, conversationId: id(99), requestId: "chat-answer", userMessageId,
});
const run = { action: "run", session_id: id(1), mode: "execute", effect_key: "apply:role-a", task: "Enter the code ABCD1234 and submit" };

test("a chat answer written after the handoff hands the browser back to Harper for that run", async () => {
  const operations = handedOff();
  const messages = [{ id: 77, user_id: userId, role: "user", created_at: minutesAgo(1), content: "ABCD1234" }];
  // The run then continues on the normal path until it reaches the run reservation.
  await assert.rejects(executeUseBrowser(run, context({ talent_external_operations: operations, talent_messages: messages }, 77)),
    /Error: reached /);
  assert.equal(operations[0].status, "idle");
  assert.equal(operations[0].result.control_source, "chat");
});

test("a chat message from before the handoff leaves the browser with the user", async () => {
  const operations = handedOff();
  const messages = [{ id: 76, user_id: userId, role: "user", created_at: minutesAgo(20), content: "apply" }];
  const result: any = await executeUseBrowser(run, context({ talent_external_operations: operations, talent_messages: messages }, 76));
  assert.equal(result.session.status, "human");
  assert.match(result.modelOutput, /until the user selects Done or answers in chat/);
  assert.equal(operations[0].status, "human");
});

test("when another reader saved the finished run first, its saved receipt is used instead of failing", async (t) => {
  const stored = operation(3, "browser_run", "completed", { revision: 2, provider_refs: { run_id: "remote-run" },
    result: { summary: "Submitted once.", evidence: [], needsUser: false, url: "", submitted: "yes" } });
  const stale = { ...structuredClone(stored), status: "running", revision: 1, result: {} } as ExternalOperation;
  t.mock.method(browserUseAgents, "status", async () => ({ status: "completed" }));
  t.mock.method(browserUseAgents, "result", async () => ({ status: "completed", output: JSON.stringify({
    summary: "Submitted once.", evidence: [], needsUser: false, url: "", submitted: "yes" }) }));
  const latest = await refreshBrowserExecution({ admin: store({ talent_external_operations: [stored] }), userId }, stale);
  assert.equal(latest.status, "completed");
  assert.equal(latest.revision, 2);
});
