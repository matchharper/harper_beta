import assert from "node:assert/strict";
import test from "node:test";

test("interaction updates retain first timestamp and scope the conditional write to its owner", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-test-key";
  const { updateTalentOpportunityHistoryItem } =
    await import("./talentOpportunity");
  for (const action of ["view", "click"] as const) {
    const field = action === "view" ? "viewed_at" : "clicked_at";
    const firstAt = "2026-10-01T00:00:00Z";
    let stored: string | null = firstAt;
    let patch: Record<string, string> = {};
    const equalities: unknown[] = [];
    const query = {
      update(value: Record<string, string>) {
        patch = value;
        return query;
      },
      eq(key: string, value: string) {
        equalities.push([key, value]);
        return query;
      },
      async is(key: string, value: null) {
        assert.equal(key, field);
        assert.equal(value, null);
        if (stored === null) stored = patch[field];
        return { error: null };
      },
    };
    const admin = {
      from(table: string) {
        assert.equal(table, "talent_opportunity_recommendation");
        return query;
      },
    };
    await updateTalentOpportunityHistoryItem({
      admin: admin as never,
      action,
      opportunityId: "recommendation-id",
      userId: "owner-id",
    });
    assert.equal(stored, firstAt);
    assert.deepEqual(equalities, [
      ["talent_id", "owner-id"],
      ["id", "recommendation-id"],
    ]);
    stored = null;
    await updateTalentOpportunityHistoryItem({
      admin: admin as never,
      action,
      opportunityId: "recommendation-id",
      userId: "owner-id",
    });
    assert.ok(stored);
    assert.ok(Number.isFinite(Date.parse(stored!)));
  }
});
