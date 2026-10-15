import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import type { User } from "@supabase/supabase-js";
import ts from "typescript";

// Execute the actual profile-sync functions without importing the unrelated
// Slack, billing and LLM adapters in the large server module.
const source = ts.createSourceFile(
  "server.ts",
  readFileSync(new URL("./server.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true
);
const functions = new Set([
  "normalizeText",
  "normalizeNullableText",
  "getUserName",
  "upsertOrgCompanyUser",
]);
const compiled = ts.transpileModule(
  source.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) && functions.has(node.name?.text ?? "")
    )
    .map((node) => node.getText(source))
    .join("\n"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }
).outputText;
const loaded = {
  exports: {} as Pick<typeof import("./server"), "upsertOrgCompanyUser">,
};
vm.runInNewContext(compiled, {
  module: loaded,
  exports: loaded.exports,
});
const { upsertOrgCompanyUser } = loaded.exports;

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "user@example.com",
  user_metadata: {
    full_name: "Auth name",
    avatar_url: "https://example.com/avatar.png",
  },
} as unknown as User;

function companyUsers(existing: Record<string, unknown> | null) {
  const writes: Array<{ operation: string; values: Record<string, unknown> }> =
    [];
  const admin = {
    from(table: string) {
      assert.equal(table, "company_users");
      return {
        select() {
          return this;
        },
        eq(field: string, value: string) {
          assert.equal(field, "user_id");
          assert.equal(value, user.id);
          return this;
        },
        maybeSingle: async () => ({ data: existing, error: null }),
        update(values: Record<string, unknown>) {
          writes.push({ operation: "update", values });
          return this;
        },
        async upsert(values: Record<string, unknown>, options: unknown) {
          assert.deepEqual(JSON.parse(JSON.stringify(options)), {
            onConflict: "user_id",
            ignoreDuplicates: true,
          });
          writes.push({ operation: "upsert", values });
          return { error: null };
        },
        then(resolve: (value: { error: null }) => unknown) {
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
    },
  } as unknown as Parameters<
    (typeof import("./server"))["upsertOrgCompanyUser"]
  >[0];
  return { admin, writes };
}

test("reloading an unchanged account does not write its profile again", async () => {
  const { admin, writes } = companyUsers({
    user_id: user.id,
    email: user.email,
    name: "Saved name",
    profile_picture: user.user_metadata.avatar_url,
    is_authenticated: true,
  });
  await upsertOrgCompanyUser(admin, user);
  assert.deepEqual(writes, []);
});

test("changed auth details are saved while the user's chosen name and locale are preserved", async () => {
  const { admin, writes } = companyUsers({
    user_id: user.id,
    email: "old@example.com",
    name: "Saved name",
    profile_picture: null,
    is_authenticated: true,
    locale: "ko",
  });
  await upsertOrgCompanyUser(admin, user);
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [
    {
      operation: "update",
      values: {
        email: user.email,
        name: "Saved name",
        profile_picture: user.user_metadata.avatar_url,
        is_authenticated: true,
      },
    },
  ]);
});

test("first access still creates the account and safely refreshes a concurrently created row", async () => {
  const { admin, writes } = companyUsers(null);
  await upsertOrgCompanyUser(admin, user);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].operation, "upsert");
  assert.equal(writes[0].values.user_id, user.id);
  assert.equal(writes[1].operation, "update");
  assert.equal("locale" in writes[0].values, false);
  assert.equal("locale" in writes[1].values, false);
});
