import assert from "node:assert/strict";
import test from "node:test";
import { CAREER_WORK_TOOLS } from "./tools";

const STOPPED = "User stopped this request";

function stoppedSourceAdmin(stoppedIds: number[], options: { lookupError?: boolean } = {}) {
  const lookups: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
  const admin: any = {
    rpc: async (name: string) => {
      assert.equal(name, "manage_career_work");
      // The database stays authoritative: any stopped source rejects the call.
      return { data: null, error: { message: STOPPED } };
    },
    from: (table: string) => {
      const lookup = { table, filters: [] as Array<[string, string, unknown]> };
      lookups.push(lookup);
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => { lookup.filters.push(["eq", column, value]); return query; },
        in: (column: string, value: unknown) => { lookup.filters.push(["in", column, value]); return query; },
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(options.lookupError
            ? { data: null, error: { message: "lookup failed" } }
            : { data: stoppedIds.map(id => ({ id })), error: null }).then(resolve, reject),
      };
      return query;
    },
  };
  return { admin, lookups };
}

const context = (admin: any) => ({ admin, userId: "user", conversationId: "conversation", userMessageIds: [30] });

test("a stopped-source rejection names the stopped messages and how a later request restarts work", async () => {
  const { admin, lookups } = stoppedSourceAdmin([11]);
  await assert.rejects(CAREER_WORK_TOOLS.manage_work.execute!({
    action: "start", identity: "apply:role", instruction: "Apply again", target: "role", source_refs: [11, 12],
  }, context(admin)), (error: Error) => {
    assert.match(error.message, /^User stopped this request/);
    assert.match(error.message, /user message 11\b/);
    assert.doesNotMatch(error.message, /\b12\b/);
    assert.match(error.message, /request made after the stop/);
    assert.match(error.message, /omitted source_refs default to the user messages delivered/);
    assert.match(error.message, /new identity/);
    return true;
  });
  assert.deepEqual(lookups.map(lookup => lookup.table), ["talent_messages"]);
  assert.deepEqual(lookups[0].filters, [
    ["eq", "user_id", "user"],
    ["eq", "conversation_id", "conversation"],
    ["in", "id", [11, 12]],
    ["eq", "payload->>careerTurnStopped", "true"],
  ]);
});

test("a stopped-source rejection still explains itself when the stopped messages cannot be read", async () => {
  const { admin } = stoppedSourceAdmin([], { lookupError: true });
  await assert.rejects(CAREER_WORK_TOOLS.manage_work.execute!({
    action: "start", identity: "apply:role", instruction: "Apply again", target: "role", source_refs: [11, 12],
  }, context(admin)), (error: Error) => {
    assert.match(error.message, /^User stopped this request/);
    assert.match(error.message, /11, 12/);
    assert.match(error.message, /request made after the stop/);
    return true;
  });
});

test("an update rejected for a stopped source is not told to start new work", async () => {
  const { admin } = stoppedSourceAdmin([11]);
  await assert.rejects(CAREER_WORK_TOOLS.manage_work.execute!({
    action: "update", work_id: "00000000-0000-4000-8000-000000000001", expected_revision: 2,
    instruction: "Use the new resume", source_refs: [11, 30],
  }, context(admin)), (error: Error) => {
    assert.match(error.message, /^User stopped this request: user message 11 /);
    assert.doesNotMatch(error.message, /new identity/);
    return true;
  });
});

test("a call that used the delivered messages names the stopped delivered message", async () => {
  const { admin, lookups } = stoppedSourceAdmin([30]);
  await assert.rejects(CAREER_WORK_TOOLS.manage_work.execute!({
    action: "start", identity: "apply:role", instruction: "Apply", target: "role",
  }, context(admin)), (error: Error) => {
    assert.match(error.message, /user message 30 in source_refs was stopped/);
    return true;
  });
  assert.deepEqual(lookups[0].filters[2], ["in", "id", [30]]);
});

test("other work rejections pass through unchanged without extra reads", async () => {
  const admin: any = {
    rpc: async () => ({ data: null, error: { message: "Work identity, purpose and user source required" } }),
    from: () => { throw new Error("Only a stopped-source rejection reads messages"); },
  };
  await assert.rejects(CAREER_WORK_TOOLS.manage_work.execute!({
    action: "start", identity: "apply:role", instruction: "Apply", source_refs: [11],
  }, context(admin)), (error: Error) => {
    assert.equal(error.message, "Work identity, purpose and user source required");
    return true;
  });
});
