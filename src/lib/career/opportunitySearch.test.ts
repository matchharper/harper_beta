import assert from "node:assert/strict";
import test from "node:test";
import { filterOpportunitySearchItems, type OpportunitySearchItem } from "./opportunitySearch";
import { createRequire } from "node:module";

async function loadReader() {
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

test("search scans beyond the first database page and reads owned, visible memos without writes", async () => {
  const fetchTalentOpportunitySearchItems = await loadReader();
  const ranges: number[] = [];
  const rows = Array.from({ length: 205 }, (_, index) => ({
    id: `rec-${index}`, role_id: `role-${index}`, created_at: "2026-11-01T00:00:00Z",
    feedback: "like", saved_stage: "saved", list_position: "current", kind: "recommendation",
    company_role: { role_id: `role-${index}`, name: `Engineer ${index}`, source_type: "external", status: "active",
      company_workspace: { company_name: "Example" } },
  }));
  const admin = {
    from(table: string) {
      assert.ok(["talent_effective_opportunity_recommendations_v1", "talent_progress"].includes(table));
      const filters = new Map<string, unknown>();
      let roleIds: string[] = [];
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters.set(key, value); return query; },
        order() { return query; },
        or(filter: string) { assert.match(filter, /list_position.eq.previous/); assert.match(filter, /saved_stage.eq.hidden/); return query; },
        in(_key: string, values: string[]) { roleIds = values; return query; },
        async range(from: number, to: number) {
          assert.equal(filters.get("talent_id"), "owner");
          if (table === "talent_progress") {
            assert.equal(filters.get("open_to_talent"), true);
            assert.equal(filters.get("kind"), "memo");
            return { data: roleIds.includes("role-204") ? [{ role_id: "role-204", text: "마지막 페이지 메모" }] : [], error: null };
          }
          ranges.push(from);
          return { data: rows.slice(from, to + 1), error: null };
        },
      };
      return query;
    },
  };
  const result = await fetchTalentOpportunitySearchItems({ admin: admin as never, userId: "owner" });
  assert.deepEqual(ranges, [0, 100, 200]);
  assert.equal(result.length, 205);
  assert.equal(filterOpportunitySearchItems(result, "마지막 페이지 메모")[0]?.id, "rec-204");
});

test("a failed page rejects the collection rather than presenting partial results as complete", async () => {
  const fetchTalentOpportunitySearchItems = await loadReader();
  const query = { select() { return this; }, eq() { return this; }, order() { return this; }, or() { return this; },
    async range() { return { data: null, error: { message: "read failed" } }; } };
  await assert.rejects(fetchTalentOpportunitySearchItems({ admin: { from: () => query } as never, userId: "owner" }), /read failed/);
});
