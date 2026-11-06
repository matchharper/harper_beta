import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { setupDaily } from "./dailyTestSupport";
import { localAdmin, owner, other, write } from "./testSupport";
import { collectCareerProcessing, planCareerProcessing } from "./daily";

const migration = "supabase/migrations/20261106082331_career_pre_onboarding_discovery.sql";
async function fixture(before?: (db: Awaited<ReturnType<typeof setupDaily>>) => Promise<void>) {
  const db = await setupDaily();
  await db.exec(`create table contact_queue(id uuid primary key default gen_random_uuid(),user_id uuid,type text,
    last_error text,status text default 'queued',scheduled_at timestamptz default now(),locked_by text,resend_email_id text,
    payload jsonb default '{}',cancelled_at timestamptz,updated_at timestamptz default now());`);
  if (before) await before(db);
  await db.exec(await readFile(migration, "utf8"));
  return db;
}
const ensure = async (db: Awaited<ReturnType<typeof fixture>>, id = owner) => (await db.query<any>("select ensure_career_check_in($1) s", [id])).rows[0].s;
const seed = async (db: Awaited<ReturnType<typeof fixture>>, dry = true) => (await db.query<any>("select seed_incomplete_career_schedules($1) s", [dry])).rows[0].s;

test("new incomplete signup gets one 1–3 hour review; profile changes and completion preserve it", async () => {
  const db = await fixture();
  try {
    await db.query<any>("update talent_setting set is_onboarding_done=false where user_id=$1", [owner]);
    const first = await ensure(db);
    const hours = (Date.parse(first.next_run_at) - Date.now()) / 3600000;
    assert.ok(hours > .99 && hours <= 3);
    assert.equal(first.interval_days, 3);
    assert.equal(first.status, "active");
    const beforeFirst = planCareerProcessing({talentId:owner,
      schedules:[{...first,next_run_at:"2030-01-01T03:00:00Z"}],
      sources:[{id:"event",available_at:"2030-01-01T00:00:00Z",event:{sourceKind:"company_followup"}}]},new Date("2030-01-01T00:00:00Z"));
    assert.equal(beforeFirst,null,"an earlier daily batch must wait for the fixed first review");
    assert.match(first.instruction, /available profile/);
    await db.query<any>("update talent_setting set is_onboarding_done=true where user_id=$1", [owner]);
    assert.deepEqual(await ensure(db), first);
    await db.query<any>("insert into contact_queue(user_id,type) values($1,'career_signup_no_profile_submit'),($1,'career_profile_submitted_no_answer')", [owner]);
    assert.equal((await db.query<any>("select count(*)::int n from contact_queue")).rows[0].n, 0);
    assert.deepEqual(await ensure(db), first);
  } finally { await db.close(); }
});

test("completed-user existing custom reservation is byte-for-byte unchanged", async () => {
  let before: any;
  const db = await fixture(async db => {
    await db.query<any>("update talent_setting set is_onboarding_done=true where user_id=$1", [owner]);
    const initial = await ensure(db);
    await write(db, { action: "pause", schedule_id: initial.id, expected_revision: initial.revision, interval_days: 9.5, instruction: "Only my saved applications" }, "pause");
    before = await ensure(db);
  });
  try {
    await seed(db, false);
    assert.deepEqual(await ensure(db), before);
    await db.query<any>("update talent_setting set is_onboarding_done=true where user_id=$1", [owner]);
    assert.deepEqual(await ensure(db), before);
  } finally { await db.close(); }
});

test("completed-user missing reservation retains old instruction, interval and first due time", async () => {
  const db = await fixture();
  try {
    await db.query<any>("update talent_setting set is_onboarding_done=true,periodic_interval_days=4,status='passive' where user_id=$1", [owner]);
    const s = await ensure(db);
    assert.equal(s.interval_days, 8);
    assert.ok(Math.abs(Date.parse(s.next_run_at) - Date.now() - 8*86400000) < 5000);
    assert.equal(s.instruction, 'Review suitable external opportunities using the current Brief, saved evaluations and contact history. Respect external recommendation settings; no generic Career check-in is requested.');
  } finally { await db.close(); }
});

test("legacy pending reminders transfer their future time atomically and only once", async () => {
  const due = new Date(Date.now()+7200000).toISOString();
  const db = await fixture(async db => {
    await db.query<any>("insert into contact_queue(user_id,type,scheduled_at) values($1,'career_signup_no_profile_submit',$2),($1,'career_profile_submitted_no_answer',$2)", [owner,due]);
  });
  try {
    await seed(db);
    assert.equal((await db.query<any>("select count(*)::int n from talent_agent_schedules")).rows[0].n, 0);
    await seed(db,false);
    const s = await ensure(db);
    assert.equal(Date.parse(s.next_run_at), Date.parse(due));
    const rows = (await db.query<any>("select * from contact_queue")).rows;
    assert.ok(rows.every(q=>q.status==='cancelled' && q.payload.careerScheduleId===s.id));
    await seed(db,false);
    assert.deepEqual(await ensure(db),s);
  } finally { await db.close(); }
});

test("frozen or claimed old sends defer transfer instead of sending twice", async () => {
  const db = await fixture(async db => {
    await db.query<any>(`insert into contact_queue(user_id,type,status,payload) values($1,'career_signup_no_profile_submit','failed','{"runtimeDelivery":{"to":"fixture@example.test"}}')`, [owner]);
  });
  try {
    assert.equal(await ensure(db),null);
    assert.equal((await seed(db,false)).deferred,1);
    assert.equal((await db.query<any>("select status from contact_queue")).rows[0].status,'failed');
    await db.exec("update contact_queue set status='sent'");
    assert.ok(await ensure(db));
  } finally { await db.close(); }
});

test("old accounts advance to a future review, stopped/opted-out stay paused, deleted stay excluded", async () => {
  const db = await fixture(async db => {
    await db.exec("update talent_setting set created_at=now()-interval '60 days'");
  });
  try {
    await seed(db,false);
    const s = await ensure(db);
    assert.ok(Date.parse(s.next_run_at)>Date.now());
    assert.ok(Date.parse(s.next_run_at)<Date.now()+3*86400000);
    assert.equal((await ensure(db,other)).status,'paused');
    await db.query<any>("update talent_setting set get_external_recommendation=false where user_id=$1",[owner]);
    assert.equal((await ensure(db)).status,'paused');
    await db.query<any>("update talent_users set deleted_at=now() where user_id=$1",[owner]);
    assert.deepEqual((await collectCareerProcessing({admin:localAdmin(db),now:new Date(Date.now()+10*86400000)})).runIds,[]);
  } finally { await db.close(); }
});

test("incomplete schedule enters existing Career collector once, with current purpose and no delivery", async () => {
  const db = await fixture();
  try {
    await ensure(db);
    const now = new Date(Date.now()+4*3600000);
    const a = await collectCareerProcessing({admin:localAdmin(db),now});
    assert.equal(a.runIds.length,1);
    const run = (await db.query<any>("select * from opportunity_discovery_run where id=$1",[a.runIds[0]])).rows[0];
    assert.equal(run.trigger_payload.runContract,'career_agent_v1');
    assert.equal(run.trigger_payload.contactScope,'external_recommendations');
    assert.match(run.trigger_payload.sourceEvents[0].instruction,/career interview may be incomplete/);
    assert.equal((await db.query<any>("select count(*)::int n from talent_opportunity_delivery")).rows[0].n,0);
    assert.equal((await collectCareerProcessing({admin:localAdmin(db),now})).runIds.length,0);
  } finally { await db.close(); }
});
