import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("receipts enforce per-account uniqueness and ownership in Postgres", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values
        ('00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000002');
    `);
    await db.exec(
      await readFile(
        new URL(
          "../../../supabase/migrations/20261008102538_user_announcement_receipts.sql",
          import.meta.url
        ),
        "utf8"
      )
    );
    await db.exec(
      `set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';`
    );
    const claim = (user: number) =>
      db.query(`
      insert into public.user_announcement_receipts(user_id, announcement_id)
      values ('00000000-0000-0000-0000-00000000000${user}', 'welcome')
      on conflict (user_id, announcement_id) do nothing returning announcement_id
    `);
    assert.equal((await claim(1)).rows.length, 1);
    assert.equal((await claim(1)).rows.length, 0);
    await assert.rejects(claim(2), /row-level security/);
    await assert.rejects(
      db.exec("delete from public.user_announcement_receipts"),
      /permission denied/
    );
    await db.exec(
      `set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';`
    );
    assert.equal(
      (await db.query("select * from public.user_announcement_receipts")).rows
        .length,
      0
    );
    assert.equal((await claim(2)).rows.length, 1);
    await db.exec("reset role; set role anon;");
    await assert.rejects(
      db.query("select * from public.user_announcement_receipts"),
      /permission denied/
    );
  } finally {
    await db.close();
  }
});
