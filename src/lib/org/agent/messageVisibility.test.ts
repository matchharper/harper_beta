import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createClient, type User } from "@supabase/supabase-js";
import ts from "typescript";
import { getEmailDomain, INTERNAL_EMAIL_DOMAIN } from "../../internalAccess";

// Exercise the history reader and real PostgREST query builder without loading
// the unrelated LLM, Slack and billing adapters imported by store.ts.
const source = ts.createSourceFile(
  "store.ts",
  readFileSync(new URL("./store.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true
);
const reader = source.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "fetchOrgAgentMessages"
)!;
const compiled = ts.transpileModule(reader.getText(source), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function readHistory(email: string | undefined, mode = "role") {
  const requests: URL[] = [];
  const admin = createClient("https://fixture.supabase.co", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        requests.push(new URL(String(input)));
        return new Response("[]", { headers: { "Content-Type": "application/json" } });
      },
    },
  });
  const scoped = async () => ({
    admin,
    conversation: { id: "conversation", hidden_through_message_id: 10 },
  });
  const loaded = { exports: {} as Pick<typeof import("./store"), "fetchOrgAgentMessages"> };
  vm.runInNewContext(compiled, {
    module: loaded,
    exports: loaded.exports,
    getEmailDomain,
    INTERNAL_EMAIL_DOMAIN,
    normalizeText: (value: unknown) => String(value ?? "").trim(),
    findOrgRoleConversationForRead: scoped,
    ensureOrgAgentConversation: scoped,
    toOrgAgentConversation: (value: unknown) => value,
    toOrgAgentMessage: (value: unknown) => value,
  });
  await loaded.exports.fetchOrgAgentMessages({
    user: { id: "viewer", email } as User,
    mode: mode as "role",
    roleId: "role",
    workspaceId: "workspace",
    beforeMessageId: 100,
    limit: 30,
  });
  return requests.map((request) => request.searchParams);
}

test("external role readers exclude internal authors in both history and latest-user queries", async () => {
  for (const mode of ["role", "role_creation"]) {
    for (const email of ["team@example.com", "user@sub.matchharper.com", "user@matchharper.com.example", undefined]) {
      const queries = await readHistory(email, mode);
      assert.equal(queries.length, 2);
      for (const query of queries) {
        assert.ok(query.get("select")?.includes("internal_author:company_users!company_messages_company_user_id_fkey()"));
        assert.equal(query.get("internal_author.email"), "ilike.%@matchharper.com");
        assert.equal(query.get("internal_author"), "is.null");
        assert.equal(query.get("conversation_id"), "eq.conversation");
        assert.equal(query.get("message_type"), "in.(chat,slack)");
      }
      assert.deepEqual(queries[0].getAll("id"), ["gt.10", "lt.100"]);
      assert.equal(queries[0].get("limit"), "31");
      assert.equal(queries[1].get("limit"), "1");
      assert.equal(queries[1].get("role"), "eq.user");
    }
  }
});

test("internal viewers retain all authors, including case-insensitive domain matches", async () => {
  for (const email of ["user@matchharper.com", " User@MATCHHARPER.COM "]) {
    for (const query of await readHistory(email)) {
      assert.equal(query.has("internal_author"), false);
      assert.equal(query.get("select")?.includes("internal_author"), false);
    }
  }
});

test("general conversation history keeps its existing visibility", async () => {
  for (const query of await readHistory("team@example.com", "general")) {
    assert.equal(query.has("internal_author"), false);
    assert.equal(query.get("message_type"), "eq.chat");
  }
});
