import assert from "node:assert/strict";
import test from "node:test";
import { chatIsInUse, notifyApplicationAwaitingEmailCode, startPendingGmailReviews } from "./gmailReview";

const NOW = Date.parse("2026-11-23T06:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

type Query = { table: string; filters: [string, string, unknown][]; update?: Record<string, unknown> };

/** A client that answers each read from in-memory rows, keeping only the rows its filters match. */
function fakeAdmin(rows: Record<string, Record<string, any>[]>, rpc: (name: string, args: any) => unknown = () => null) {
  const queries: Query[] = [];
  const rpcs: { name: string; args: any }[] = [];
  const value = (row: Record<string, any>, column: string) =>
    column.includes("->>") ? row[column.split("->>")[0]]?.[column.split("->>")[1]] : row[column];
  const builder = (query: Query) => {
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain, maybeSingle: () => chain,
      update: (changes: Record<string, unknown>) => { query.update = changes; return chain; },
    };
    for (const op of ["eq", "neq", "is", "gte"]) chain[op] = (column: string, expected: unknown) => { query.filters.push([op, column, expected]); return chain; };
    chain.then = (resolve: (result: unknown) => unknown) => {
      const data = (rows[query.table] ?? []).filter((row) => query.filters.every(([op, column, expected]) => {
        const actual = value(row, column);
        if (op === "eq") return actual === expected;
        if (op === "neq") return actual !== expected;
        if (op === "is") return (actual ?? null) === expected;
        return String(actual) >= String(expected);
      }));
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return chain;
  };
  const admin = {
    from: (table: string) => { const query: Query = { table, filters: [] }; queries.push(query); return builder(query); },
    rpc: async (name: string, args: any) => { rpcs.push({ name, args }); return { data: await rpc(name, args), error: null }; },
  };
  return { admin: admin as any, queries, rpcs };
}

test("a chat counts as in use while a recent request is unfinished, a message is recent, or a recent form is open", async () => {
  const base = { user_id: "u", conversation_id: "c" };
  const quiet = fakeAdmin({
    talent_external_operations: [{ ...base, kind: "career_invocation", parent_id: null, status: "ready", created_at: ago(61) }],
    talent_messages: [{ ...base, created_at: ago(11) }],
  }, () => [{ created_at: ago(61) }]);
  assert.equal(await chatIsInUse(quiet.admin, "u", "c", NOW), false);

  const requested = fakeAdmin({ talent_external_operations: [{ ...base, kind: "career_invocation", parent_id: null, status: "ready", created_at: ago(59) }] });
  assert.equal(await chatIsInUse(requested.admin, "u", "c", NOW), true);
  const delegated = fakeAdmin({ talent_external_operations: [{ ...base, kind: "career_invocation", parent_id: "p", status: "ready", created_at: ago(5) }] });
  assert.equal(await chatIsInUse(delegated.admin, "u", "c", NOW), false);
  const talking = fakeAdmin({ talent_messages: [{ ...base, created_at: ago(9) }] });
  assert.equal(await chatIsInUse(talking.admin, "u", "c", NOW), true);
  const form = fakeAdmin({}, () => [{ created_at: ago(30) }]);
  assert.equal(await chatIsInUse(form.admin, "u", "c", NOW), true);
  const codeScreen = fakeAdmin({ talent_external_operations: [{ ...base, kind: "browser_run", request: { execution_environment: "production" },
    result: { submitted: "no", verificationCode: "email" }, updated_at: ago(12) }] });
  assert.equal(await chatIsInUse(codeScreen.admin, "u", "c", NOW), true);
});

test("a recorded inbox review starts only once the chat is quiet or it has waited three hours", async () => {
  const review = (id: string, waitedMinutes: number) => ({ id, user_id: "u", conversation_id: "c", kind: "gmail_review", status: "ready",
    request: { execution_environment: "production" }, created_at: ago(waitedMinutes) });
  const run = { id: "run", status: "handed_off", talent_id: "u", conversation_id: "c", trigger_payload: { agentInvocation: { replyId: "background:run" } } };
  const published: any[] = [];
  const busy = fakeAdmin({ talent_external_operations: [review("fresh", 30), review("old", 181)], talent_messages: [{ user_id: "u", conversation_id: "c", created_at: ago(2) }] },
    (name) => name === "career_start_gmail_review_v1" ? run : []);
  const result = await startPendingGmailReviews(busy.admin, { now: NOW, publish: async (job) => { published.push(job); } });
  assert.deepEqual(busy.rpcs.filter((call) => call.name === "career_start_gmail_review_v1").map((call) => call.args.p_review), ["old"]);
  assert.deepEqual(result, { inspected: 2, started: 1 });
  assert.deepEqual(published, [{ userId: "u", conversationId: "c", replyId: "background:run", backgroundRunId: "run", checkpointKey: "accepted:run" }]);
  // The review that keeps waiting moves to the back of the scan.
  assert.deepEqual(busy.queries.filter((query) => query.update).map((query) => query.filters.find(([, column]) => column === "id")?.[2]), ["fresh"]);

  // The database may still hold it back because another Career job of the person's is running.
  const held = fakeAdmin({ talent_external_operations: [review("quiet", 30)] }, () => null);
  const heldPublished: any[] = [];
  assert.deepEqual(await startPendingGmailReviews(held.admin, { now: NOW, publish: async (job) => { heldPublished.push(job); } }), { inspected: 1, started: 0 });
  assert.equal(heldPublished.length, 0);

  // A review whose start keeps failing still moves to the back, and a scan with no capacity starts nothing.
  const failing = fakeAdmin({ talent_external_operations: [review("broken", 30)] }, (name) => {
    if (name === "career_start_gmail_review_v1") throw new Error("database unavailable");
    return [];
  });
  assert.deepEqual(await startPendingGmailReviews(failing.admin, { now: NOW, publish: async () => {} }), { inspected: 1, started: 0 });
  assert.equal(failing.queries.filter((query) => query.update).length, 1);
  const full = fakeAdmin({ talent_external_operations: [review("quiet", 30)] }, () => run);
  assert.deepEqual(await startPendingGmailReviews(full.admin, { now: NOW, limit: 0, publish: async () => {} }), { inspected: 0, started: 0 });
  assert.equal(full.queries.length + full.rpcs.length, 0);
});

test("connecting Gmail tells only an application that stopped at an emailed code screen in the last few minutes", async () => {
  const run = (id: string, conversation: string, minutes: number, result: Record<string, unknown>) => ({ id, user_id: "u", conversation_id: conversation,
    kind: "browser_run", request: { execution_environment: "production", source_message_id: 41 }, result, updated_at: ago(minutes) });
  const published: string[] = [];
  const { admin, rpcs } = fakeAdmin({ talent_external_operations: [
    run("newer", "c1", 1, { submitted: "yes", verificationCode: "none" }),
    run("waiting", "c1", 3, { submitted: "no", verificationCode: "email" }),
    run("texted", "c2", 3, { submitted: "no", verificationCode: "phone" }),
    run("expired", "c3", 40, { submitted: "no", verificationCode: "email" }),
  ] }, () => "invocation");
  const result = await notifyApplicationAwaitingEmailCode(admin, "u", { now: NOW, publishInvocations: async ({ conversationId }) => { published.push(conversationId); } });
  assert.deepEqual(result, { notified: 1 });
  assert.deepEqual(rpcs, [{ name: "queue_career_event", args: {
    p_user_id: "u", p_conversation_id: "c1", p_source: 41, p_kind: "gmail_connected", p_reference: "waiting", p_revision: 0 } }]);
  assert.deepEqual(published, ["c1"]);
});

test("connecting Gmail also tells an application that waits for an emailed verification link", async () => {
  const run = (id: string, conversation: string, minutes: number, result: Record<string, unknown>) => ({ id, user_id: "u", conversation_id: conversation,
    kind: "browser_run", request: { execution_environment: "production", source_message_id: 41 }, result, updated_at: ago(minutes) });
  const published: string[] = [];
  const { admin, rpcs } = fakeAdmin({ talent_external_operations: [
    run("linked", "c1", 3, { submitted: "no", verificationCode: "email_link" }),
    run("sent", "c2", 3, { submitted: "yes", verificationCode: "email_link" }),
  ] }, () => "invocation");
  const result = await notifyApplicationAwaitingEmailCode(admin, "u", { now: NOW, publishInvocations: async ({ conversationId }) => { published.push(conversationId); } });
  assert.deepEqual(result, { notified: 1 });
  assert.deepEqual(rpcs.map((call: any) => call.args.p_reference), ["linked"]);
  assert.deepEqual(published, ["c1"]);
});
