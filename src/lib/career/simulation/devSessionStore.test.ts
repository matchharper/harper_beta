import test from "node:test";
import assert from "node:assert/strict";
import {
  devSessionOperation,
  readDevSimulationSession,
  devSessionTransaction,
} from "./devSessionStore";
import { createSimulationSession, endSimulationSession } from "./session";
test("local session retains progress between requests, scopes ownership and rejects stale writes", () => {
  const environment = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "development" });
  try {
    const args = {
      userId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
    };
    const state = createSimulationSession({
      roleRef: "r",
      roleName: "Role",
      documentId: null,
      documentName: null,
    });
    const first = devSessionOperation({
      ...args,
      operation: "begin",
      state,
      key: "begin",
    })!;
    assert.equal(
      devSessionOperation({ ...args, operation: "read" })?.messageId,
      first.messageId
    );
    assert.equal(
      readDevSimulationSession("someone-else", first.messageId),
      null
    );
    const saved = devSessionOperation({
      ...args,
      operation: "save",
      record: first,
      state: {
        ...state,
        analysisStatus: "completed",
        facts: [{ id: "f", text: "Confirmed ownership", messageId: 1 }],
      },
      key: "fact",
    })!;
    assert.equal(saved.state.revision, 2);
    assert.equal(
      devSessionOperation({ ...args, operation: "read" })?.state.facts.length,
      1
    );
    assert.throws(
      () =>
        devSessionOperation({
          ...args,
          operation: "save",
          record: first,
          state,
          key: "stale",
        }),
      /revision/
    );
    devSessionOperation({
      ...args,
      operation: "save",
      record: saved,
      state: endSimulationSession(saved.state, "user"),
      key: "end",
    });
    assert.equal(devSessionOperation({ ...args, operation: "read" }), null);
    assert.equal(
      readDevSimulationSession(args.userId, first.messageId)?.state.status,
      "ended"
    );
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.equal(readDevSimulationSession(args.userId, first.messageId), null);
    assert.throws(
      () => devSessionOperation({ ...args, operation: "read" }),
      /development-only/
    );
  } finally {
    if (environment === undefined)
      Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: environment });
  }
});

test("local closure rolls back on archive failure and can retry the same mutation", async () => {
  const environment = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "development" });
  try {
    const args = {
      userId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
    };
    const state = createSimulationSession({
      roleRef: "role:test",
      roleName: "Example",
      documentId: null,
      documentName: null,
    });
    const record = devSessionOperation({
      ...args,
      operation: "begin",
      state,
      key: "begin",
    })!;
    const finish = () =>
      devSessionOperation({
        ...args,
        operation: "save",
        record,
        state: endSimulationSession(state, "user"),
        key: "end",
      });
    await assert.rejects(
      devSessionTransaction(args.userId, args.conversationId, async () => {
        finish();
        throw new Error("archive unavailable");
      })
    );
    assert.equal(
      devSessionOperation({ ...args, operation: "read" })?.state.status,
      "active"
    );
    const ended = await devSessionTransaction(
      args.userId,
      args.conversationId,
      async () => finish()
    );
    assert.equal(ended?.state.status, "ended");
  } finally {
    if (environment === undefined)
      Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: environment });
  }
});
