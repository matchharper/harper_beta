import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function harness(anonymous = false) {
  const writes: { table: string; filters: Record<string, unknown> }[] = [];
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq(field: string, value: unknown) {
          filters[field] = value;
          return query;
        },
        or: () => query,
        delete() {
          writes.push({ table, filters });
          return query;
        },
        update() {
          writes.push({ table, filters });
          return query;
        },
        async maybeSingle() {
          return {
            data:
              filters.id === 42 &&
              filters.conversation_id === "own-chat" &&
              filters.user_id === "owner"
                ? { id: 42 }
                : null,
            error: null,
          };
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
      }) => Promise<{ status: number }>;
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
  return { remove: loaded.exports.DELETE, writes };
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
      id: 42,
      conversation_id: "own-chat",
      user_id: "owner",
    }
  );
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
