import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

// The company's "ask the candidate again" goes to the candidate's agent once
// per company action: a retry reuses the saved source message, and the mailbox
// key is that request's key (candidate-reengagement:<recommendation>:<stage>:<action>).
// No database is configured, so each call stops at the mailbox send
// ("Internal evaluation database is unavailable") after preparing its source.
test("a retried re-engagement question reuses its source message and request key", async (t) => {
  const modules = Module as unknown as { _load: (name: string, parent: unknown, main: boolean) => unknown };
  const load = modules._load;
  t.mock.method(modules, "_load", function (name: string, parent: unknown, main: boolean) {
    return name === "server-only" ? {} : load.call(modules, name, parent, main);
  });
  delete process.env.DATABASE_URL;
  delete process.env.CAREER_ROLE_SEARCH_DATABASE_URL;
  const { requestCandidateReengagement } = await import("./internalCandidateReengagement");

  const messages: Array<{ id: number; metadata: Record<string, any> }> = [];
  const admin = {
    from(table: string) {
      let contains: Record<string, unknown> | null = null;
      let inserted: Record<string, any> | null = null;
      const result = () => {
        if (table === "talent_opportunity_recommendation")
          return { data: [{ id: "rec", saved_stage: "closed" }], error: null };
        if (table === "company_roles")
          return { data: { name: "Backend", status: "active", is_expired: false, expires_at: null }, error: null };
        if (table === "company_conversations") return { data: { id: "conversation" }, error: null };
        if (table === "company_messages") {
          if (inserted) {
            const row = { id: messages.length + 1, metadata: inserted.metadata };
            messages.push(row);
            return { data: { id: row.id }, error: null };
          }
          const found = messages.find((row) =>
            Object.entries(contains ?? {}).every(([key, value]) => row.metadata[key] === value));
          return { data: found ? { id: found.id } : null, error: null };
        }
        return { data: null, error: null };
      };
      const query: any = {
        select: () => query,
        eq: () => query,
        contains: (_column: string, value: Record<string, unknown>) => ((contains = value), query),
        order: () => query,
        limit: () => query,
        insert: (row: Record<string, any>) => ((inserted = row), query),
        maybeSingle: async () => result(),
        single: async () => result(),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  };
  const ask = (actionKey: string | null) =>
    assert.rejects(
      requestCandidateReengagement({
        actionKey, actorUserId: "member", admin, recommendationId: "rec", roleId: "role",
        stage: "pending_connection", talentId: "talent", workspaceId: "workspace",
      }),
      /Internal evaluation database is unavailable/
    );

  await ask("action-1");
  await ask("action-1");
  assert.equal(messages.length, 1, "a retry of the same action reuses its source message");
  assert.equal(messages[0].metadata.reengagementRequestKey, "candidate-reengagement:rec:pending_connection:action-1");
  // A new company action is a new question.
  await ask("action-2");
  assert.equal(messages.length, 2);
  assert.equal(messages[1].metadata.reengagementRequestKey, "candidate-reengagement:rec:pending_connection:action-2");
  // Without an action key (an older caller) each call keeps its own source, as before.
  await ask(null);
  assert.equal(messages.length, 3);
  assert.equal(messages[2].metadata.reengagementRequestKey, undefined);
});
