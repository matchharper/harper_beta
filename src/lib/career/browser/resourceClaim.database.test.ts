import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = id(1),
  conversation = id(2),
  session = id(3),
  run = id(4);
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table talent_users(user_id uuid primary key);
    create table talent_conversations(id uuid primary key,user_id uuid);
    insert into talent_users values('${user}');
    insert into talent_conversations values('${conversation}','${user}');`);
  // Use the deployed resource table (including ownership, defaults and RLS).
  const base = await readFile(
    "supabase/migrations/20261029163255_career_general_agent_runtime.sql",
    "utf8"
  );
  await db.exec(
    base.slice(
      0,
      base.indexOf("create function public.create_talent_external_operation")
    )
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261112075052_career_browser_resource_claim.sql",
      "utf8"
    )
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261112075621_career_browser_released_session.sql",
      "utf8"
    )
  );
  await db.query(
    `insert into talent_external_operations(id,user_id,conversation_id,kind,idempotency_key,status,provider_refs)
    values($1,$2,$3,'browser_session','session','idle',$4)`,
    [
      session,
      user,
      conversation,
      { current_execution_id: run, session_id: id(6), workspace_id: id(7) },
    ]
  );
  await db.query(
    `insert into talent_external_operations(id,user_id,conversation_id,kind,parent_id,idempotency_key)
    values($1,$2,$3,'browser_run',$4,'run')`,
    [run, user, conversation, session]
  );
  return db;
}
async function claim(
  db: PGlite,
  action: string,
  revision = 1,
  owner = user,
  reply: string | null = null
) {
  return (
    await db.query<{ result: any }>(
      "select claim_career_browser_resource($1,$2,$3,$4,$5,$6,$7) result",
      [owner, conversation, session, action, run, revision, reply]
    )
  ).rows[0].result;
}

test("browser release excludes dispatch until completion and retains the same reservation", async () => {
  const db = await fixture();
  try {
    const released = await claim(db, "release");
    assert.equal(released.claimed, true);
    assert.equal(released.session.status, "releasing");
    assert.equal(released.operation.status, "reserved");
    await assert.rejects(claim(db, "prepare"), /changed/);
    // A failed provider stop remains retryable without granting dispatch.
    assert.equal((await claim(db, "release")).session.status, "releasing");
    await db.query(
      "update talent_external_operations set status='idle',result=$1 where id=$2",
      [{ browser_availability: "stopped" }, session]
    );
    assert.equal((await claim(db, "release")).claimed, false);
    const prepared = await claim(db, "prepare");
    assert.equal(prepared.operation.id, run);
    assert.equal(prepared.operation.status, "preparing");
    assert.equal(prepared.session.status, "running");
    assert.equal(prepared.session.result.browser_availability, undefined);
    assert.equal(prepared.session.provider_refs.session_id, undefined);
    assert.equal(prepared.session.provider_refs.workspace_id, id(7));
    assert.equal((await claim(db, "release")).claimed, false);
    await assert.rejects(claim(db, "prepare"), /changed/);
  } finally {
    await db.close();
  }
});

test("release respects active/unknown dispatch, human control, returned control and ownership", async () => {
  const db = await fixture();
  try {
    for (const status of [
      "preparing",
      "dispatching",
      "uncertain",
      "running",
      "cancelling",
    ]) {
      await db.query(
        "update talent_external_operations set status=$1 where id=$2",
        [status, run]
      );
      assert.equal((await claim(db, "release")).claimed, false, status);
    }
    await db.query(
      "update talent_external_operations set status='reserved' where id=$1",
      [run]
    );
    await db.query(
      "update talent_external_operations set status='human' where id=$1",
      [session]
    );
    assert.equal((await claim(db, "release")).claimed, false);
    await assert.rejects(claim(db, "prepare"), /changed/);
    await db.query(
      "update talent_external_operations set status='idle',provider_refs=provider_refs||$1 where id=$2",
      [{ control_return: { invocation_id: id(5) } }, session]
    );
    await db.query(
      "insert into talent_external_operations(id,user_id,conversation_id,kind,idempotency_key) values($1,$2,$3,'career_invocation','return')",
      [id(5), user, conversation]
    );
    assert.equal((await claim(db, "release")).claimed, false);
    await assert.rejects(claim(db, "release", 1, id(99)), /unavailable/);
    assert.equal(
      (await claim(db, "release", 1, user, `invocation:${id(5)}`)).claimed,
      true
    );
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('authenticated','claim_career_browser_resource(uuid,uuid,uuid,text,uuid,bigint,text)','execute') allowed"
        )
      ).rows[0].allowed,
      false
    );
  } finally {
    await db.close();
  }
});

test("only a confirmed capacity rejection can release or resume a capacity-wait receipt", async () => {
  const db = await fixture();
  try {
    await db.query(
      "update talent_external_operations set status='capacity_wait' where id=$1",
      [run]
    );
    assert.equal((await claim(db, "release")).claimed, false);
    await assert.rejects(claim(db, "prepare"), /cannot be dispatched/);
    await db.query(
      "update talent_external_operations set result=$1,provider_refs=$2 where id=$3",
      [
        { dispatch_rejected_http: 429 },
        { retry_after: "2099-01-01T00:00:00Z" },
        run,
      ]
    );
    await assert.rejects(claim(db, "prepare"), /cannot be dispatched/);
    assert.equal((await claim(db, "release")).claimed, true);
    await db.query(
      "update talent_external_operations set status='idle' where id=$1",
      [session]
    );
    await db.query(
      "update talent_external_operations set provider_refs=$1 where id=$2",
      [{ retry_after: "2020-01-01T00:00:00Z" }, run]
    );
    assert.equal((await claim(db, "prepare")).operation.id, run);
  } finally {
    await db.close();
  }
});
