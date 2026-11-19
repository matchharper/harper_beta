import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

test("matching history pages only explicitly linked, currently readable receipts", async () => {
  process.env.OPENAI_API_KEY ??= "synthetic-no-network";
  const { readMatchingResearchActivity } = await import("./researchActivity");
  const db = new PGlite();
  const id = (n: number) =>
    `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
  const owner = id(1),
    other = id(2),
    matching = id(3),
    empty = id(4);
  const admin = {
    rpc: async (_name: string, args: { sql_query: string }) => ({
      data: (await db.query(args.sql_query)).rows,
      error: null,
    }),
  } as unknown as TalentAdminClient;
  const page = (
    input: {
      before?: string;
      matchingId?: string;
      userId?: string;
      limit?: number;
    } = {}
  ) =>
    readMatchingResearchActivity({
      admin,
      userId: owner,
      matchingId: matching,
      ...input,
    });
  try {
    await db.exec(`
      create table talent_users(user_id uuid primary key,deleted_at timestamptz);
      create table talent_matchings(id uuid primary key,talent_id uuid);
      create table talent_external_operations(id uuid primary key,user_id uuid,kind text,status text,
        created_at timestamptz default '2026-11-17T04:00:00Z',request jsonb,result jsonb);
      create table talent_integrations(talent_id uuid,provider text,status text,career_mail_sync jsonb);
      create function career_resource_available_v1(p_user uuid,p_ref jsonb) returns boolean language sql stable as $$
        select exists(select 1 from talent_external_operations where user_id=p_user and id=(p_ref->>'id')::uuid
          and result->>'source_unavailable' is distinct from 'true')
      $$;
    `);
    await db.query("insert into talent_users(user_id) values ($1),($2)", [
      owner,
      other,
    ]);
    await db.query("insert into talent_matchings values ($1,$3),($2,$3)", [
      matching,
      empty,
      owner,
    ]);
    const insert = (
      n: number,
      who: string,
      kind: string,
      request: Record<string, unknown>,
      result: Record<string, unknown>
    ) =>
      db.query(
        "insert into talent_external_operations(id,user_id,kind,status,request,result) values ($1,$2,$3,'completed',$4,$5)",
        [id(n), who, kind, JSON.stringify(request), JSON.stringify(result)]
      );
    const scope = { matchingId: matching };
    await insert(
      10,
      owner,
      "resource_search",
      { ...scope, source: "web", scope: { query: "private-text" } },
      { count: 4 }
    );
    await insert(11, owner, "resource_research", scope, {
      completed: 2,
      failed: 1,
      body: "private-text",
    });
    await insert(12, owner, "resource_evaluation", scope, {
      completed: 1,
      failed: 0,
    });
    await insert(13, other, "resource_search", scope, { count: 1 });
    await insert(14, owner, "resource_item", scope, {});
    await insert(15, owner, "resource_search", {}, { count: 8 });
    await insert(
      16,
      owner,
      "resource_search",
      { ...scope, source: "gmail", mailboxGeneration: "revoked" },
      { count: 3 }
    );
    await insert(17, owner, "resource_research", scope, {
      source_unavailable: true,
    });
    const first = await page({ limit: 2 });
    assert.deepEqual(
      first.operations.map((o) => o.id),
      [id(12), id(11)]
    );
    assert.equal(first.nextBefore, id(11));
    assert.match(first.modelOutput, /2 completed · 1 failed/);
    assert.ok(!JSON.stringify(first).includes("private-text"));
    const rest = await page({ before: first.nextBefore! });
    assert.deepEqual(
      rest.operations.map((o) => o.id),
      [id(10)]
    );
    assert.equal(rest.nextBefore, null);
    assert.match(rest.modelOutput, /4 returned/);
    assert.ok(!JSON.stringify(rest).includes("private-text"));
    assert.deepEqual((await page({ matchingId: empty })).operations, []);
    await assert.rejects(page({ userId: other }), /Matching is unavailable/);
    await assert.rejects(page({ before: id(13) }), /cursor is unavailable/);
  } finally {
    await db.close();
  }
});
