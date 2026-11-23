import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

function migration(name: string) {
  return readFileSync(
    new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url),
    "utf8"
  );
}

test("Gmail read consent admits one recoverable Career turn per active connection", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table talent_users(user_id uuid primary key, deleted_at timestamptz);
    create table talent_integrations(talent_id uuid, provider text, status text, composio_connected_account_id text,
      updated_at timestamptz default now(), primary key(talent_id,provider));
    create table talent_conversations(id uuid primary key default gen_random_uuid(), user_id uuid, stage text, updated_at timestamptz default now());
    create table talent_messages(id bigint, user_id uuid, conversation_id uuid, role text);
    create table opportunity_discovery_run(id uuid primary key,talent_id uuid,conversation_id uuid,trigger text,
      run_mode text,status text,dedupe_key text unique,target_recommendation_count int,trigger_payload jsonb);
  `);
  // Use the actual account-generation trigger that the new admission consumes.
  await db.exec(
    migration("20261113155626_career_mail_events").split(
      "create function public.career_mail_waiters_v1"
    )[0]
  );
  await db.exec(
    migration("20261116072943_career_gmail_connection_continuation")
  );
  const user = crypto.randomUUID(),
    other = crypto.randomUUID();
  await db.query("insert into talent_users(user_id) values($1),($2)", [
    user,
    other,
  ]);
  const foreign = await db.query<{ id: string }>(
    "insert into talent_conversations(user_id) values($1) returning id",
    [other]
  );
  type Receipt = {
    conversationId: string | null;
    run?: {
      status: string;
      trigger_payload: {
        gmailConnectionGeneration: string;
        agentInvocation: { sourceMessageCursor: number };
      };
    };
  };
  const confirm = async (
    account: string,
    conversation: string | null,
    read: boolean,
    previous: string
  ) =>
    (
      await db.query<{ receipt: Receipt }>(
        "select confirm_career_gmail_connection_v1($1,$2,$3,$4,$5) receipt",
        [user, account, conversation, read, previous]
      )
    ).rows[0].receipt;

  await assert.rejects(
    confirm("ca_first", foreign.rows[0].id, true, "absent"),
    /Conversation unavailable/
  );
  assert.equal(
    (await confirm("ca_first", null, false, "absent")).run,
    undefined
  );
  const first = await confirm("ca_first", null, true, "absent");
  assert.ok(first.conversationId);
  assert.equal(first.run?.status, "handed_off");
  assert.equal(
    first.run.trigger_payload.agentInvocation.sourceMessageCursor,
    0
  );
  assert.equal(
    (await confirm("ca_first", null, true, "absent")).run,
    undefined
  );

  const generation = first.run.trigger_payload.gmailConnectionGeneration;
  await db.query(
    "update talent_integrations set status='disabled' where talent_id=$1",
    [user]
  );
  await assert.rejects(
    confirm("ca_first", first.conversationId, true, generation + "/active"),
    /changed during authorization/
  );
  const next = await confirm(
    "ca_second",
    first.conversationId,
    true,
    generation + "/disabled"
  );
  assert.equal(next.conversationId, first.conversationId);
  assert.notEqual(
    next.run?.trigger_payload.gmailConnectionGeneration,
    generation
  );
});

test("the inbox review after a connection waits for the person's other Career work, and a waiting application hears at once", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table talent_users(user_id uuid primary key, deleted_at timestamptz);
    create table talent_integrations(talent_id uuid, provider text, status text, composio_connected_account_id text,
      updated_at timestamptz default now(), primary key(talent_id,provider));
    create table talent_conversations(id uuid primary key default gen_random_uuid(), user_id uuid, stage text, updated_at timestamptz default now());
    create table talent_messages(id bigint, user_id uuid, conversation_id uuid, role text, payload jsonb default '{}');
    create table opportunity_discovery_run(id uuid primary key,talent_id uuid,conversation_id uuid,trigger text,
      run_mode text,status text,dedupe_key text unique,target_recommendation_count int,trigger_payload jsonb);
    create table talent_external_operations(id uuid primary key default gen_random_uuid(), user_id uuid, conversation_id uuid,
      parent_id uuid, kind text, idempotency_key text, status text, request jsonb default '{}', result jsonb default '{}',
      provider_refs jsonb default '{}', revision bigint default 0, created_at timestamptz default now(),
      updated_at timestamptz default now(), unique(user_id,kind,idempotency_key));
  `);
  // The real environment stamp: each row carries the environment of the server that wrote it.
  await db.exec(migration("20261108141000_career_execution_environment").split("create or replace function public.queue_career_invocation")[0]);
  const environment = (name: string) => db.query("select set_config('request.headers',$1,false)", [name ? JSON.stringify({ "x-harper-career-runtime": name }) : ""]);
  await db.exec(migration("20261113155626_career_mail_events").split("create function public.career_mail_waiters_v1")[0]);
  await db.exec(migration("20261116072943_career_gmail_connection_continuation"));
  await db.exec(migration("20261123070000_career_gmail_review_waits_its_turn"));
  const user = crypto.randomUUID();
  await db.query("insert into talent_users(user_id) values($1)", [user]);
  type Review = { id: string; status: string; conversation_id: string; request: { generation: string } };
  type Run = { id: string; status: string; trigger: string; dedupe_key: string;
    trigger_payload: { gmailConnectionGeneration: string; agentInvocation: { replyId: string; sourceMessageCursor: number } } };
  const confirm = async (account: string, previous: string) => (await db.query<{ receipt: { conversationId: string; review?: Review; run?: Run } }>(
    "select confirm_career_gmail_connection_v1($1,$2,null,true,$3) receipt", [user, account, previous])).rows[0].receipt;
  const start = async (review: string) => (await db.query<{ run: Run | null }>("select career_start_gmail_review_v1($1) run", [review])).rows[0].run;
  const status = async (review: string) => (await db.query<{ status: string }>("select status from talent_external_operations where id=$1", [review])).rows[0].status;
  const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);

  // The connection only records the review; nothing runs yet, and a repeat does not record a second one.
  const first = await confirm("ca_first", "absent");
  assert.equal(first.run, undefined);
  assert.equal(first.review?.status, "ready");
  assert.equal(await count("select count(*) n from opportunity_discovery_run"), 0);
  assert.equal((await confirm("ca_first", "absent")).conversationId, first.conversationId);
  assert.equal(await count("select count(*) n from talent_external_operations where kind='gmail_review'"), 1);

  // Another Career job of the person's goes first; the review stays ready and holds nothing.
  await db.query(`insert into opportunity_discovery_run(id,talent_id,conversation_id,trigger,run_mode,status,dedupe_key,target_recommendation_count,trigger_payload)
    values(gen_random_uuid(),$1,$2,'career_schedule','scheduled','running','schedule:1',0,'{"runContract":"career_agent_v1"}')`, [user, first.conversationId]);
  assert.equal(await start(first.review!.id), null);
  assert.equal(await status(first.review!.id), "ready");

  // Once that job is done the review starts, past the messages already answered while it waited.
  await db.query("update opportunity_discovery_run set status='completed' where dedupe_key='schedule:1'");
  await db.query("insert into talent_messages(id,user_id,conversation_id,role) values(7,$1,$2,'user'),(8,$1,$2,'assistant')", [user, first.conversationId]);
  const run = await start(first.review!.id);
  assert.equal(run?.status, "handed_off");
  assert.equal(run?.trigger, "gmail_connected");
  assert.equal(run?.dedupe_key, "gmail-connected:" + first.review!.request.generation);
  assert.equal(run?.trigger_payload.gmailConnectionGeneration, first.review!.request.generation);
  assert.equal(run?.trigger_payload.agentInvocation.sourceMessageCursor, 7);
  assert.equal(run?.trigger_payload.agentInvocation.replyId, "background:" + run?.id);
  assert.equal(await status(first.review!.id), "completed");
  assert.equal(await start(first.review!.id), null);
  assert.equal((await confirm("ca_first", "absent")).conversationId, first.conversationId);

  // A review recorded by a local server is left for that server.
  await db.query("update talent_integrations set status='disabled' where talent_id=$1", [user]);
  await environment("development:x");
  const second = await confirm("ca_second", first.review!.request.generation + "/disabled");
  await environment("");
  assert.notEqual(second.review?.request.generation, first.review!.request.generation);
  assert.equal((second.review?.request as { execution_environment?: string }).execution_environment, "development:x");
  assert.equal(await start(second.review!.id), null);
  assert.equal(await status(second.review!.id), "ready");

  // A Gmail disconnected while the review waits cancels it instead of reading a mailbox that is gone.
  await environment("development:x");
  await db.query("update talent_integrations set status='disabled' where talent_id=$1", [user]);
  assert.equal(await start(second.review!.id), null);
  await environment("");
  assert.equal(await status(second.review!.id), "cancelled");

  // An application waiting at a code screen hears about the connection in its own chat turn.
  const conversation = first.conversationId;
  const browserRun = (await db.query<{ id: string }>(`insert into talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request)
    values($1,$2,'browser_run','run:1','completed','{"source_message_id":7}') returning id`, [user, conversation])).rows[0].id;
  const target = (await db.query<{ id: string }>("select queue_career_event($1,$2,7,'gmail_connected',$3,0) id", [user, conversation, browserRun])).rows[0].id;
  const delivered = (await db.query<{ request: { event_ids: string[]; input_message_ids: unknown[] } }>(
    "select request from talent_external_operations where id=$1 and kind='career_invocation'", [target])).rows[0].request;
  const event = (await db.query<{ id: string; request: { kind: string; reference: string } }>(
    "select id,request from talent_external_operations where kind='career_event'")).rows[0];
  assert.deepEqual(delivered.event_ids, [event.id]);
  assert.equal(event.request.kind, "gmail_connected");
  assert.equal(event.request.reference, browserRun);
  await assert.rejects(db.query("select queue_career_event($1,$2,7,'gmail_connected',$3,0)", [user, conversation, first.review!.id]),
    /Invalid execution event reference/);
});
