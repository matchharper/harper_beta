import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { saveTalentPosting } from "./savePosting";

function harness(
  options: {
    role?: Record<string, unknown> | null;
    existing?: Record<string, unknown> | null;
    saveError?: Error;
  } = {}
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const filters: [string, string, unknown][] = [];
  const role =
    options.role === undefined
      ? {
          role_id: "role",
          source_type: "external",
          source_provider: "linkedin",
          company_workspace_id: "workspace",
          information: {},
        }
      : options.role;
  const admin = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([table, key, value]);
          return query;
        },
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data: table === "company_roles" ? role : (options.existing ?? null),
          error: null,
        }),
      };
      return query;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return {
        data: [{ recommendation_id: "saved-record" }],
        error: options.saveError ?? null,
      };
    },
  } as unknown as TalentAdminClient;
  return {
    calls,
    filters,
    save: () => saveTalentPosting({ admin, roleId: "role", userId: "talent" }),
  };
}

test("saving a public job uses the atomic recommendation and like path for the authenticated talent", async () => {
  const h = harness();
  assert.equal(await h.save(), "saved-record");
  assert.deepEqual(h.calls, [
    {
      name: "import_talent_job_link",
      args: {
        p_existing_role_id: "role",
        p_role: {},
        p_saved_stage: "saved",
        p_talent_id: "talent",
        p_workspace: {},
        p_workspace_id: "workspace",
      },
    },
  ]);
  assert.ok(
    h.filters.some(
      ([table, key, value]) =>
        table === "talent_opportunity_recommendation" &&
        key === "talent_id" &&
        value === "talent"
    )
  );
});

test("repeat saves preserve saved and progressed stages without rewriting feedback", async () => {
  for (const saved_stage of [null, "saved", "applied", "connected", "closed"]) {
    const h = harness({
      existing: { id: "existing", feedback: "like", saved_stage },
    });
    assert.equal(await h.save(), "existing");
    assert.equal(h.calls.length, 0);
  }
});

test("dismissed or hidden jobs can be explicitly saved again", async () => {
  for (const existing of [
    { id: "existing", feedback: "dislike", saved_stage: null },
    { id: "existing", feedback: "like", saved_stage: "hidden" },
  ]) {
    const h = harness({ existing });
    assert.equal(await h.save(), "saved-record");
    assert.equal(h.calls.length, 1);
  }
});

test("missing, internal, test-only, and another talent's private jobs cannot be saved", async () => {
  for (const role of [
    null,
    { source_type: "internal" },
    { source_type: "external", information: { testOnly: true } },
    { source_type: "external", information: { testOnly: "true" } },
    { source_type: "external", source_provider: "user_submitted" },
  ]) {
    const h = harness({ role });
    await assert.rejects(h.save(), /Job unavailable/);
    assert.equal(h.calls.length, 0);
  }
});

test("a talent can restore their own imported job", async () => {
  const h = harness({
    role: {
      source_type: "external",
      source_provider: "user_submitted",
      company_workspace_id: "workspace",
    },
    existing: { id: "own", feedback: "dislike" },
  });
  assert.equal(await h.save(), "saved-record");
});

test("failed saves propagate failure instead of reporting success", async () => {
  const h = harness({ saveError: new Error("database unavailable") });
  await assert.rejects(h.save(), /database unavailable/);
});
