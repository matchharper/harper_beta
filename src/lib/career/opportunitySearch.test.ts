import assert from "node:assert/strict";
import test from "node:test";
import { filterOpportunitySearchItems, type OpportunitySearchItem } from "./opportunitySearch";
import { createRequire } from "node:module";
import { historyPredicates } from "./opportunityHistorySql";

async function loadReader() {
  process.env.OPENAI_API_KEY ??= "test-only";
  // The history module also exposes writes. Isolate that unrelated adapter so
  // these read-only tests cannot initialize external clients or send anything.
  const require = createRequire(import.meta.url);
  const path = require.resolve("../org/server");
  const previous = require.cache[path];
  require.cache[path] = { id: path, filename: path, loaded: true, exports: {} } as NodeModule;
  try {
    return (await import("../talentOpportunity")).fetchTalentOpportunitySearchItems;
  } finally {
    if (previous) require.cache[path] = previous;
    else delete require.cache[path];
  }
}

test("search matches Korean, case-insensitive terms across fields, and literal punctuation", () => {
  const items = [{ id: "one", companyName: "토스", title: "Senior C++ Engineer", location: "서울", description: "Payments platform", talentMemo: "다음 주 연락" },
    { id: "two", companyName: "Other", title: "Designer", location: null, description: null, talentMemo: null }] as OpportunitySearchItem[];
  for (const query of ["토스", "  서울   ENGINEER ", "C++", "다음 주", "PAYMENTS", "서울".normalize("NFD")]) {
    assert.deepEqual(filterOpportunitySearchItems(items, query).map(item => item.id), ["one"]);
  }
  assert.equal(filterOpportunitySearchItems(items, "  ").length, 2);
  assert.equal(filterOpportunitySearchItems(items, "[.*]").length, 0);
});

for (const scope of [undefined, "new"] as const) {
  test(`search (${scope ?? "default"}) reads the full owned collection and visible memos`, async () => {
    const fetchTalentOpportunitySearchItems = await loadReader();
    const userId = "00000000-0000-4000-8000-000000000001";
    const pageSizes: number[] = [];
    const rows = Array.from({ length: 205 }, (_, index) => ({
      id: `rec-${index}`, role_id: `role-${index}`, created_at: "2026-11-01T00:00:00Z",
      feedback: scope === "new" ? null : "like",
      saved_stage: scope === "new" ? null : "saved",
      list_position: "current",
      company_role: { role_id: `role-${index}`, name: `Engineer ${index}`, source_type: "external", status: "active",
        company_workspace: { company_name: "Example" } },
    }));
    const admin = {
      async rpc(name: string, { sql_query }: { sql_query: string }) {
        assert.equal(name, "set_timeout_and_execute_raw_sql");
        assert.ok(sql_query.includes(`WHERE talent_id='${userId}'::uuid`));
        const predicate = scope === "new"
          ? historyPredicates.new
          : `(${historyPredicates.archived} OR ${historyPredicates.saved})`;
        assert.ok(sql_query.includes(`FROM effective WHERE true AND ${predicate}`));
        assert.doesNotMatch(sql_query, /\bLIMIT\b/i);
        const items = rows.map(({ id, role_id, list_position }) => ({ id, role_id, list_position }));
        return { data: [[{ items }]], error: null };
      },
      from(table: string) {
        assert.ok(["talent_opportunity_recommendation", "talent_progress"].includes(table));
        const filters = new Map<string, unknown>();
        let roleIds: string[] = [];
        const query = {
          select() { return query; },
          eq(key: string, value: unknown) { filters.set(key, value); return query; },
          order() { return query; },
          in(key: string, values: string[]) {
            assert.equal(filters.get("talent_id"), userId);
            if (table === "talent_progress") {
              assert.equal(key, "role_id");
              roleIds = values;
              return query;
            }
            assert.equal(key, "id");
            pageSizes.push(values.length);
            return { data: rows.filter(({ id }) => values.includes(id)), error: null };
          },
          async range() {
            assert.equal(filters.get("open_to_talent"), true);
            assert.equal(filters.get("kind"), "memo");
            return { data: roleIds.includes("role-204") ? [{ role_id: "role-204", text: "마지막 페이지 메모" }] : [], error: null };
          },
        };
        return query;
      },
    };
    const result = await fetchTalentOpportunitySearchItems({ admin: admin as never, userId, scope });
    assert.deepEqual(pageSizes, [100, 100, 5]);
    assert.equal(result.length, 205);
    assert.equal(filterOpportunitySearchItems(result, "마지막 페이지 메모")[0]?.id, "rec-204");
  });
}

test("a failed page rejects the collection rather than presenting partial results as complete", async () => {
  const fetchTalentOpportunitySearchItems = await loadReader();
  const admin = {
    async rpc() {
      return { data: [[{ items: [{ id: "rec-1" }] }]], error: null };
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async in() { return { data: null, error: { message: "read failed" } }; },
      };
    },
  };
  await assert.rejects(fetchTalentOpportunitySearchItems({ admin: admin as never, userId: "owner" }), /read failed/);
});
