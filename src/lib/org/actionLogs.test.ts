import assert from "node:assert/strict";
import test from "node:test";
import { recordOrgAction, recordOrgIntroDecision } from "./actionLogs";

function fixture(
  intro: Record<string, unknown> | null,
  readError: unknown = null
) {
  const rows = new Map<string, any>();
  const filters: Record<string, unknown> = {};
  const admin = {
    from(table: string) {
      if (table === "talent_progress")
        return {
          async upsert(row: any, options: any) {
            assert.deepEqual(options, {
              onConflict: "id",
              ignoreDuplicates: true,
            });
            if (!rows.has(row.id)) rows.set(row.id, row);
            return { error: null };
          },
        };
      assert.equal(table, "company_intro_candidates");
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return query;
        },
        async maybeSingle() {
          return { data: intro, error: readError };
        },
      };
      return query;
    },
  } as any;
  return { admin, rows, filters };
}
const intro = {
  id: "intro",
  role_id: "role",
  talent_id: "talent",
  requested_by_company_user_id: "actor",
  requested_at: "2026-10-13T01:00:00Z",
  updated_at: "2026-10-13T02:00:00Z",
  status: "awaiting_talent",
};

test("Intro request logs the persisted actor/time, never delivery completion", async () => {
  const f = fixture(intro);
  await recordOrgIntroDecision({
    admin: f.admin,
    workspaceId: "workspace",
    introCandidateId: "intro",
    decision: "request",
  });
  const row = [...f.rows.values()][0];
  assert.equal(row.company_user_id, "actor");
  assert.equal(row.created_at, intro.requested_at);
  assert.equal(row.kind, "org_company_intro_requested");
  assert.equal(row.open_to_talent, false);
  assert.equal(row.open_to_company, false);
  assert.deepEqual(f.filters, {
    id: "intro",
    company_workspace_id: "workspace",
  });
});

test("retries preserve the first decision event", async () => {
  const f = fixture({ ...intro, status: "passed", requested_at: null });
  const args = {
    admin: f.admin,
    workspaceId: "workspace",
    introCandidateId: "intro",
    decision: "pass" as const,
  };
  await Promise.all([
    recordOrgIntroDecision(args),
    recordOrgIntroDecision(args),
  ]);
  assert.equal(f.rows.size, 1);
  assert.equal([...f.rows.values()][0].kind, "org_company_intro_passed");
});

test("unconfirmed, missing and unrelated decisions do not produce events", async () => {
  for (const row of [
    null,
    { ...intro, requested_by_company_user_id: null },
    { ...intro, requested_at: null, status: "ready" },
  ]) {
    const f = fixture(row);
    for (const decision of ["request", "pass"] as const) {
      await recordOrgIntroDecision({
        admin: f.admin,
        workspaceId: "workspace",
        introCandidateId: "intro",
        decision,
      });
    }
    assert.equal(f.rows.size, 0);
  }
});

test("workspace actions preserve actor, target and before/after without external payloads", async () => {
  const inserted: any[] = [];
  const metadata = {
    workspaceId: "workspace",
    targetUserId: "target",
    before: "viewer",
    after: "admin",
  };
  const admin = {
    from(table: string) {
      assert.equal(table, "logs");
      return {
        async insert(row: any) {
          inserted.push(row);
          return { error: null };
        },
      };
    },
  } as any;
  assert.equal(
    await recordOrgAction({
      admin,
      actorUserId: "actor",
      type: "org_member_authority_changed",
      metadata,
    }),
    true
  );
  assert.deepEqual(inserted, [
    {
      user_id: "actor",
      type: "org_member_authority_changed",
      meta_data: metadata,
    },
  ]);
});

test("logging failures cannot report a completed business action as failed", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const rejects of [true, false]) {
    const admin = {
      from() {
        return {
          async insert() {
            if (rejects) throw new Error("offline");
            return { error: new Error("offline") };
          },
        };
      },
    } as any;
    assert.equal(
      await recordOrgAction({
        admin,
        actorUserId: "actor",
        type: "org_member_removed",
        metadata: { workspaceId: "workspace" },
      }),
      false
    );
  }
  const f = fixture(null, new Error("offline"));
  await assert.doesNotReject(
    recordOrgIntroDecision({
      admin: f.admin,
      workspaceId: "workspace",
      introCandidateId: "intro",
      decision: "request",
    })
  );
});
