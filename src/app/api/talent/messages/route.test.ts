import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function harness(anonymous = false, assistant = false) {
  const writes: { table: string; filters: Record<string, unknown> }[] = [];
  const rows = [
    { id: 42, user_id: "owner", conversation_id: "own-chat", role: assistant ? "assistant" : "user", message_type: "chat", payload: assistant ? { careerTextReplyId: "invocation:a" } : {} },
    ...[41, 43, 44, 45].map(id => ({ id, user_id: id === 44 ? "other" : "owner", conversation_id: id === 45 ? "other-chat" : "own-chat", role: "assistant", message_type: "career_turn_activity", payload: { careerTextReplyId: id === 43 ? "invocation:b" : "invocation:a" } })),
    ...[46, 47].map(id => ({ id, user_id: "owner", conversation_id: "own-chat", role: "assistant", message_type: "browser_session", payload: { artifactReplyId: id === 46 ? "invocation:a" : "invocation:b" } })),
  ];
  const admin = {
    async rpc(name: string) {
      assert.equal(name, "hide_career_work_source");
      return { data: false, error: null };
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let deleting = false;
      const matches = (row: typeof rows[number]) => Object.entries(filters).every(([field, expected]) => {
        const actual = field.startsWith("payload->>")
          ? (row.payload as Record<string, unknown>)[field.slice("payload->>".length)]
          : row[field as keyof typeof row];
        return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
      });
      const query = {
        select: () => query,
        eq(field: string, value: unknown) {
          filters[field] = value;
          return query;
        },
        in(field: string, values: unknown[]) {
          filters[field] = Array.from(values);
          return query;
        },
        or: () => query,
        delete() {
          deleting = true;
          writes.push({ table, filters });
          return query;
        },
        update() {
          writes.push({ table, filters });
          return query;
        },
        async maybeSingle() {
          return {
            data: rows.find(matches) ?? null,
            error: null,
          };
        },
        then(resolve: (value: unknown) => unknown) {
          const data = table === "talent_messages" ? rows.filter(matches) : [];
          if (deleting) for (const row of data) rows.splice(rows.indexOf(row), 1);
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
      return query;
    },
  };
  const dependencies: Record<string, unknown> = {
    "next/server": {
      NextResponse: {
        json: (body: unknown, init?: { status: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    },
    "@/lib/supabaseServer": {
      getRequestUser: async () =>
        anonymous ? null : { id: "owner", email: "ordinary-user@example.com" },
    },
    "@/lib/talentOnboarding/server": { getTalentSupabaseAdmin: () => admin },
    "@/lib/career/mockInterviewOffers.server": {},
    "@/lib/talentOpportunity": {},
    "@/lib/career/postingLinks": {},
    "@/lib/opportunityDiscovery/store": {},
    "@/lib/career/forms/server": {},
    "@/lib/career/forms/schema": {},
  };
  const source = ts.transpileModule(
    readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const loaded = {
    exports: {} as {
      DELETE: (request: {
        json: () => Promise<unknown>;
      }) => Promise<{ status: number; body: { deletedMessageIds?: number[] } }>;
    },
  };
  vm.runInNewContext(source, {
    module: loaded,
    exports: loaded.exports,
    console,
    require: (name: string) => {
      if (!(name in dependencies))
        throw Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return { remove: loaded.exports.DELETE, writes, rows };
}

test("ordinary users can delete their own message, with ownership retained on the final delete", async () => {
  const app = harness();
  const response = await app.remove({
    json: async () => ({ conversationId: "own-chat", messageId: 42 }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(
    app.writes.find((write) => write.table === "talent_messages")?.filters,
    {
      id: [42],
      conversation_id: "own-chat",
      user_id: "owner",
    }
  );
});

test("deleting an assistant reply removes its Worked rows and returns every removed ID", async () => {
  const app = harness(false, true);
  const response = await app.remove({ json: async () => ({ conversationId: "own-chat", messageId: 42 }) });
  assert.equal(response.status, 200);
  assert.deepEqual(Array.from(response.body.deletedMessageIds ?? []), [42, 41, 46]);
  assert.deepEqual(app.rows.map(row => row.id), [43, 44, 45, 47], "other replies, users and conversations remain intact");
  assert.deepEqual(app.writes.find(write => write.table === "talent_messages")?.filters, {
    id: [42, 41, 46], conversation_id: "own-chat", user_id: "owner",
  });
});

test("deleting a Worked row without a final message removes its browser card from saved history", async () => {
  const app = harness();
  const response = await app.remove({ json: async () => ({ conversationId: "own-chat", messageId: 41 }) });
  assert.equal(response.status, 200);
  assert.deepEqual(Array.from(response.body.deletedMessageIds ?? []), [41, 46]);
  assert.deepEqual(app.rows.map(row => row.id), [42, 43, 44, 45, 47]);
});

test("anonymous, foreign-message, wrong-conversation and invalid-ID requests never mutate data", async () => {
  for (const [anonymous, conversationId, messageId, status] of [
    [true, "own-chat", 42, 401],
    [false, "own-chat", 99, 404],
    [false, "other-chat", 42, 404],
    [false, "own-chat", -1, 400],
  ] as const) {
    const app = harness(anonymous);
    const response = await app.remove({
      json: async () => ({ conversationId, messageId }),
    });
    assert.equal(response.status, status);
    assert.equal(app.writes.length, 0);
  }
});
