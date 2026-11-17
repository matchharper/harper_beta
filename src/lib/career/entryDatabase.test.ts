import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const conversation = "10000000-0000-4000-8000-000000000003";
async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table talent_conversations(id uuid primary key,user_id uuid not null,stage text not null default 'profile',
      updated_at timestamptz default now(),profile_ingestion_status text,profile_ingestion_error text,profile_ingestion_updated_at timestamptz);
    create table talent_messages(id bigint generated always as identity primary key,conversation_id uuid,user_id uuid not null,
      role text not null,content text not null,message_type text not null,is_mobile boolean);
    create table talent_setting(user_id uuid primary key,is_onboarding_done boolean,updated_at timestamptz default now());
    create table official_jobs(slug text primary key,company_name text,role_title text,is_published boolean);
    create table talent_activity_events(id uuid primary key default gen_random_uuid(),talent_id uuid not null,conversation_id uuid,
      event_type text not null,changed_domains text[] not null,impact_level text not null,source text not null,summary text not null);
    create table opportunity_discovery_run(id uuid primary key default gen_random_uuid(),talent_id uuid,conversation_id uuid,
      trigger text,run_mode text,status text,dedupe_key text unique,target_recommendation_count integer,trigger_payload jsonb,created_at timestamptz default now());
    insert into talent_conversations(id,user_id) values('${conversation}','${owner}');
    insert into official_jobs values('cedar-backend','CedarWorks','Backend Engineer',true),('private','Unpublished Company','Secret Role',false);
  `);
  for (const file of [
    "20261108120000_career_onboarding_direct_continuation.sql",
    "20261115074531_career_entry_continuation.sql",
  ])
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  return db;
}
async function enter(
  db: PGlite,
  slug: string | null = "cedar-backend",
  user = owner
) {
  const { rows } = await db.query<{
    result: { run: { id: string }; inserted: boolean };
  }>("select finalize_career_entry($1,$2,$3,$4,false) as result", [
    user,
    conversation,
    "Start without materials.",
    slug,
  ]);
  return rows[0].result;
}

test("empty entry atomically records exact source and one original-agent invocation; retry preserves both", async () => {
  const db = await setup();
  try {
    const first = await enter(db);
    const second = await enter(db, "private");
    assert.equal(first.run.id, second.run.id);
    assert.equal(second.inserted, false);
    assert.equal(
      (await db.query("select * from talent_messages")).rows.length,
      1
    );
    assert.equal(
      (await db.query("select * from talent_activity_events")).rows.length,
      1
    );
    const events = await db.query<{ source: string }>(
      "select source from talent_activity_events"
    );
    assert.equal(
      events.rows[0].source,
      "official_jobs_onboarding:cedar-backend"
    );
    const state = await db.query<{
      stage: string;
      profile_ingestion_status: string;
    }>("select stage,profile_ingestion_status from talent_conversations");
    assert.deepEqual(state.rows[0], {
      stage: "completed",
      profile_ingestion_status: "completed",
    });
    const runs = await db.query<{
      trigger: string;
      trigger_payload: { agentInvocation?: { sourceMessageCursor: number } };
    }>("select trigger,trigger_payload from opportunity_discovery_run");
    assert.equal(runs.rows.length, 2); // Original agent plus existing independent internal evaluation.
    assert.equal(
      runs.rows.find((r) => r.trigger === "conversation_completed")!
        .trigger_payload.agentInvocation!.sourceMessageCursor,
      1
    );
  } finally {
    await db.close();
  }
});

test("other user's conversation and direct authenticated invocation cannot enter or enqueue", async () => {
  const db = await setup();
  try {
    await assert.rejects(enter(db, null, other), /Conversation unavailable/);
    await db.exec("set role authenticated");
    await assert.rejects(
      enter(db),
      /permission denied for function finalize_career_entry/
    );
    await db.exec("reset role");
    assert.equal(
      (await db.query("select * from talent_messages")).rows.length,
      0
    );
    assert.equal(
      (await db.query("select * from opportunity_discovery_run")).rows.length,
      0
    );
  } finally {
    await db.close();
  }
});

test("unpublished or missing source cannot expose an internal posting", async () => {
  const db = await setup();
  try {
    await enter(db, "private");
    assert.equal(
      (await db.query("select * from talent_activity_events")).rows.length,
      0
    );
  } finally {
    await db.close();
  }
});

test("failed admission rolls back the receipt, source, stage and completion setting", async () => {
  const db = await setup();
  try {
    await db.exec(
      "alter table opportunity_discovery_run add constraint fail_admission check (status <> 'handed_off')"
    );
    await assert.rejects(enter(db), /fail_admission/);
    assert.equal(
      (await db.query("select * from talent_messages")).rows.length,
      0
    );
    assert.equal(
      (await db.query("select * from talent_activity_events")).rows.length,
      0
    );
    assert.equal(
      (await db.query("select * from talent_setting")).rows.length,
      0
    );
    assert.equal(
      (
        await db.query<{ stage: string }>(
          "select stage from talent_conversations"
        )
      ).rows[0].stage,
      "profile"
    );
  } finally {
    await db.close();
  }
});
