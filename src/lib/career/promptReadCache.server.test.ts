import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { withCareerPromptReadCache, readCareerPromptValue, invalidateCareerPromptReadCache } from "./promptReadCache.server";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

test("revision validation does not gate unrelated turn preparation and missing migrations fall back to fresh reads", async () => {
  let release!: (value: unknown) => void;
  const revision = new Promise(resolve => { release = resolve; });
  const query: any = { select: () => query, eq: () => query, maybeSingle: () => revision };
  const admin = { from: () => query } as unknown as TalentAdminClient;
  let started = false, reads = 0;
  const turn = withCareerPromptReadCache(admin, "owner", async () => {
    started = true;
    const [first, second] = await Promise.all([
      readCareerPromptValue("owner", "profile", async () => ++reads),
      readCareerPromptValue("owner", "profile", async () => ++reads),
    ]);
    assert.equal(first, second, "missing revision still shares a read within this request");
    return first;
  });
  assert.equal(started, true, "history and Decisions can start while revision validation is pending");
  assert.equal(reads, 0, "source reuse still waits for its freshness boundary");
  release({ data: null, error: { message: "column unavailable" } });
  assert.equal(await turn, 1);
  assert.equal(await withCareerPromptReadCache(admin, "owner", () => readCareerPromptValue("owner", "profile", async () => ++reads)), 2);
});

test("subsequent turns reuse source facts, changes invalidate them, and owners/mutations are isolated", async () => {
  const owner = crypto.randomUUID();
  let revision = "first", reads = 0;
  const admin = { from() { const q = { select: () => q, eq: () => q,
    maybeSingle: async () => ({ data: { career_context_revision: revision }, error: null }) }; return q; } } as unknown as TalentAdminClient;
  const load = () => readCareerPromptValue(owner, "profile", async () => ({ value: ++reads }));
  await withCareerPromptReadCache(admin, owner, async () => {
    const [a, b] = await Promise.all([load(), load()]);
    assert.equal(reads, 1); a.value = 99; assert.equal(b.value, 1);
  });
  assert.equal((await withCareerPromptReadCache(admin, owner, load)).value, 1);
  revision = "changed";
  assert.equal((await withCareerPromptReadCache(admin, owner, load)).value, 2);
  await withCareerPromptReadCache(admin, owner, async () => {
    invalidateCareerPromptReadCache();
    assert.equal((await load()).value, 3);
    assert.equal((await readCareerPromptValue("other-owner", "profile", async () => ({ value: 4 }))).value, 4);
  });
  await withCareerPromptReadCache(admin, owner, async () => {
    await assert.rejects(readCareerPromptValue(owner, "failure", async () => { throw new Error("offline"); }));
    assert.equal(await readCareerPromptValue(owner, "failure", async () => "recovered"), "recovered");
  });
});

test("database edits, deletes and owner transfers invalidate source caches across every writer", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table talent_users(user_id uuid primary key, name text, updated_at timestamptz, last_logined_at timestamptz);
      create table talent_contexts(id int primary key,talent_id uuid,content text);
      create table talent_experiences(id int primary key,talent_id uuid,content text);
      create table talent_educations(id int primary key,talent_id uuid,content text);
      create table talent_extras(id int primary key,talent_id uuid,content text);`);
    await db.exec(`create role anon; create role authenticated; create role service_role;
      alter default privileges grant execute on functions to anon, authenticated, service_role;`);
    await db.exec(await readFile("supabase/migrations/20261111081308_career_prompt_cache_revision.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261111090402_career_prompt_cache_trigger_permissions.sql", "utf8"));
    assert.equal((await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','revise_career_context_cache()','EXECUTE') as allowed")).rows[0].allowed, false);
    const a = crypto.randomUUID(), b = crypto.randomUUID();
    await db.query("insert into talent_users(user_id,name) values ($1,'A'),($2,'B')", [a,b]);
    const version = async (id = a) => (await db.query<{ career_context_revision: string }>("select career_context_revision from talent_users where user_id=$1", [id])).rows[0].career_context_revision;
    let previous = await version();
    await db.query("update talent_users set last_logined_at=now(),updated_at=now() where user_id=$1", [a]);
    assert.equal(await version(), previous, "login bookkeeping cannot discard the source cache");
    await db.query("update talent_users set name='New name' where user_id=$1", [a]);
    assert.notEqual(await version(), previous);
    for (const table of ["talent_contexts", "talent_experiences", "talent_educations", "talent_extras"]) {
      previous = await version();
      await db.query(`insert into ${table} values (1,$1,'first')`, [a]);
      assert.notEqual(await version(), previous);
      previous = await version();
      await db.exec(`update ${table} set content='edited' where id=1`);
      assert.notEqual(await version(), previous);
      previous = await version(); const other = await version(b);
      await db.query(`update ${table} set talent_id=$1 where id=1`, [b]);
      assert.notEqual(await version(), previous); assert.notEqual(await version(b), other);
      const beforeDelete = await version(b);
      await db.exec(`delete from ${table} where id=1`);
      assert.notEqual(await version(b), beforeDelete);
    }
    previous = await version();
    await db.exec("create role context_writer; grant insert on talent_contexts to context_writer; set role context_writer");
    await db.query("insert into talent_contexts values (2,$1,'updated by a scoped writer')", [a]);
    await db.exec("reset role");
    assert.notEqual(await version(), previous, "source writers invalidate the cache without needing broad profile permissions");
  } finally { await db.close(); }
});
