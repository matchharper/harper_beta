import assert from "node:assert/strict";
import test from "node:test";
import { resolveOrgChatResponseLocale } from "./memberLocale.server";

function fakeAdmin(result: { data?: { locale: string | null } | null; error?: { message: string } | null }) {
  const reads: string[] = [];
  const admin = {
    from(table: string) {
      return {
        select(columns: string) {
          reads.push(`${table}: ${columns}`);
          const query = { eq: () => query, maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }) };
          return query;
        },
      };
    },
  };
  return { admin: admin as any, reads };
}

test("web chat answers in the member's saved language before the screen language", async () => {
  const { admin, reads } = fakeAdmin({ data: { locale: "en" } });
  assert.equal(await resolveOrgChatResponseLocale({ admin, screenLocale: "ko", userId: "user-a" }), "en");
  assert.deepEqual(reads, ["company_users: locale"]);
});

test("without a saved member language web chat keeps the screen language", async () => {
  assert.equal(await resolveOrgChatResponseLocale({ admin: fakeAdmin({ data: { locale: null } }).admin, screenLocale: "ko", userId: "user-a" }), "ko");
  assert.equal(await resolveOrgChatResponseLocale({ admin: fakeAdmin({ data: null }).admin, userId: "user-a" }), undefined);
  assert.equal(await resolveOrgChatResponseLocale({ admin: fakeAdmin({ error: { message: "timeout" } }).admin, screenLocale: "en", userId: "user-a" }), "en");
});
