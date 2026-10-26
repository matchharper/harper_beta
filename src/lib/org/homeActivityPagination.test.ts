import assert from "node:assert/strict";
import test from "node:test";
import {
  activityTimestamp,
  compareActivity,
  readActivityPage,
  type ActivityEvent,
  type ActivityPosition,
} from "./homeActivityPagination";
import type { OrgHomeActivity, OrgHomeActivityFilter } from "./homeActivity";

function fixture(
  index: number,
  changes: Partial<OrgHomeActivity> = {}
): OrgHomeActivity {
  return {
    id: String(index).padStart(8, "0"),
    createdAt: "2026-10-22T01:00:00.123456Z",
    roleId: "visible-role",
    roleName: "Engineer",
    talentId: `talent-${index}`,
    talentName: `Candidate ${index}`,
    recommendationId: `rec-${index}`,
    kind: "pending_connection",
    text: "",
    ...changes,
  };
}
function readers(
  items: OrgHomeActivity[],
  allowed = (item: OrgHomeActivity) => item.roleId === "visible-role"
) {
  const source = [...items].sort(compareActivity);
  return {
    load: async (after: ActivityPosition | null) => {
      const remaining = source.filter(
        (item) => !after || compareActivity(item, after) > 0
      );
      return {
        events: remaining.slice(0, 100) as ActivityEvent[],
        hasMore: remaining.length > 100,
      };
    },
    project: async (events: ActivityEvent[]) =>
      new Map(
        events.flatMap((event) => {
          const item = items.find((item) => item.id === event.id)!;
          return allowed(item) ? [[item.id, item] as const] : [];
        })
      ),
  };
}
async function collect(
  items: OrgHomeActivity[],
  search = "",
  kind: OrgHomeActivityFilter = "all"
) {
  const seen: OrgHomeActivity[] = [];
  let after: ActivityPosition | null = null;
  const source = readers(items);
  do {
    const page = await readActivityPage({
      ...source,
      after,
      search,
      kind,
      locale: "ko",
      maxBatches: 1,
    });
    seen.push(...page.items);
    after = page.after;
  } while (after);
  return seen;
}

test("pages past 100 with equal timestamps, without duplicates or skipped items", async () => {
  const items = Array.from({ length: 235 }, (_, index) => fixture(index));
  assert.deepEqual(
    (await collect(items)).map((item) => item.id),
    items.map((item) => item.id)
  );
});

test("search and type filters find matches beyond the first 100 including empty continuation pages", async () => {
  const items = Array.from({ length: 235 }, (_, index) =>
    fixture(
      index,
      index === 223
        ? {
            kind: "candidate_message",
            text: "오래된 메시지 needle",
            talentName: "Hidden in older pages",
          }
        : {}
    )
  );
  assert.deepEqual(
    (await collect(items, "needle", "messages")).map((item) => item.id),
    [items[223].id]
  );
  assert.equal((await collect(items, "needle", "interviews")).length, 0);
  assert.equal((await collect(items, "없는검색어")).length, 0);
  assert.equal((await collect(items, "메시지가 왔어요", "messages")).length, 1);
  assert.equal((await collect(items, "engineer")).length, 235);
});

test("inaccessible or locked pairs never consume a visible page or leak into search", async () => {
  const items = Array.from({ length: 130 }, (_, index) =>
    fixture(index, {
      roleId: index < 120 ? "inaccessible-role" : "visible-role",
    })
  );
  const result = await collect(items);
  assert.equal(result.length, 10);
  assert.ok(result.every((item) => item.roleId === "visible-role"));
});

test("cursor survives insertions ahead of the current position and preserves microsecond order", async () => {
  const items = Array.from({ length: 35 }, (_, index) => fixture(index));
  const first = await readActivityPage({
    ...readers(items),
    after: null,
    search: "",
    kind: "all",
    locale: "en",
  });
  items.unshift(fixture(999, { createdAt: "2026-10-22T01:00:00.123457Z" }));
  const second = await readActivityPage({
    ...readers(items),
    after: first.after,
    search: "",
    kind: "all",
    locale: "en",
  });
  assert.equal(second.items.length, 5);
  assert.equal(second.items[0].id, "00000030");
  assert.equal(second.after, null);
  assert.equal(
    activityTimestamp("2026-10-22T10:00:00.123456+09:00"),
    "2026-10-22T01:00:00.123456Z"
  );
  assert.equal(
    compareActivity(
      fixture(99, { createdAt: "2026-10-22T01:00:00.123457Z" }),
      fixture(1)
    ),
    -1
  );
});
