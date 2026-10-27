// Real concurrent PostgreSQL sessions against a disposable local-only cluster.
// No .env, network services, Stripe, candidates or production database are used.
// Run: node scripts/testWorkspaceFreePlan.mjs [--pg-bin=/path/to/postgres/bin]
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { createWorkspaceBillingFixture } from "./lib/workspaceBillingFixture.mjs";

const pgBin =
  process.argv.find((v) => v.startsWith("--pg-bin="))?.slice(9) ??
  "/usr/local/opt/postgresql@17/bin";
const directory = mkdtempSync(path.join(tmpdir(), "harper-free-restore-"));
const data = path.join(directory, "db");
const port = 55489; // Unique Unix socket directory; TCP is disabled.
let started = false,
  sql;
try {
  execFileSync(
    path.join(pgBin, "initdb"),
    ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale"],
    { stdio: "ignore" }
  );
  execFileSync(
    path.join(pgBin, "pg_ctl"),
    [
      "-D",
      data,
      "-l",
      path.join(directory, "server.log"),
      "-o",
      `-F -k ${directory} -h '' -p ${port}`,
      "-w",
      "start",
    ],
    { stdio: "ignore" }
  );
  started = true;
  sql = postgres({
    host: directory,
    port,
    user: "postgres",
    database: "postgres",
    max: 1,
    onnotice: () => {},
  });
  const db = {
    exec: (q) => sql.unsafe(q),
    query: async (q, args = []) => ({ rows: await sql.unsafe(q, args) }),
  };
  await createWorkspaceBillingFixture(db);
  await sql.end();
  sql = postgres({
    host: directory,
    port,
    user: "postgres",
    database: "postgres",
    max: 16,
    onnotice: () => {},
  });
  const scalar = async (q, args = []) =>
    Object.values((await sql.unsafe(q, args))[0])[0];

  const migration = (file) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
  const actor=randomUUID(), talent=randomUUID();
  const fixture = async (count, model='standard', enrolled=true) => {
    const workspace=randomUUID(), roles=Array.from({length:count},randomUUID);
    await sql`insert into company_workspace(company_workspace_id,billing_model,billing_started_at,billing_free_anchor_at)
      values(${workspace},${model},${enrolled ? new Date() : null},now())`;
    for (const [index,role] of roles.entries()) {
      await sql`insert into company_roles(role_id,company_workspace_id,status,created_at,information)
        values(${role},${workspace},'draft',now()+${index}*interval '1 second',${sql.json({testOnly:true,testFixture:'free-plan-restoration',testTalentIds:[talent]})})`;
      await sql`insert into company_internal_roles(role_id) values(${role})`;
    }
    return {workspace,roles,summary:()=>scalar('select workspace_billing_summary_v2($1)',[workspace])};
  };
  const activate=(role)=>sql`update company_roles set status='active' where role_id=${role}`;
  const debit=(f,role,key,action='intro_request')=>scalar("select workspace_billing_debit_v1($1,$2,$3,$4,$5,$6,'{}',true)",[f.workspace,action,key,role,talent,actor]);
  const grant=(f)=>scalar("select workspace_billing_grant_slots_v1($1,$2,1,'local-test','local fixture')",[f.workspace,randomUUID()]);
  // Simulate a workspace that already spent Intros before the temporary views policy.
  const existing=await fixture(3);
  for (const role of existing.roles) await activate(role);
  await debit(existing,existing.roles[0],'prior-intro-1');
  await debit(existing,existing.roles[0],'prior-intro-2');
  await sql.unsafe(`
    alter table company_workspace add column published_name text;
    alter table company_intro_candidates add column requested_at timestamptz;
    alter table talent_progress alter column id set default gen_random_uuid();
    alter table talent_progress add column created_at timestamptz default now(),add column open_to_talent boolean default false,add column open_to_company boolean default false;
    create table talent_users(user_id uuid primary key,deleted_at timestamptz);
    create table talent_opportunity_fit(talent_id uuid,opportunity_id uuid,unique(talent_id,opportunity_id));
    create table company_first_slack_outbox(id uuid);
  `);
  for (const file of ['20261021091411_workspace_candidate_views.sql','20261021130000_candidate_views_test_role_isolation.sql','20261022023917_candidate_views_progress_log.sql']) await sql.unsafe(migration(file));
  const period=await scalar('select workspace_billing_free_period_v1($1,now())',[existing.workspace]);
  await sql`insert into company_workspace_credit_events(company_workspace_id,period_id,action_code,business_key,role_id,talent_id,actor_id,delta,completed_at)
    values(${existing.workspace},${period},'candidate_view','old-view',${existing.roles[0]},${talent},${actor},-1,now())`;
  await sql`insert into talent_progress(role_id,talent_id,kind,text) values(${existing.roles[0]},${talent},'candidate_profile_opened','Historical opening')`;
  await scalar('select workspace_billing_free_period_v1($1,now())',[existing.workspace]);
  assert.equal(await scalar('select remaining from company_workspace_credit_periods where id=$1',[period]),9);
  const previousReceipts=await scalar("select count(*) from talent_progress where kind='candidate_profile_opened'");
  const preservedContracts=[];
  for (const [model,enrolled] of [['scale',true],['standard',false]]) {
    const contract=await fixture(0,model,enrolled);
    const contractPeriod=await scalar('select workspace_billing_free_period_v1($1,now())',[contract.workspace]);
    await sql`update company_workspace_credit_periods set remaining=3 where id=${contractPeriod}`;
    preservedContracts.push({workspace:contract.workspace,period:contractPeriod});
  }
  const migrationSession = await sql.reserve();
  try { await migrationSession.unsafe(migration('20261022071755_restore_free_intros_and_single_active_role.sql')); } finally { migrationSession.release(); }
  assert.equal((await existing.summary()).creditSlots[0].remaining,8,'only actual Intro usage counts');
  assert.equal((await existing.summary()).activeRoles,1,'existing surplus Free Roles paused');
  assert.equal(await scalar('select status from company_roles where role_id=$1',[existing.roles[0]]),'active','oldest Free Role preserved');
  assert.equal(Number(await scalar("select count(*) from talent_progress where kind='candidate_profile_opened'")),Number(previousReceipts),'historical receipts preserved');
  assert.equal(await scalar("select to_regprocedure('workspace_open_candidate_v1(uuid,uuid,uuid,uuid)')"),null);
  assert.equal(await scalar("select to_regprocedure('workspace_candidate_access_v1(uuid)')"),null);
  assert.equal(Number(await scalar("select count(*) from information_schema.columns where table_name='company_first_slack_outbox' and column_name='profile_access'")),0);
  assert.equal(await scalar("select has_function_privilege('authenticated','workspace_billing_debit_v1(uuid,text,text,uuid,uuid,uuid,jsonb,boolean)','execute')"),false);
  for (const contract of preservedContracts) {
    const [period]=await sql`select allowance,remaining from company_workspace_credit_periods where id=${contract.period}`;
    assert.deepEqual({...period},{allowance:10,remaining:3},'restoration must not rewrite separate contract balances');
    assert.equal(await scalar('select billing_reconciled_at from company_workspace where company_workspace_id=$1',[contract.workspace]),null,'restoration must not reconcile unrelated workspaces');
  }

  // Existing usage above the new allowance must clamp to zero, not refund or fail.
  const overdrawn=await fixture(1); await activate(overdrawn.roles[0]);
  for (let index=0;index<5;index++) await debit(overdrawn,overdrawn.roles[0],`before-reduction-${index}`);
  const preparedFuture=await scalar("select workspace_billing_free_period_v1($1,now()+interval '1 month')",[overdrawn.workspace]);
  assert.equal(await scalar('select allowance from company_workspace_credit_periods where id=$1',[preparedFuture]),10);

  // Apply the new billing policy after testing the historical restoration.
  const policy = migration('20261027074848_free_role_matching_and_three_intros.sql')
    .split('-- BILLING POLICY START')[1].split('-- BILLING POLICY END')[0];
  await sql.unsafe(policy);
  assert.equal((await existing.summary()).creditSlots[0].allowance,3);
  assert.equal((await existing.summary()).creditSlots[0].remaining,1,'two previous Intro debits survive the reduction');
  assert.equal((await overdrawn.summary()).creditSlots[0].remaining,0,'five previous debits leave zero under the new allowance');
  assert.equal(await scalar('select count(*)::int from company_workspace_credit_events where company_workspace_id=$1 and delta=-1',[overdrawn.workspace]),5,'past debit receipts are preserved');
  const [futureBalance]=await sql`select allowance,remaining from company_workspace_credit_periods where id=${preparedFuture}`;
  assert.deepEqual({...futureBalance},{allowance:3,remaining:3},'pre-created future periods use the new allowance');
  for (const contract of preservedContracts) {
    assert.equal(await scalar('select remaining from company_workspace_credit_periods where id=$1',[contract.period]),3);
  }
  const connection=await fixture(1); await activate(connection.roles[0]);
  const receipt=await debit(connection,connection.roles[0],'free-connect','connect');
  assert.equal((await connection.summary()).creditSlots[0].remaining,2,'Free Connect uses a shared Intro');
  assert.equal(await debit(connection,connection.roles[0],'free-connect','connect'),receipt);
  assert.equal((await connection.summary()).creditSlots[0].remaining,2,'Connect retry does not double-debit');
  await sql`update company_roles set status='paused' where role_id=${connection.roles[0]}`;
  await assert.rejects(debit(connection,connection.roles[0],'paused-connect','connect'),/workspace_role_slot_required/);
  const futurePeriod=await scalar("select workspace_billing_free_period_v1($1,now()+interval '1 month')",[connection.workspace]);
  assert.equal(await scalar('select allowance from company_workspace_credit_periods where id=$1',[futurePeriod]),3);

  const free=await fixture(8);
  const activations=await Promise.allSettled(free.roles.map(activate));
  assert.equal(activations.filter(r=>r.status==='fulfilled').length,1,'concurrent Free activation admits exactly one');
  assert.ok(activations.filter(r=>r.status==='rejected').every(r=>r.reason.message.includes('workspace_role_capacity_exceeded')));
  assert.equal((await free.summary()).capacity,1);
  const active=await scalar("select role_id from company_roles where company_workspace_id=$1 and status='active'",[free.workspace]);
  const spends=await Promise.allSettled(Array.from({length:12},(_,i)=>debit(free,active,`spend-${i}`)));
  assert.equal(spends.filter(r=>r.status==='fulfilled').length,3,'three Intro uses without opening any profile');
  assert.equal((await free.summary()).creditSlots[0].remaining,0);
  const spentIndex=spends.findIndex(r=>r.status==='fulfilled');
  assert.equal(await debit(free,active,`spend-${spentIndex}`),spends[spentIndex].value,'retry after exhaustion is idempotent');
  await assert.rejects(debit(free,active,'retired-view','candidate_view'),/billing_action_invalid/);
  const next=free.roles.find(role=>role!==active);
  await sql`update company_roles set status='paused' where role_id=${active}`;
  await activate(next);
  assert.equal((await free.summary()).activeRoles,1,'Intro exhaustion does not prevent switching active Free Role');
  await assert.rejects(debit(free,next,'no-paid-connect','connect'),/workspace_credits_exhausted/);

  const paid=await fixture(3);
  await activate(paid.roles[0]);
  const paidGrant=await grant(paid),slot=paidGrant.slotIds[0];
  await activate(paid.roles[1]);
  await assert.rejects(activate(paid.roles[2]),/workspace_role_capacity_exceeded/);
  assert.equal((await paid.summary()).capacity,2);
  assert.equal((await paid.summary()).activeRoles,2,'one paid plus one Free Role');
  const duplicates=await Promise.all(Array.from({length:5},()=>debit(paid,paid.roles[0],'same-intro')));
  assert.ok(duplicates.every(id=>id===duplicates[0]));
  assert.equal((await paid.summary()).slots[0].remaining,49,'paid Intro first, exactly once');
  await sql`update company_workspace_credit_periods set remaining=0 where slot_id=${slot}`;
  await debit(paid,paid.roles[0],'paid-fallback');
  assert.equal((await paid.summary()).creditSlots[0].remaining,2,'paid Role falls back to shared Intros');
  const currentSlot=(await paid.summary()).slots[0];
  await scalar('select workspace_billing_assign_slot_v1($1,$2,$3,$4)',[paid.workspace,slot,paid.roles[1],currentSlot.revision]);
  assert.equal((await paid.summary()).activeRoles,2,'slot reassignment keeps one Free Role');
  await sql`update company_workspace_slots set ended_at=now(),cancel_at=now() where id=${slot}`;
  const expired=await paid.summary();
  assert.equal(expired.activeRoles,1,'expiry leaves at most one Free Role');
  assert.equal(expired.creditSlots[0].remaining,2,'expiry does not refill shared Intros');
  assert.equal(await debit(paid,paid.roles[0],'same-intro'),duplicates[0],'previous paid receipt stays idempotent');

  // Separate contracts keep their existing entitlement.
  for (const [model,enrolled] of [['scale',true],['standard',false]]) {
    const contract=await fixture(3,model,enrolled);
    for (const role of contract.roles) await activate(role);
    assert.equal((await contract.summary()).activeRoles,3);
    assert.equal((await contract.summary()).capacity,null);
  }
  const tailored=await fixture(3);
  await sql`update company_internal_roles set is_harper_tailored_role=true where role_id=${tailored.roles[2]}`;
  await activate(tailored.roles[0]); await activate(tailored.roles[2]);
  await assert.rejects(activate(tailored.roles[1]),/workspace_role_capacity_exceeded/);
  assert.equal((await tailored.summary()).activeRoles,2);
  const tailoredIntro=await debit(tailored,tailored.roles[2],'contract-intro');
  const tailoredConnection=await debit(tailored,tailored.roles[2],'contract-connect','connect');
  assert.equal((await tailored.summary()).creditSlots[0].remaining,3,'no-slot contract access must not consume Free Intros');
  assert.equal(Number(await scalar('select sum(delta) from company_workspace_credit_events where id in ($1,$2)',[tailoredIntro,tailoredConnection])),0,'contract receipts preserve zero-debit behavior');
  assert.equal(await debit(tailored,tailored.roles[2],'contract-connect','connect'),tailoredConnection,'contract connection stays idempotent');
  console.log('PASS: view-policy migration rollback, 3 shared Intros and Free Connect, concurrent activation/spending, idempotency, paid fallback, slot reassignment/expiry, historical data and contract preservation');
} finally {
  if (sql) await sql.end();
  if (started)
    execFileSync(
      path.join(pgBin, "pg_ctl"),
      ["-D", data, "-m", "fast", "-w", "stop"],
      { stdio: "ignore" }
    );
  rmSync(directory, { recursive: true, force: true });
}
