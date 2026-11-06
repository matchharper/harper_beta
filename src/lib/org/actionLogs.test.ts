import assert from "node:assert/strict";
import test from "node:test";
import { recordOrgAction, recordOrgPassReasonNote } from "./actionLogs";

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
  status: "passed",
};
const passArgs = (admin: unknown, reason?: string) => ({
  admin: admin as any,
  workspaceId: "workspace",
  introCandidateId: "intro",
  reason,
});

test("a web Pass reason stays a company-only note on the candidate", async () => {
  const f = fixture(intro);
  await recordOrgPassReasonNote(passArgs(f.admin, "  연차가 부족해요  "));
  assert.equal(f.rows.size, 1);
  const row = [...f.rows.values()][0];
  assert.equal(row.kind, "org_note");
  assert.equal(row.text, "연차가 부족해요");
  assert.equal(row.company_user_id, "actor");
  assert.equal(row.open_to_talent, false);
  assert.equal(row.open_to_company, true);
  assert.deepEqual(f.filters, { id: "intro", company_workspace_id: "workspace" });
});

test("the Pass decision itself is no longer copied into talent_progress", async () => {
  const f = fixture(intro);
  await recordOrgPassReasonNote(passArgs(f.admin));
  await recordOrgPassReasonNote(passArgs(f.admin, "   "));
  assert.equal(f.rows.size, 0);
});

test("retries keep one note, and only for a confirmed Pass", async () => {
  const f = fixture(intro);
  await Promise.all([
    recordOrgPassReasonNote(passArgs(f.admin, "같은 사유")),
    recordOrgPassReasonNote(passArgs(f.admin, "같은 사유")),
  ]);
  assert.equal(f.rows.size, 1);
  for (const row of [
    null,
    { ...intro, requested_by_company_user_id: null },
    { ...intro, status: "ready" },
  ]) {
    const other = fixture(row);
    await recordOrgPassReasonNote(passArgs(other.admin, "사유"));
    assert.equal(other.rows.size, 0);
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
    recordOrgPassReasonNote(passArgs(f.admin, "사유"))
  );
});
