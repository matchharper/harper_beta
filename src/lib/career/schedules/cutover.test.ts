import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { setup, owner, other, write } from "./testSupport";

const cutoff = "2030-01-10T12:00:00Z";
const third = "33333333-3333-4333-8333-333333333333";
const fourth = "44444444-4444-4444-8444-444444444444";
const iso = (value: string) => new Date(value).toISOString();
const localUrl = process.env.CAREER_SCHEDULE_TEST_POSTGRES_URL;

async function fixture() {
  if (!localUrl) return { db: await setup(), sql: null };
  const url = new URL(localUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Use an isolated local PostgreSQL server");
  const root = postgres(localUrl, { max: 1 });
  const name = `career_cutover_test_${crypto.randomUUID().replaceAll("-", "")}`;
  await root.unsafe(`create database ${name}`);
  url.pathname = `/${name}`;
  const sql = postgres(url.toString(), {
    max: 5,
    onnotice: () => {},
    // PGlite's query contract takes serialized JSON. Avoid serializing it twice
    // when postgres.js discovers a jsonb parameter type in the shared fixture.
    types: { fixtureJson: {
      to: 3802, from: [114, 3802],
      serialize: (value: unknown) => typeof value === "string" ? value : JSON.stringify(value),
      parse: JSON.parse,
    } },
  });
  const session = await sql.reserve();
  const db = {
    exec: (query: string) => session.unsafe(query),
    query: async (query: string, args: unknown[] = []) => ({ rows: await session.unsafe(query, args as never[]) }),
    close: async () => { session.release(); await sql.end(); await root.unsafe(`drop database ${name}`); await root.end(); },
  } as unknown as PGlite;
  try { await setup(db); } catch (error) { await db.close(); throw error; }
  return { db, sql };
}
async function prepare(db: PGlite) {
  await db.exec(`alter table talent_setting disable trigger initialize_career_check_in;
    update talent_setting set is_onboarding_done=true,created_at='2029-12-01T10:00:00Z';
    alter table talent_setting enable trigger initialize_career_check_in;`);
}
async function transition(db: PGlite, dry = false) {
  return (await db.query<any>("select transition_career_agent_schedules($1,$2) result", [dry, cutoff])).rows[0].result;
}
async function schedules(db: PGlite) {
  return (await db.query<any>("select to_jsonb(s) item from talent_agent_schedules s order by talent_id")).rows.map(r => r.item);
}

test("dry-run writes nothing; cutover preserves custom legacy intervals and future due dates, and retries preserve later edits", async () => {
  const { db } = await fixture();
  try {
    await prepare(db);
    await db.query("update talent_setting set periodic_interval_days=4 where user_id=$1", [owner]);
    await db.query("update talent_setting set status='passive' where user_id=$1", [other]);
    await db.query("insert into opportunity_scheduler_state values($1,'2030-01-12T10:00Z'),($2,'2030-01-13T16:00Z')", [owner, other]);
    await db.exec("begin read only");
    const preview = await transition(db, true);
    await db.exec("commit");
    assert.equal(preview.eligible, 2);
    assert.equal(preview.created, 0);
    assert.deepEqual(await schedules(db), []);
    assert.equal((await db.query<any>("select count(*)::int n from talent_external_operations")).rows[0].n, 0);
    assert.deepEqual(preview.targets.map((t: any) => t.after.intervalDays), [4, 6]);
    const applied = await transition(db);
    assert.equal(applied.created, 2);
    assert.deepEqual(applied.targets, preview.targets);
    const [first, second] = await schedules(db);
    assert.equal(first.interval_days, 4);
    assert.equal(second.interval_days, 6);
    assert.equal(iso(first.next_run_at), "2030-01-12T10:00:00.000Z");
    assert.equal(iso(second.next_run_at), "2030-01-13T16:00:00.000Z");
    await write(db, { action: "pause", schedule_id: first.id, expected_revision: first.revision }, "user-pauses");
    const beforeRetry = await schedules(db);
    const retry = await transition(db);
    assert.equal(retry.alreadyMigrated, 2);
    assert.equal(retry.eligible, 0);
    assert.deepEqual(await schedules(db), beforeRetry);
    const grants = (await db.query<any>(`select
      has_function_privilege('anon','transition_career_agent_schedules(boolean,timestamptz)','execute') anon,
      has_function_privilege('authenticated','transition_career_agent_schedules(boolean,timestamptz)','execute') authenticated,
      has_function_privilege('harper_worker','transition_career_agent_schedules(boolean,timestamptz)','execute') worker,
      has_function_privilege('service_role','transition_career_agent_schedules(boolean,timestamptz)','execute') service`)).rows[0];
    assert.deepEqual(grants, { anon: false, authenticated: false, worker: false, service: true });
  } finally { await db.close(); }
});

test("stopped retains internal-only permission; disabled contact stays paused and settings are never rewritten", async () => {
  const { db } = await fixture();
  try {
    await prepare(db);
    await db.query("update talent_setting set status='stopped' where user_id=$1", [owner]);
    await db.query("update talent_setting set get_internal_recommendation=false where user_id=$1", [other]);
    const before = (await db.query<any>("select jsonb_agg(to_jsonb(t) order by user_id) data from talent_setting t")).rows[0].data;
    await transition(db);
    const [internalOnly, disabled] = await schedules(db);
    assert.equal(internalOnly.status, "active");
    assert.equal(internalOnly.interval_days, 3);
    assert.equal(disabled.status, "paused");
    assert.equal(disabled.next_run_at, null);
    assert.deepEqual((await db.query<any>("select jsonb_agg(to_jsonb(t) order by user_id) data from talent_setting t")).rows[0].data, before);
  } finally { await db.close(); }
});

test("overdue periodic checks keep their original phase instead of sharing a new migration-time deadline", async () => {
  const { db } = await fixture();
  try {
    await prepare(db);
    await db.query("update talent_setting set status='passive' where user_id=$1", [other]);
    await db.query("insert into opportunity_scheduler_state values($1,'2030-01-01T08:00Z'),($2,'2030-01-01T17:00Z')", [owner, other]);
    await transition(db);
    const [active, passive] = await schedules(db);
    assert.equal(iso(active.next_run_at), "2030-01-13T08:00:00.000Z");
    assert.equal(iso(passive.next_run_at), "2030-01-13T17:00:00.000Z");
    assert.equal((await db.query<any>("select count(*)::int n from opportunity_discovery_run")).rows[0].n, 0);
    assert.equal((await db.query<any>("select count(*)::int n from talent_opportunity_delivery")).rows[0].n, 0);
  } finally { await db.close(); }
});

test("without a legacy cursor, use actual delivery, then profile submission, then account creation", async () => {
  const { db } = await fixture();
  try {
    await prepare(db);
    await db.query("insert into talent_users(user_id) values($1)", [third]);
    await db.query("insert into talent_setting(user_id,created_at) values($1,'2030-01-09T18:00Z')", [third]);
    await db.exec("alter table talent_setting disable trigger initialize_career_check_in; update talent_setting set is_onboarding_done=true; alter table talent_setting enable trigger initialize_career_check_in");
    await db.query("insert into talent_opportunity_delivery values($1,'sent','2030-01-09T09:00Z'),($1,'failed','2030-01-10T09:00Z'),($1,'sent','2030-01-15T09:00Z')", [owner]);
    await db.query("insert into talent_messages(id,user_id,role,message_type,created_at) values(1,$1,'user','profile_submit','2030-01-09T14:00Z')", [other]);
    const preview = await transition(db, true);
    assert.deepEqual(preview.targets.map((t: any) => t.source.anchorSource), ["last_sent_delivery", "profile_submission", "account_created"]);
    await transition(db);
    assert.deepEqual((await schedules(db)).map(s => iso(s.next_run_at)), [
      "2030-01-12T09:00:00.000Z", "2030-01-12T14:00:00.000Z", "2030-01-12T18:00:00.000Z",
    ]);
  } finally { await db.close(); }
});

test("only untouched bootstrap rows are corrected; edited, executed and newer schedules survive", async () => {
  const { db } = await fixture();
  try {
    await db.query("update talent_setting set status='passive',created_at='2029-12-01',is_onboarding_done=true where user_id=$1", [owner]);
    await db.query("update talent_setting set created_at='2029-12-01',is_onboarding_done=true where user_id=$1", [other]);
    const [automatic, customized] = await schedules(db);
    await write(db, { action: "pause", schedule_id: customized.id, expected_revision: customized.revision, interval_days: 11, instruction: "Only revisit my saved application." }, "custom-pause", other);
    await db.query("insert into opportunity_scheduler_state values($1,'2030-01-14T08:30Z')", [owner]);
    const preserved = (await schedules(db))[1];
    const applied = await transition(db);
    assert.equal(applied.corrected, 1);
    assert.equal(applied.preservedExisting, 1);
    const [corrected, unchanged] = await schedules(db);
    assert.equal(corrected.id, automatic.id);
    assert.equal(corrected.interval_days, 6);
    assert.equal(iso(corrected.next_run_at), "2030-01-14T08:30:00.000Z");
    assert.equal(corrected.revision, automatic.revision + 1);
    assert.deepEqual(unchanged, preserved);

    for (const id of [third, fourth]) {
      await db.query("insert into talent_users(user_id) values($1)", [id]);
      await db.query("insert into talent_setting(user_id,status,is_onboarding_done,created_at) values($1,'passive',true,'2029-12-01')", [id]);
    }
    await db.query("insert into opportunity_discovery_run(id,talent_id,status) values($1,$2,'completed')", [third, third]);
    await db.query("update talent_agent_schedules set last_run_id=$1 where talent_id=$2", [third, third]);
    await db.query("update talent_agent_schedules set created_at='2030-01-11',updated_at='2030-01-11',next_run_at='2030-01-14' where talent_id=$1", [fourth]);
    const protectedRows = await schedules(db);
    assert.equal((await transition(db)).preservedExisting, 3);
    assert.deepEqual(await schedules(db), protectedRows);
  } finally { await db.close(); }
});

test("adopting a legacy review preserves its one-time date, pause, instructions and original change receipt", async () => {
  const { db } = await fixture();
  try {
    await prepare(db);
    await db.query("update talent_setting set is_onboarding_done=false where user_id=$1", [other]);
    const legacy = await write(db, { action: "create", title: "My saved reminder", instruction: "Ask about my interview.", next_run_at: "2029-12-01T10:00Z", timezone: "America/New_York", target_refs: { legacySchedulerReview: true } }, "legacy-create");
    await write(db, { action: "pause", schedule_id: legacy.id, expected_revision: legacy.revision }, "legacy-pause");
    const before = (await schedules(db))[0];
    const result = await transition(db);
    assert.equal(result.adopted, 1);
    const after = (await schedules(db))[0];
    assert.deepEqual(after, { ...before, schedule_key: "career_check_in" });
    assert.equal((await transition(db)).alreadyMigrated, 1);
  } finally { await db.close(); }
});

test("active executions defer cutover; incomplete and deleted accounts are excluded", async () => {
  const { db } = await fixture();
  try {
    await prepare(db);
    await db.query("insert into opportunity_discovery_run(talent_id,status,trigger_payload) values($1,'running','{}'),($2,'handed_off','{\"runContract\":\"career_agent_v1\"}')", [owner, other]);
    const deferred = await transition(db);
    assert.equal(deferred.skippedActiveRuns, 2);
    assert.equal(deferred.skippedActiveLegacy, 1);
    assert.equal(deferred.created, 0);
    await db.exec("update opportunity_discovery_run set status='completed'");
    await db.query("update talent_users set deleted_at=now() where user_id=$1", [other]);
    assert.equal((await transition(db)).created, 1);
    assert.equal((await schedules(db)).length, 1);
  } finally { await db.close(); }
});

test("a concurrent user edit wins while cutover waits for the schedule lock", { skip: !localUrl }, async () => {
  const { db, sql } = await fixture();
  const writer = await sql!.reserve();
  try {
    await db.query("update talent_setting set status='passive',is_onboarding_done=true,created_at='2029-12-01' where user_id=$1", [owner]);
    const initial = (await schedules(db))[0];
    await writer`begin`;
    const [{ pid }] = await writer`select pg_backend_pid() as pid`;
    await writer`select write_career_schedule(${owner}::uuid,null,'concurrent-user-pause',${JSON.stringify({ action: "pause", schedule_id: initial.id, expected_revision: initial.revision })}::jsonb)`;
    const pending = transition(db);
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const [{ waiting }] = await sql!`select exists(select 1 from pg_stat_activity where datname=current_database() and ${pid}::int=any(pg_blocking_pids(pid))) as waiting`;
      if (waiting) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await writer`commit`;
    const result = await pending;
    assert.equal(blocked, true, "The migration must wait for the same row edited by the user");
    assert.equal(result.corrected, 0);
    assert.equal(result.preservedExisting, 1);
    assert.equal((await schedules(db))[0].status, "paused");
  } finally { await writer`rollback`; writer.release(); await db.close(); }
});
