import assert from "node:assert/strict";
import test from "node:test";
import { executeUseBrowser } from "./tool";
import { browserUseAgents } from "../simulation/browserUseAgents";

const owner = "00000000-0000-4000-8000-000000000001";
const conversation = "00000000-0000-4000-8000-000000000002";
const work = "00000000-0000-4000-8000-000000000003";

function fixture() {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    id: `session-${index}`, user_id: owner, conversation_id: conversation, kind: "browser_session",
    status: "idle", updated_at: "2026-11-09T03:00:00Z", work_id: work,
    role_refs: ["role-a"], execution_id: `run-${index}`, browser_availability: "stopped",
  }));
  rows.push({ ...rows[0], id: "other-owner", execution_id: "other-owner-run", user_id: "other" },
    { ...rows[0], id: "other-conversation", execution_id: "other-conversation-run", conversation_id: "other" },
    { ...rows[0], id: "other-work", execution_id: "other-work-run", work_id: "other", role_refs: ["role-b"] });
  const executions = rows.map(row => ({ id: row.execution_id, parent_id: row.id,
    user_id: row.user_id, conversation_id: row.conversation_id, kind: "browser_run", status: "completed",
    requested_url: "https://example.com/apply", observed_url: "https://example.com/questions" }));
  const selects: string[] = [];
  const admin = { from(table: string) {
    assert.equal(table, "talent_external_operations");
    const predicates: ((row: any) => boolean)[] = [];
    let start = 0, end = Infinity, kind = "";
    const q: any = {
      select(columns: string) { selects.push(columns); return q; },
      eq(key: string, value: unknown) {
        if (key === "kind") kind = String(value);
        predicates.push(row => row[key === "request->>work_id" ? "work_id" : key] === value); return q;
      },
      contains(key: string, value: { role_refs: string[] }) {
        assert.equal(key, "request");
        predicates.push(row => value.role_refs.every(ref => row.role_refs.includes(ref))); return q;
      },
      in(key: string, values: string[]) { predicates.push(row => values.includes(row[key])); return q; },
      order() { return q; },
      range(from: number, to: number) { start = from; end = to; return q; },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: (kind === "browser_run" ? executions : rows)
          .filter(row => predicates.every(predicate => predicate(row))).slice(start, end + 1), error: null }).then(resolve);
      },
    };
    return q;
  } };
  return { context: { admin: admin as any, userId: owner, conversationId: conversation, requestId: "list" }, selects };
}

test("browser discovery is paginated, scoped and does not contact the provider or load reports", async t => {
  t.mock.method(browserUseAgents, "inspectSessionBrowser", async () => assert.fail("Listing must not inspect browsers"));
  t.mock.method(globalThis, "fetch", async () => assert.fail("No external request during listing"));
  const { context, selects } = fixture();
  const first = await executeUseBrowser({ action: "list", work_id: work, role_refs: ["role-a"] }, context);
  assert.ok("sessions" in first);
  assert.equal(first.sessions?.length, 20);
  assert.equal(first.nextOffset, 20);
  assert.match(first.modelOutput, /https:\/\/example.com\/apply/);
  assert.match(first.modelOutput, /execution_id run-0; recorded status completed/);
  assert.match(first.modelOutput, /does not check live pages or establish submission/);
  const second = await executeUseBrowser({ action: "list", work_id: work, role_refs: ["role-a"], offset: first.nextOffset }, context);
  assert.ok("sessions" in second);
  assert.equal(second.sessions?.length, 5);
  assert.equal(second.nextOffset, null);
  assert.equal(new Set([...first.sessions!, ...second.sessions!].map(row => row.id)).size, 25);
  assert.doesNotMatch(first.modelOutput + second.modelOutput, /other-owner|other-conversation|other-work/);
  for (const columns of selects) {
    assert.doesNotMatch(columns, /\*|summary|evidence|authorization|task|liveUrl/);
    assert.ok(!columns.split(",").some(column => ["request", "result", "provider_refs"].includes(column)));
  }
  const empty = await executeUseBrowser({ action: "list", role_refs: ["missing-role"] }, context);
  assert.ok("sessions" in empty);
  assert.equal(empty.sessions?.length, 0);
  const delegate = await executeUseBrowser({ action: "list", role_refs: ["role-b"] }, { ...context, workId: work });
  assert.ok("sessions" in delegate);
  assert.equal(delegate.sessions?.length, 0, "delegate cannot discover another work's browser");
  const conflicting = await executeUseBrowser({ action: "list", work_id: owner }, { ...context, workId: work });
  assert.ok("sessions" in conflicting);
  assert.equal(conflicting.sessions?.length, 0, "model filter cannot override caller-owned work scope");
});
