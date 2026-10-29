import assert from "node:assert/strict";
import test from "node:test";

test("external direct-apply records feedback without entering internal acceptance or sending a revision", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-test-key";
  const { updateTalentOpportunityHistoryItem } = await import("./talentOpportunity");
  const calls: string[] = [];
  const ownerFilters: unknown[] = [];
  const query = {
    select() { return query; },
    eq(key: string, value: string) { ownerFilters.push([key, value]); return query; },
    async maybeSingle() { return { data: { opportunity_type: "external_jd", company_role: { source_type: "external" } }, error: null }; },
  };
  const admin = {
    from(table: string) { assert.equal(table, "talent_opportunity_recommendation"); return query; },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push(name);
      assert.equal(args.p_talent_id, "owner-id");
      assert.equal(args.p_recommendation_id, "recommendation-id");
      assert.equal("p_expected_updated_at" in args, false);
      if (name === "current_talent_recommendation_for_talent_v1") return { data: "recommendation-id", error: null };
      assert.equal(name, "update_talent_role_feedback_v2");
      assert.equal(args.p_feedback, "like");
      assert.equal(args.p_saved_stage, "applied");
      return { data: { status: "updated" }, error: null };
    },
  };
  const result = await updateTalentOpportunityHistoryItem({
    admin: admin as never, action: "feedback", feedback: "positive", savedStage: "applied",
    opportunityId: "recommendation-id", userId: "owner-id",
    ...{ expectedUpdatedAt: "stale-client-value" },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["current_talent_recommendation_for_talent_v1", "update_talent_role_feedback_v2"]);
  assert.ok(ownerFilters.some(([key, value]: any) => key === "talent_id" && value === "owner-id"));
});

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
