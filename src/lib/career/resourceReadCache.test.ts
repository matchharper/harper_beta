import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { withCareerPromptReadCache, readCareerPromptValue, readCareerResourceValue, invalidateCareerPromptReadCache } from "./promptReadCache.server";

test("resource reuse tracks its own revision, conversation, failures and tool writes", async () => {
  const userId = crypto.randomUUID();
  let revision: string | null = null, unavailable = false, sourceReads = 0, profileReads = 0;
  const admin: any = { from(table: string) {
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => table === "talent_users"
      ? { data: { career_context_revision: "profile" }, error: null }
      : { data: revision ? { revision } : null, error: unavailable ? new Error("unavailable") : null } };
    return q;
  } };
  const resource = (key = "forms:conversation-a") => readCareerResourceValue(userId, key, async () => ++sourceReads);
  const turn = () => withCareerPromptReadCache(admin, userId, async () => ({
    resource: await resource(), profile: await readCareerPromptValue(userId, "profile", async () => ++profileReads),
  }));
  assert.deepEqual(await turn(), { resource: 1, profile: 1 });
  assert.deepEqual(await turn(), { resource: 1, profile: 1 });
  revision = "resource-change";
  assert.deepEqual(await turn(), { resource: 2, profile: 1 });
  await withCareerPromptReadCache(admin, userId, async () => {
    assert.equal(await resource("forms:conversation-b"), 3);
    invalidateCareerPromptReadCache();
    assert.equal(await resource(), 4);
  });
  unavailable = true;
  await withCareerPromptReadCache(admin, userId, async () => {
    assert.deepEqual(await Promise.all([resource(), resource()]), [5, 5]);
  });
  assert.equal((await turn()).resource, 6, "failed freshness checks cannot reuse another request's data");
});

test("resource revision covers all index dependencies and ignores ordinary chat/invocation writes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table talent_users(user_id uuid primary key);
      create table talent_documents(id int primary key,talent_id uuid references talent_users on delete cascade, content text);
      create table talent_profiles(id int primary key,talent_id uuid references talent_users on delete cascade, content text);
      create table talent_matchings(id int primary key,talent_id uuid references talent_users on delete cascade, content text);
      create table external_recommendation_runs(id int primary key,talent_id uuid references talent_users on delete cascade, content text,variant text);
      create table talent_messages(id int primary key,user_id uuid references talent_users on delete cascade, content text,message_type text);
      create table talent_external_operations(id int primary key,user_id uuid references talent_users on delete cascade, content text,kind text);
      alter default privileges grant execute on functions to anon,authenticated,service_role;`);
    await db.exec(await readFile("supabase/migrations/20261111090843_career_resource_read_cache.sql", "utf8"));
    const a = crypto.randomUUID(), b = crypto.randomUUID();
    await db.query("insert into talent_users values ($1),($2)", [a,b]);
    const version = async (id = a) => (await db.query<{ revision: string }>("select revision from talent_career_resource_revisions where user_id=$1", [id])).rows[0]?.revision;
    for (const [table, owner, extra, value] of [
      ["talent_documents","talent_id","", ""], ["talent_profiles","talent_id","", ""], ["talent_matchings","talent_id","", ""],
      ["external_recommendation_runs","talent_id",",variant", ",'career_agent'"],
      ["talent_messages","user_id",",message_type", ",'career_form'"],
      ["talent_external_operations","user_id",",kind", ",'delegated_work'"],
    ]) {
      let old = await version();
      await db.query(`insert into ${table}(id,${owner},content${extra}) values (1,$1,'created'${value})`, [a]);
      assert.notEqual(await version(), old, `${table}: insert`);
      old = await version();
      await db.exec(`update ${table} set content='updated' where id=1`);
      assert.notEqual(await version(), old, `${table}: update`);
      old = await version(); const oldB = await version(b);
      await db.query(`update ${table} set ${owner}=$1 where id=1`, [b]);
      assert.notEqual(await version(), old, `${table}: former owner`);
      assert.notEqual(await version(b), oldB, `${table}: new owner`);
      old = await version(b);
      await db.exec(`delete from ${table} where id=1`);
      assert.notEqual(await version(b), old, `${table}: delete`);
    }
    const old = await version();
    await db.query("insert into talent_messages values(2,$1,'hello','chat');", [a]);
    await db.query("insert into talent_external_operations values(2,$1,'running','career_invocation');", [a]);
    await db.query("insert into external_recommendation_runs values(2,$1,'queued','other');", [a]);
    assert.equal(await version(), old);
    for (const type of ["career_form_response", "career_form_resolution"]) {
      const before = await version();
      await db.query("update talent_messages set message_type=$1 where id=2", [type]);
      assert.notEqual(await version(), before, `form ${type}`);
    }
    const permissions = (await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','revise_career_resource_cache()','EXECUTE') as allowed")).rows[0];
    assert.equal(permissions.allowed, false);
    await db.exec("create role resource_writer; grant insert on talent_documents to resource_writer; set role resource_writer;");
    await db.query("insert into talent_documents values(3,$1,'scoped writer')", [a]);
    await db.exec("reset role;");
    await db.query("delete from talent_users where user_id=$1", [a]);
    assert.equal(await version(), undefined, "account cascade cannot recreate revision rows");
  } finally { await db.close(); }
});
