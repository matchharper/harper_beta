import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  candidateProfileViewId,
  recordCandidateProfileView,
} from "./candidateProfileView";

const base = {
  companyUserId: "00000000-0000-4000-8000-000000000001",
  talentId: "00000000-0000-4000-8000-000000000002",
  workspaceId: "00000000-0000-4000-8000-000000000003",
  roleId: "00000000-0000-4000-8000-000000000004",
  email: "teammate@example.com",
  source: "web" as const,
};

test("first view is scoped to company, teammate and candidate", () => {
  const id = candidateProfileViewId(
    base.workspaceId,
    base.companyUserId,
    base.talentId
  );
  for (const key of ["workspaceId", "companyUserId", "talentId"] as const) {
    const other = { ...base, [key]: "00000000-0000-4000-8000-000000000009" };
    assert.notEqual(
      id,
      candidateProfileViewId(
        other.workspaceId,
        other.companyUserId,
        other.talentId
      )
    );
  }
});

test("concurrent web/Slack opens across roles preserve one original event in Postgres", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create table talent_progress (id uuid primary key, payload jsonb not null, created_at timestamptz default now())"
    );
    const admin = {
      from(table: string) {
        assert.equal(table, "talent_progress");
        return {
          async upsert(row: unknown, options: unknown) {
            assert.deepEqual(options, {
              onConflict: "id",
              ignoreDuplicates: true,
            });
            await db.query(
              "insert into talent_progress(id,payload) values ($1,$2) on conflict (id) do nothing",
              [(row as { id: string }).id, JSON.stringify(row)]
            );
            return { error: null };
          },
        };
      },
    } as any;
    await recordCandidateProfileView({ ...base, admin });
    const original = await db.query("select * from talent_progress");
    await Promise.all([
      recordCandidateProfileView({ ...base, admin, source: "slack" }),
      recordCandidateProfileView({
        ...base,
        admin,
        roleId: "00000000-0000-4000-8000-000000000005",
      }),
    ]);
    assert.deepEqual(
      (await db.query("select * from talent_progress")).rows,
      original.rows
    );
    const payload = (original.rows[0] as any).payload;
    assert.equal(payload.company_user_id, base.companyUserId);
    assert.equal(payload.open_to_talent, false);
    assert.equal(payload.open_to_company, false);
    assert.equal(payload.metadata.source, "web");
    await recordCandidateProfileView({
      ...base,
      admin,
      companyUserId: "00000000-0000-4000-8000-000000000006",
    });
    assert.equal(
      (await db.query("select * from talent_progress")).rows.length,
      2
    );
  } finally {
    await db.close();
  }
});

test("internal operator views are excluded", async () => {
  await recordCandidateProfileView({
    ...base,
    email: "ops@matchharper.com",
    admin: {
      from() {
        throw new Error("must not write");
      },
    } as any,
  });
});

test("storage errors surface for logging and retry", async () => {
  await assert.rejects(
    recordCandidateProfileView({
      ...base,
      admin: {
        from() {
          return { upsert: async () => ({ error: new Error("write failed") }) };
        },
      } as any,
    }),
    /write failed/
  );
});
