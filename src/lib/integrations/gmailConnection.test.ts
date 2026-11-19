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
