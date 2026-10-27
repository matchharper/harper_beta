import assert from "node:assert/strict";
import test from "node:test";
import { hasReachedTalentFirstCapacity } from "./talentFirstCapacity";
import { readTalentFirstCapacityBlockedRoleIds } from "./talentFirstCapacity.server";

test("limit boundary, zero and unlimited capacity", () => {
  for (const [count, limit, expected] of [
    [9, 10, false],
    [10, 10, true],
    [11, 10, true],
    [0, 0, true],
    [100, null, false],
  ] as const)
    assert.equal(hasReachedTalentFirstCapacity(count, limit), expected);
});

test("reader uses latest stages, Free and paid Roles, and paginated tags", async () => {
  const roles = [
    "full",
    "free",
    "below",
    "unlimited",
    "expired",
    "test",
    "empty",
  ].map((role_id) => ({
    role_id,
    expires_at: role_id === "expired" ? "2020-01-01" : null,
    information: { testOnly: role_id === "test" },
    company_internal_roles: {
      request: role_id === "empty" ? "" : "Brief",
      max_pending_talents: role_id === "unlimited" ? null : 2,
    },
  }));
  const queries: string[] = [];
  const admin = {
    from() {
      let role = "";
      const query: any = {
        select() {
          return query;
        },
        in() {
          return query;
        },
        not() {
          return query;
        },
        order() {
          return query;
        },
        eq(key: string, value: string) {
          if (key === "opportunity_id") role = value;
          return query;
        },
        then(resolve: any) {
          resolve({ data: roles, error: null });
        },
        range(from: number) {
          queries.push(`${role}:${from}`);
          const tags =
            role === "below"
              ? [
                  { talent_id: "a", tag: "내부:연결됨" },
                  { talent_id: "a", tag: "내부:연결대기" },
                  { talent_id: "b", tag: "내부:연결대기" },
                ]
              : from === 0
                ? Array.from({ length: 1000 }, () => ({
                    talent_id: "a",
                    tag: "내부:연결대기",
                  }))
                : [{ talent_id: "b", tag: "내부:연결대기" }];
          return Promise.resolve({ data: tags, error: null });
        },
      };
      return query;
    },
    async rpc(name: string, args: { p_role_id: string }) {
      assert.equal(name, "role_matching_slot_type_v1");
      return { data: args.p_role_id === "free" ? "free" : "paid", error: null };
    },
  };
  assert.deepEqual(
    await readTalentFirstCapacityBlockedRoleIds(
      admin as any,
      roles.map((r) => r.role_id)
    ),
    ["full", "free"]
  );
  assert.ok(queries.includes("full:1000"));
  assert.ok(!queries.some((q) => q.startsWith("test:")));
});
