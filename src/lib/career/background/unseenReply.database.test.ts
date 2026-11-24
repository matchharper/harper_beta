import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { admitUnseenCareerReplies, readUnseenReply } from "./unseenReply";
import { renderCareerBackgroundInvocation } from "./prompt";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [user, other, tester] = [id(1), id(2), id(3)];
const [conversation, otherConversation, testerConversation] = [id(11), id(12), id(13)];

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table talent_users(user_id uuid primary key, deleted_at timestamptz);
    create table talent_test_accounts(user_id uuid primary key);
    create function is_talent_test_account(p_user_id uuid) returns boolean language sql as
      $$ select exists(select 1 from public.talent_test_accounts where user_id=p_user_id) $$;
    create table talent_conversations(id uuid primary key, user_id uuid, updated_at timestamptz default now());
    create table talent_messages(id bigint primary key, user_id uuid, conversation_id uuid, role text, message_type text,
      payload jsonb, created_at timestamptz default now());
    create table opportunity_discovery_run(id uuid primary key, talent_id uuid, conversation_id uuid, trigger text, run_mode text,
      status text, dedupe_key text, target_recommendation_count int, trigger_payload jsonb, completed_at timestamptz, error_message text);
    -- The real function also releases the agent claim; this records the call.
    create function cancel_career_background_run(p_run_id uuid, p_reason text) returns void language sql as
      $$ update public.opportunity_discovery_run set status='cancelled', error_message=p_reason where id=p_run_id and status='handed_off' $$;
  `);
  await db.exec(await readFile("supabase/migrations/20261123150000_career_reply_unseen_email.sql", "utf8"));
  for (const [talent, conv] of [[user, conversation], [other, otherConversation], [tester, testerConversation]]) {
    await db.query("insert into talent_users(user_id) values ($1)", [talent]);
    await db.query("insert into talent_conversations(id, user_id) values ($1, $2)", [conv, talent]);
  }
  await db.query("insert into talent_test_accounts(user_id) values ($1)", [tester]);
  return db;
}

const message = (db: PGlite, row: { id: number; user: string; conv: string; role: "user" | "assistant"; type?: string; minutesAgo: number; reply?: string }) =>
  db.query(`insert into talent_messages(id, user_id, conversation_id, role, message_type, payload, created_at)
    values ($1, $2, $3, $4, $5, $6, now() - make_interval(mins => $7))`,
    [row.id, row.user, row.conv, row.role, row.type ?? "chat", row.reply ? JSON.stringify({ careerTextReplyId: row.reply }) : null, row.minutesAgo]);
const seen = (db: PGlite, talent: string, conv: string, messageId: number) =>
  db.query<{ seen: number | null }>("select mark_career_messages_seen_v1($1, $2, $3) as seen", [talent, conv, messageId]).then(r => r.rows[0].seen);
const rpcClient = (db: PGlite) => ({
  rpc: async (name: string, args: Record<string, unknown>) => {
    const keys = Object.keys(args);
    const result = await db.query(`select * from ${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(", ")})`, keys.map(key => args[key]));
    return { data: result.rows, error: null };
  },
}) as any;

test("an unseen web reply wakes the agent once, and seeing it cancels that wake", async () => {
  const db = await database();
  await message(db, { id: 1, user, conv: conversation, role: "user", minutesAgo: 12 });
  assert.equal(await seen(db, user, conversation, 1), 1, "the browser displayed the candidate's own message");
  await message(db, { id: 2, user, conv: conversation, role: "assistant", minutesAgo: 10, reply: "invocation:a" });

  const published: unknown[] = [];
  const first = await admitUnseenCareerReplies(rpcClient(db), async job => { published.push(job); });
  assert.deepEqual(first, { admitted: 1, deferred: 0 });
  const { rows: [run] } = await db.query<any>("select * from opportunity_discovery_run");
  assert.equal(run.trigger, "career_reply_unseen");
  assert.equal(run.status, "handed_off");
  assert.equal(run.trigger_payload.cadencePolicy.affectsBaseCadence, false);
  assert.deepEqual(readUnseenReply(run), { messageId: 2, sourceMessageId: 1, completedAt: run.trigger_payload.unseenReply.completedAt });
  assert.deepEqual(published, [{ userId: user, conversationId: conversation, backgroundRunId: run.id, replyId: `background:${run.id}` }]);
  assert.match(renderCareerBackgroundInvocation(run), /has not been displayed on a visible Career page since/);

  assert.deepEqual(await admitUnseenCareerReplies(rpcClient(db), async () => {}), { admitted: 0, deferred: 0 }, "one wake per reply");
  const current = () => db.query<{ current: boolean }>("select career_unseen_reply_current_v1($1, $2, 2, 1) as current", [user, conversation])
    .then(r => r.rows[0].current);
  assert.equal(await current(), true);

  assert.equal(await seen(db, user, conversation, 2), 2);
  assert.equal(await current(), false);
  const { rows: [after] } = await db.query<any>("select status, error_message from opportunity_discovery_run");
  assert.deepEqual(after, { status: "cancelled", error_message: "The candidate saw the reply in Career" });
  assert.equal(await seen(db, user, conversation, 1), 2, "the cursor never moves back");
});

test("replies that were seen, are too recent, or never had a receipt do not wake the agent", async () => {
  const db = await database();
  // No receipt at all: history before this release or an old browser bundle.
  await message(db, { id: 1, user, conv: conversation, role: "user", minutesAgo: 20 });
  await message(db, { id: 2, user, conv: conversation, role: "assistant", minutesAgo: 18, reply: "invocation:a" });
  // A test account never gets the email path.
  await message(db, { id: 3, user: tester, conv: testerConversation, role: "user", minutesAgo: 20 });
  await seen(db, tester, testerConversation, 3);
  await message(db, { id: 4, user: tester, conv: testerConversation, role: "assistant", minutesAgo: 18, reply: "invocation:t" });
  // Still inside the grace period.
  await message(db, { id: 5, user: other, conv: otherConversation, role: "user", minutesAgo: 3 });
  await seen(db, other, otherConversation, 5);
  await message(db, { id: 6, user: other, conv: otherConversation, role: "assistant", minutesAgo: 2, reply: "invocation:b" });
  assert.deepEqual(await admitUnseenCareerReplies(rpcClient(db), async () => {}), { admitted: 0, deferred: 0 });
  assert.equal(await seen(db, other, conversation, 1), null, "another candidate's message cannot move this cursor");
});

test("email-origin inputs and conversations the candidate continued are left alone", async () => {
  const db = await database();
  await message(db, { id: 1, user, conv: conversation, role: "user", type: "mail", minutesAgo: 20 });
  await seen(db, user, conversation, 1);
  await message(db, { id: 2, user, conv: conversation, role: "assistant", minutesAgo: 18, reply: "invocation:a" });
  await message(db, { id: 3, user: other, conv: otherConversation, role: "user", minutesAgo: 20 });
  await seen(db, other, otherConversation, 3);
  await message(db, { id: 4, user: other, conv: otherConversation, role: "assistant", minutesAgo: 18, reply: "invocation:b" });
  await message(db, { id: 5, user: other, conv: otherConversation, role: "user", minutesAgo: 1 });
  assert.deepEqual(await admitUnseenCareerReplies(rpcClient(db), async () => {}), { admitted: 0, deferred: 0 });
  const stale = await db.query<{ current: boolean }>("select career_unseen_reply_current_v1($1, $2, 4, 3) as current", [other, otherConversation]);
  assert.equal(stale.rows[0].current, false, "a newer candidate message ends the reason to email");
});
