// Isolated SQL contract test; no production credentials, candidates or network.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table company_workspace(company_workspace_id uuid primary key,company_name text,signup_state jsonb,signup_domain text,created_at timestamptz default now());
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,status text default 'draft',source_type text default 'internal',is_expired boolean default false,expires_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),name text,information jsonb);
    create table company_intro_candidates(id uuid primary key,company_workspace_id uuid,role_id uuid,talent_id uuid,status text);
    create table company_internal_roles(role_id uuid primary key,is_harper_tailored_role boolean default false);
    create table fixture_delivery(id uuid primary key);
    create table talent_opportunity_recommendation(id uuid primary key,role_id uuid,talent_id uuid,processed_stage text,updated_at timestamptz);
    create table talent_opportunity_tag(id bigserial primary key,talent_id uuid,opportunity_id uuid,tag text);
    create table talent_progress(id uuid primary key,company_user_id uuid,kind text,metadata jsonb,recommendation_id uuid,role_id uuid,talent_id uuid,text text,user_id text);

    create function request_company_intro_v1(uuid,uuid,uuid,uuid,text[],text) returns jsonb language plpgsql set search_path=public as $$
    begin
      if (select status from company_intro_candidates where id=$1)='requested' then return '{"status":"already_requested"}'; end if;
      update company_intro_candidates set status='requested' where id=$1;
      insert into fixture_delivery values ($1);
      return '{"status":"requested"}';
    end $$;
  `);
  const legacy = randomUUID();
  await db.query("insert into company_workspace(company_workspace_id) values ($1)", [legacy]);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261007052736_workspace_agent_subscriptions.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20261007061858_workspace_billing_annual_credits.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20261007113918_workspace_slot_credits.sql", import.meta.url), "utf8"));
  const migrationWorkspace=randomUUID();
  await db.query("insert into company_workspace(company_workspace_id,stripe_customer_id) values($1,'cus_migration')",[migrationWorkspace]);
  const migrationSnapshot=JSON.stringify({customer:'cus_migration',price:'price_migration',billingInterval:'month',status:'active',startedAt:new Date(Date.now()-86400000).toISOString(),periodEnd:new Date(Date.now()+86400000*29).toISOString()});
  const migrationPeriods=JSON.stringify([{invoiceId:'in_migration',startsAt:new Date(Date.now()-86400000).toISOString(),endsAt:new Date(Date.now()+86400000*29).toISOString(),confirmedAt:new Date(Date.now()-86400000).toISOString()}]);
  await scalar("select workspace_billing_sync_agent_v1($1,'sub_migration',0,$2,$3)",[migrationWorkspace,migrationSnapshot,migrationPeriods]);
  await db.query("update company_workspace_credit_periods set remaining=42 where company_workspace_id=$1 and agent_id is not null",[migrationWorkspace]);
  const migrationRows=await scalar("select jsonb_agg(to_jsonb(a)) from company_workspace_agents a");
  const migrationCreditRows=await scalar("select jsonb_agg(to_jsonb(p) order by id) from company_workspace_credit_periods p");
  await db.exec(readFileSync(new URL("../supabase/migrations/20261007125852_workspace_billing_slot_terminology.sql", import.meta.url), "utf8"));
  assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(a)) from company_workspace_slots a"),migrationRows,"renaming preserves every existing subscription field");
  assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(p)-'slot_id' order by id) from company_workspace_credit_periods p"),migrationCreditRows,"renaming preserves every existing credit period");
  const oldSnapshot=await scalar("select workspace_billing_summary_v1($1)",[migrationWorkspace]);
  assert.equal(oldSnapshot.agents[0].remaining,42);
  await scalar("select workspace_billing_sync_agent_v1($1,'sub_migration',$2,$3,$4)",[migrationWorkspace,oldSnapshot.agents[0].revision,migrationSnapshot,migrationPeriods]);
  assert.equal((await scalar("select workspace_billing_summary_v2($1)",[migrationWorkspace])).slots[0].remaining,42,"old webhook retries cannot refill credits");

  await db.exec(readFileSync(new URL("../supabase/migrations/20261007130037_workspace_slot_free_period_terminology.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20261008062440_workspace_slot_grants.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20261008080835_workspace_bulk_slot_checkout.sql", import.meta.url), "utf8"));
  // Existing shared usage survives migration. Only the allowance increases.
  const existingFree=randomUUID();
  await db.query("insert into company_workspace(company_workspace_id,billing_started_at,billing_free_anchor_at) values($1,now(),now())",[existingFree]);
  const existingPeriod=await scalar("select workspace_billing_free_period_v1($1,clock_timestamp())",[existingFree]);
  await db.query("update company_workspace_credit_periods set remaining=2 where id=$1",[existingPeriod]);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261008115719_workspace_shared_free_credits.sql", import.meta.url), "utf8"));
  const migrated=await scalar("select workspace_billing_summary_v2($1)",[existingFree]);
  assert.equal(migrated.creditSlots[0].remaining,7);
  assert.equal(migrated.creditSlots[0].allowance,10);
  assert.equal((await scalar("select workspace_billing_summary_v2($1)",[existingFree])).creditSlots[0].remaining,7,'migration uplift is applied once');
  assert.equal(await scalar("select workspace_billing_free_period_v1($1,clock_timestamp())",[existingFree]),existingPeriod);
  // Applying the DB before the app must preserve both existing and newly created
  // legacy workspaces: no capacity guard, automatic pause, or credit debit.
  const oldAppWorkspace = randomUUID();
  await db.query("insert into company_workspace(company_workspace_id) values ($1)", [oldAppWorkspace]);
  const oldAppRoles = [randomUUID(), randomUUID()];
  for (const id of oldAppRoles) await db.query("insert into company_roles(role_id,company_workspace_id,status,information) values ($1,$2,'active',$3)", [id,oldAppWorkspace,JSON.stringify({testOnly:true,testFixture:"workspace-billing-legacy-compatibility"})]);
  assert.equal((await scalar("select workspace_billing_summary_v2($1)", [oldAppWorkspace])).model,"legacy");
  assert.equal(await scalar("select count(*)::int from company_roles where company_workspace_id=$1 and status='active'",[oldAppWorkspace]),2);
  const oldAppIntro = randomUUID();
  await db.query("insert into company_intro_candidates values ($1,$2,$3,$4,'ready')",[oldAppIntro,oldAppWorkspace,oldAppRoles[0],randomUUID()]);
  const oldAppRequested = await scalar("select request_company_intro_v1($1,$2,$3,null,'{}','')",[oldAppIntro,oldAppWorkspace,randomUUID()]);
  assert.equal(oldAppRequested.status,"requested");
  assert.equal(await scalar("select count(*)::int from company_workspace_credit_events where company_workspace_id=$1",[oldAppWorkspace]),0);
  await db.query("delete from fixture_delivery where id=$1",[oldAppIntro]);
  await db.exec("grant usage on schema public to authenticated; grant insert,select on company_workspace to authenticated; set role authenticated");
  const oldClientWorkspace = randomUUID();
  await db.query("insert into company_workspace(company_workspace_id) values ($1)",[oldClientWorkspace]);
  assert.equal(await scalar("select billing_started_at from company_workspace where company_workspace_id=$1",[oldClientWorkspace]),null);
  await db.exec("reset role");
  const workspace = randomUUID(), role = randomUUID(), role2 = randomUUID(), actor = randomUUID(), talent = randomUUID();
  const summary = () => scalar("select workspace_billing_summary_v2($1)", [workspace]);
  const debit = (key, action = "intro_request", payload = {}) => scalar("select workspace_billing_debit_v1($1,$2,$3,$4,$5,$6,$7,true)", [workspace, action, key, role, talent, actor, JSON.stringify(payload)]);
  await db.query("insert into company_workspace(company_workspace_id,company_name,billing_started_at,billing_free_anchor_at) values ($1,'Billing fixture',now(),now())", [workspace]);
  for (const id of [role, role2]) await db.query("insert into company_roles(role_id,company_workspace_id,name,information) values ($1,$2,'Fixture', $3)", [id,workspace, JSON.stringify({ testOnly: true, testFixture: "workspace-billing-v1" })]);
  assert.equal((await scalar("select workspace_billing_summary_v2($1)", [legacy])).model, "legacy");
  assert.equal((await summary()).balance, 10);
  await assert.rejects(debit("free-connect", "connect"), /workspace_feature_unavailable/);
  assert.equal((await summary()).balance, 10);
  await db.query("update company_roles set status='active' where role_id=$1", [role]);
  await db.query("update company_roles set status='active' where role_id=$1",[role2]);
  assert.equal((await summary()).activeRoles,2);
  assert.equal((await summary()).capacity,null);
  await db.query("update company_roles set status='draft' where role_id=$1",[role2]);
  assert.equal((await summary()).creditSlots[0].roleId,null);
  await assert.rejects(scalar("select workspace_billing_debit_v1($1,'intro_request','draft',$2,$3,$4)",[workspace,role2,talent,actor]), /workspace_role_slot_required/);
  const first = await debit("same");
  assert.equal(await debit("same"), first);
  assert.equal((await summary()).balance, 9);
  await assert.rejects(debit("same", "intro_request", { changed: true }), /billing_action_conflict/);
  for (let i = 0; i < 9; i++) await debit(`free-${i}`);
  await assert.rejects(debit("empty"), /workspace_credits_exhausted/);
  const intro = randomUUID();
  await db.query("insert into company_intro_candidates values($1,$2,$3,$4,'ready')",[intro,workspace,role,talent]);
  await assert.rejects(db.query("select request_company_intro_v1($1,$2,$3,null,'{}','')",[intro,workspace,actor]), /workspace_credits_exhausted/);
  assert.equal(await scalar("select status from company_intro_candidates where id=$1", [intro]), "ready");
  assert.equal(await scalar("select count(*)::int from fixture_delivery"), 0);
  await db.query("update company_workspace set stripe_customer_id='cus_fixture' where company_workspace_id=$1", [workspace]);
  const now = Date.now(); const iso = days => new Date(now + days*86400000).toISOString();
  const sync = (id, revision, end, cancelAt = null) => scalar("select workspace_billing_sync_slot_v1($1,$2,$3,$4,$5)", [workspace,id,revision,JSON.stringify({ customer: "cus_fixture", price:"price_fixture",status:"active",startedAt:iso(-1),periodEnd:iso(end),cancelAt,endedAt:null }),JSON.stringify([{ invoiceId:`in_${id}`, startsAt:iso(-1),endsAt:iso(end), confirmedAt:iso(-1) }])]);
  assert.equal(await sync("sub_a",0,20), true);
  assert.equal((await summary()).balance, 50, "Free usage is not subtracted from paid credits");
  const rec = randomUUID(), token = randomUUID();
  await db.query("insert into talent_opportunity_recommendation(id,role_id,talent_id) values ($1,$2,$3)",[rec,role,talent]);
  const event = await scalar("select workspace_billing_debit_v1($1,'connect',$2,$3,$4,$5,$6)",[workspace,rec,role,talent,actor,JSON.stringify({input:{stage:"connected"}})]);
  assert.equal(await scalar("select workspace_billing_claim_action_v1($1,$2)",[event,token]),true);
  assert.equal(await scalar("select workspace_billing_claim_action_v1($1,$2)",[event,randomUUID()]),false,"one executor owns an approved connection");
  await scalar("select workspace_billing_commit_connection_v1($1,$2,$3,$4,$5,$6)",[event,token,["pending","connected"],"connected","connected",JSON.stringify({metadata:{},text:"Connected",user_id:"fixture@example.invalid"})]);
  await scalar("select workspace_billing_commit_connection_v1($1,$2,$3,$4,$5,$6)",[event,token,["pending","connected"],"connected","connected",JSON.stringify({metadata:{},text:"Connected",user_id:"fixture@example.invalid"})]);
  assert.equal(await scalar("select count(*)::int from talent_progress where id=$1",[event]),1);
  assert.equal(await scalar("select count(*)::int from talent_opportunity_tag where talent_id=$1",[talent]),1);
  assert.equal(await scalar("select workspace_billing_complete_action_v1($1,$2)",[event,token]),true);
  assert.equal(await scalar("select workspace_billing_claim_action_v1($1,$2)",[event,randomUUID()]),false);

  let a = (await summary()).slots[0];
  assert.equal(await sync("sub_a",a.revision,20), true);
  assert.equal((await summary()).balance,49,"duplicate invoice never refills credits");
  assert.equal(await sync("sub_a",0,20),false,"stale writers cannot replace a newer snapshot");
  assert.equal(await sync("sub_b",0,10),true);
  await db.query("update company_roles set status='active' where role_id=$1", [role2]);
  await debit("assigned-slot");
  let snap=await summary();
  assert.equal(snap.capacity,null); assert.equal(snap.balance,98);
  assert.equal(snap.creditSlots.find(x=>x.id===a.id).remaining,48,"only the assigned slot is debited, even if another expires sooner");
  assert.equal(snap.creditSlots.find(x=>x.slotId!==null && x.id!==a.id).remaining,50);
  assert.equal(snap.creditSlots.length,3);
  assert.equal(await scalar("select p.slot_id from company_workspace_credit_events e join company_workspace_credit_periods p on p.id=e.period_id where e.business_key='assigned-slot'"),a.id);
  // Exhaust the assigned slot: another paid slot cannot fund it when shared credits are also exhausted.
  await db.query("update company_workspace_credit_periods set remaining=0 where slot_id=$1",[a.id]);
  await assert.rejects(debit("no-borrow-intro"),/workspace_credits_exhausted/);
  await assert.rejects(debit("no-borrow-connect","connect"),/workspace_credits_exhausted/);
  assert.equal((await summary()).creditSlots.find(x=>x.slotId!==null && x.id!==a.id).remaining,50);
  assert.equal(await scalar("select count(*)::int from company_workspace_credit_events where business_key like 'no-borrow-%'"),0);
  await db.query("update company_workspace_credit_periods set remaining=48 where slot_id=$1",[a.id]);
  const b=snap.slots.find(x=>x.slotId!==null && x.id!==a.id);
  await scalar("select workspace_billing_assign_slot_v1($1,$2,$3,$4)",[workspace,b.id,role,b.revision]);
  snap=await summary(); assert.equal(snap.slots.find(x=>x.id===b.id).roleId,role);
  assert.equal(snap.slots.find(x=>x.id===a.id).roleId,role2);
  assert.equal(snap.creditSlots.find(x=>x.id===a.id).remaining,48,"swapping Roles never moves or refills credits");
  assert.equal(snap.creditSlots.find(x=>x.id===b.id).remaining,50);
  const replayId=await debit("assigned-slot");
  assert.equal(await scalar("select p.slot_id from company_workspace_credit_events e join company_workspace_credit_periods p on p.id=e.period_id where e.id=$1",[replayId]),a.id,"retry stays on its original slot after a swap");
  assert.equal((await summary()).creditSlots.find(x=>x.id===b.id).remaining,50);
  const requested=await scalar("select request_company_intro_v1($1,$2,$3,null,'{}','')",[intro,workspace,actor]);
  assert.equal(requested.status,"requested");
  await scalar("select request_company_intro_v1($1,$2,$3,null,'{}','')",[intro,workspace,actor]);
  assert.equal((await summary()).balance,97,"Intro is charged exactly once");
  assert.equal((await summary()).creditSlots.find(x=>x.id===b.id).remaining,49,"new action uses the new slot");
  // Pausing/restarting or reusing a slot does not reset its allowance.
  await db.query("update company_roles set status='paused' where role_id=$1",[role]);
  await assert.rejects(debit("paused-role"),/workspace_role_slot_required/);
  assert.equal((await summary()).creditSlots.find(x=>x.id===b.id).remaining,49);
  await db.query("update company_roles set status='active' where role_id=$1",[role]);
  assert.equal((await summary()).creditSlots.find(x=>x.id===b.id).remaining,49);
  // Renew just B; A keeps its remaining credits and its own renewal date.
  await db.query("update company_workspace_credit_periods set starts_at=now()-interval '2 months',ends_at=now()-interval '1 second' where slot_id=$1",[b.id]);
  await db.query("insert into company_workspace_credit_periods(company_workspace_id,slot_id,stripe_invoice_id,starts_at,ends_at,confirmed_at,allowance,remaining) values($1,$2,'in_b_renew',now()-interval '1 second',now()+interval '1 month',now()-interval '1 second',50,50)",[workspace,b.id]);
  snap=await summary();
  assert.equal(snap.creditSlots.find(x=>x.id===b.id).remaining,50);
  assert.equal(snap.creditSlots.find(x=>x.id===a.id).remaining,48);
  // The previous deployed app and signed webhooks remain usable during rollout.
  const previous = await scalar("select workspace_billing_summary_v1($1)",[workspace]);
  const current = await summary();
  assert.equal(previous.model,"agent"); assert.equal(current.model,"slot");
  assert.deepEqual(previous.agents,current.slots);
  assert.equal(previous.creditSlots[0].agentId,current.creditSlots[0].slotId);
  assert.equal(await scalar("select count(*)::int from company_workspace_agents where company_workspace_id=$1",[workspace]),current.slots.length);
  assert.equal(await scalar("select count(*)::int from company_workspace_credit_periods where slot_id is distinct from agent_id"),0);
  for(const role of ["anon","authenticated"]) {
    assert.equal(await scalar("select has_table_privilege($1,'company_workspace_slots','select')",[role]),false);
    assert.equal(await scalar("select has_table_privilege($1,'company_workspace_agents','select')",[role]),false);
    assert.equal(await scalar("select has_function_privilege($1,'workspace_billing_summary_v2(uuid)','execute')",[role]),false);
    assert.equal(await scalar("select has_function_privilege($1,'workspace_billing_sync_slot_v1(uuid,text,bigint,jsonb,jsonb)','execute')",[role]),false);
  }
  // Expiring a Slot releases paid access but keeps every Role active.
  await db.query("update company_workspace_slots set cancel_at=now()-interval '1 second' where id=$1",[b.id]);
  snap=await summary(); assert.equal(snap.capacity,null);
  assert.equal(await scalar("select status from company_roles where role_id=$1",[role]),"active");
  assert.equal(await scalar("select status from company_roles where role_id=$1",[role2]),"active");
  await db.query("update company_workspace_slots set ended_at=now()-interval '1 second' where id=$1",[a.id]);
  assert.equal((await summary()).balance,0,"return to Free does not replenish an already used Free period");
  assert.equal(await scalar("select status from company_roles where role_id=$1",[role2]),"active");
  await db.query("update company_workspace set billing_model='scale' where company_workspace_id=$1",[workspace]);
  await db.query("update company_roles set status='active' where role_id=$1",[role]);
  await debit("scale"); assert.equal((await summary()).balance,null); assert.equal((await summary()).capacity,null);
  assert.equal(await scalar("select delta from company_workspace_credit_events where business_key='scale'"),0);
  await db.exec("grant usage on schema public to authenticated; grant select,update,insert on company_workspace to authenticated; set role authenticated");
  await assert.rejects(db.query("update company_workspace set billing_model='scale' where company_workspace_id=$1",[legacy]),/billing_write_forbidden/);
  await assert.rejects(db.query("select workspace_billing_summary_v2($1)",[workspace]),/permission denied/);
  await db.exec("reset role");
  // Month-end anchor is computed from the original date, never from February's clamp.
  const monthly=randomUUID();
  await db.query("insert into company_workspace(company_workspace_id,billing_free_anchor_at) values($1,'2026-01-31T09:00:00+09')",[monthly]);
  const feb=await scalar("select workspace_billing_free_period_v1($1,'2026-02-28T10:00:00+09')",[monthly]);
  const febEnd=await scalar("select ends_at from company_workspace_credit_periods where id=$1",[feb]);
  assert.equal(new Date(febEnd).toISOString(),"2026-03-31T00:00:00.000Z");
  const mar=await scalar("select workspace_billing_free_period_v1($1,'2026-03-31T09:00:00+09')",[monthly]);
  assert.notEqual(feb,mar);
  // Abandoned checkout locks cannot be cleared by an old browser tab.
  const lock=await scalar("select workspace_billing_checkout_v1($1)",[monthly]);
  await assert.rejects(scalar("select workspace_billing_checkout_v1($1,null,$2,null)",[monthly,randomUUID()]),/billing_checkout_conflict/);
  assert.equal((await scalar("select workspace_billing_checkout_v1($1)",[monthly])).key,lock.key);
  // A year is paid once, but future credits stay unavailable until each month.
  const yearly=randomUUID(), yearlyRole=randomUUID();
  await db.query("insert into company_workspace(company_workspace_id,stripe_customer_id) values($1,'cus_year')",[yearly]);
  await db.query("insert into company_roles(role_id,company_workspace_id,status,information) values($1,$2,'draft',$3)",[yearlyRole,yearly,JSON.stringify({testOnly:true,testFixture:'annual-credits'})]);
  const periods=Array.from({length:12},(_,i)=>({invoiceId:'in_year',startsAt:iso(-1+i*30),endsAt:iso(-1+(i+1)*30),confirmedAt:iso(-1)}));
  const yearlySnapshot={customer:'cus_year',price:'price_year',billingInterval:'year',status:'active',startedAt:iso(-1),periodEnd:iso(359),cancelAt:iso(359)};
  const syncYear=(revision)=>scalar("select workspace_billing_sync_slot_v1($1,'sub_year',$2,$3,$4)",[yearly,revision,JSON.stringify(yearlySnapshot),JSON.stringify(periods)]);
  await syncYear(0);
  await db.query("update company_roles set status='active' where role_id=$1",[yearlyRole]);
  let ys=await scalar("select workspace_billing_summary_v2($1)",[yearly]);
  assert.equal(ys.balance,60); assert.equal(ys.capacity,null); assert.equal(ys.slots[0].billingInterval,'year');
  assert.equal(new Date(ys.slots[0].creditsRenewAt).toISOString(),periods[0].endsAt);
  for(let i=0;i<60;i++)await scalar("select workspace_billing_debit_v1($1,'intro_request',$2,$3,$4,$5,'{}',true)",[yearly,`year-${i}`,yearlyRole,talent,actor]);
  await assert.rejects(scalar("select workspace_billing_debit_v1($1,'intro_request','future',$2,$3,$4,'{}',true)",[yearly,yearlyRole,talent,actor]),/workspace_credits_exhausted/);
  await syncYear(ys.slots[0].revision);
  ys=await scalar("select workspace_billing_summary_v2($1)",[yearly]);assert.equal(ys.balance,0,'replayed annual invoice never refills this month');
  assert.equal(await scalar("select count(*)::int from company_workspace_credit_periods where stripe_invoice_id='in_year'"),12);
  assert.equal(await scalar("select workspace_billing_slot_active_v1(a,$1::timestamptz) from company_workspace_slots a where stripe_subscription_id='sub_year'",[iso(90)]),true,'cancelled annual Slot remains active in future paid months');
  assert.equal(await scalar("select workspace_billing_slot_active_v1(a,$1::timestamptz) from company_workspace_slots a where stripe_subscription_id='sub_year'",[iso(359)]),false,'access ends at the yearly cancellation boundary');
  for (const period of (await db.query("select id from company_workspace_credit_periods where company_workspace_id=$1 and slot_id is not null order by starts_at",[yearly])).rows) {
    await db.query("update company_workspace_credit_periods set starts_at=starts_at-interval '30 days',ends_at=ends_at-interval '30 days' where id=$1",[period.id]);
  }
  ys=await scalar("select workspace_billing_summary_v2($1)",[yearly]);assert.equal(ys.balance,50,'next monthly allowance starts automatically without another payment');

  // One purchase funds independent Slots. Partial cancellation changes only
  // next renewal; existing paid invoice coverage is immutable and retry-safe.
  const bulkWs=randomUUID();
  await db.query("insert into company_workspace(company_workspace_id,stripe_customer_id,billing_started_at) values($1,'cus_bulk',now())",[bulkWs]);
  const bulkSummary=()=>scalar('select workspace_billing_summary_v2($1)',[bulkWs]);
  let bulkSnapshot={customer:'cus_bulk',price:'price_bulk',status:'active',startedAt:iso(-1),periodEnd:iso(29),initialQuantity:3,quantity:3};
  const bulkPeriods=[{invoiceId:'in_bulk',startsAt:iso(-1),endsAt:iso(29),quantity:3,invoiceStartsAt:iso(-1)}];
  const bulkSync=async(periods=bulkPeriods,expected=null)=> {
    const revisions=expected ?? await scalar("select coalesce(jsonb_object_agg(id,revision),'{}') from company_workspace_slots where stripe_subscription_id='sub_bulk'");
    return scalar("select workspace_billing_sync_slots_v1($1,'sub_bulk',$2,$3,$4)",[bulkWs,JSON.stringify(revisions),JSON.stringify(bulkSnapshot),JSON.stringify(periods)]);
  };
  await bulkSync();
  let bs=await bulkSummary();
  assert.equal(bs.capacity,null); assert.deepEqual(bs.creditSlots.map(s=>s.remaining),[10,50,50,50]);
  assert.equal(await scalar("select count(*)::int from company_workspace_credit_periods where stripe_invoice_id='in_bulk'"),3);
  const bulkRole=randomUUID();
  await db.query("insert into company_roles(role_id,company_workspace_id,status,information) values($1,$2,'active',$3)",[bulkRole,bulkWs,JSON.stringify({testOnly:true,testFixture:'bulk-slots'})]);
  await scalar("select workspace_billing_debit_v1($1,'intro_request','bulk-one',$2,$3,$4,'{}',true)",[bulkWs,bulkRole,talent,actor]);
  const prepare=(slot,cancel,revision=slot.revision)=>scalar("select workspace_billing_prepare_change_v1($1,$2,$3,$4,'si_bulk',$5)",[bulkWs,slot.id,revision,cancel,iso(29)]);
  const finish=(change)=>scalar('select workspace_billing_finish_change_v1($1,$2,$3)',[bulkWs,change.id,iso(29)]);
  bs=await bulkSummary();
  const selected=bs.slots.find(s=>s.roleId===bulkRole);
  let change=await prepare(selected,true);
  assert.equal(change.quantity,2); assert.equal(change.cancelSubscription,false);
  assert.deepEqual(await prepare(selected,true),change,'retry returns immutable change');
  await assert.rejects(prepare(bs.slots.find(s=>s.id!==selected.id),true),/billing_change_conflict/);
  assert.equal(await bulkSync(),false,'webhook cannot overwrite a pending change');
  await finish(change); assert.equal(await finish(change),false,'old completion is harmless');
  bulkSnapshot.quantity=2;
  await bulkSync();
  bs=await bulkSummary();
  assert.equal(bs.capacity,null); assert.equal(bs.slots.find(s=>s.id===selected.id).remaining,49,'cancel never refills or revokes already paid credits');
  assert.equal(new Date(bs.slots.find(s=>s.id===selected.id).cancelAt).toISOString(),iso(29));
  await assert.rejects(prepare(selected,false),/billing_change_conflict/,'stale revision rejected');
  assert.equal(await scalar("select workspace_billing_sync_slot_v1($1,'sub_bulk',1,$2,$3)",[bulkWs,JSON.stringify(bulkSnapshot),JSON.stringify(bulkPeriods)]),false,'old single-slot writers cannot corrupt a bulk subscription');
  change=await prepare(bs.slots.find(s=>s.id===selected.id),false); assert.equal(change.quantity,3); await finish(change);bulkSnapshot.quantity=3;await bulkSync();
  bs=await bulkSummary();assert.equal(bs.slots.find(s=>s.id===selected.id).cancelAt,null);
  for (const id of bs.slots.map(s=>s.id)) { const slot=(await bulkSummary()).slots.find(s=>s.id===id); change=await prepare(slot,true);await finish(change); }
  assert.equal(change.cancelSubscription,true);assert.equal(change.quantity,1,'Stripe never receives quantity zero');
  bs=await bulkSummary();change=await prepare(bs.slots.find(s=>s.id!==selected.id),false);await finish(change);
  assert.equal(change.quantity,1);assert.equal(change.cancelSubscription,false,'one slot can resume without resuming the other two');
  bulkSnapshot.quantity=1;await bulkSync();
  const renewal=[{invoiceId:'in_bulk_next',startsAt:iso(29),endsAt:iso(59),quantity:1}];
  bulkSnapshot.periodEnd=iso(59);await bulkSync(renewal);
  assert.equal(await scalar("select count(*)::int from company_workspace_credit_periods where stripe_invoice_id='in_bulk_next'"),1,'renewal only credits retained slots');
  await bulkSync(bulkPeriods); // replay an OLD full-quantity invoice after partial renewal
  assert.equal(await scalar("select remaining from company_workspace_credit_periods where slot_id=$1 and stripe_invoice_id='in_bulk'",[selected.id]),49);
  await assert.rejects(bulkSync([{...renewal[0],quantity:2}]),/billing_invoice_quantity_conflict/);
  assert.equal(await bulkSync(bulkPeriods,{}),false);
  // The next paid period belongs only to the retained Slot, even at exact expiry.
  assert.equal(await scalar("select count(*)::int from company_workspace_slots a where company_workspace_id=$1 and workspace_billing_slot_active_v1(a,$2)",[bulkWs,iso(29)]),1);
  for(const roleName of ['anon','authenticated'])for(const fn of ['workspace_billing_sync_slots_v1(uuid,text,jsonb,jsonb,jsonb)','workspace_billing_prepare_change_v1(uuid,uuid,bigint,boolean,text,timestamptz)','workspace_billing_finish_change_v1(uuid,uuid,timestamptz)','workspace_billing_checkout_v2(uuid,jsonb,text,uuid,text)'])assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\')',[roleName,fn]),false);
  const lockIntent={quantity:3,interval:'year',price:'price_year'};
  await scalar('select workspace_billing_checkout_v1($1,null,$2,null)',[monthly,lock.key]);
  const bulkLock=await scalar('select workspace_billing_checkout_v2($1,$2)',[monthly,JSON.stringify(lockIntent)]);
  assert.deepEqual((await scalar('select workspace_billing_checkout_v2($1,$2)',[monthly,JSON.stringify({...lockIntent,quantity:5})])).intent,lockIntent,'concurrent checkout callers cannot rewrite the frozen inputs');
  assert.deepEqual(bulkLock.intent,lockIntent);
  // A declined renewal must not prevent cancellation of future billing.
  const unpaidWs=randomUUID();
  await db.query("insert into company_workspace(company_workspace_id,stripe_customer_id,billing_started_at) values($1,'cus_unpaid',now())",[unpaidWs]);
  await scalar("select workspace_billing_sync_slots_v1($1,'sub_unpaid','{}',$2,'[]')",[unpaidWs,JSON.stringify({...bulkSnapshot,customer:'cus_unpaid',status:'past_due',quantity:3})]);
  const unpaidSlot=(await scalar('select workspace_billing_summary_v2($1)',[unpaidWs])).slots[0];
  assert.equal(unpaidSlot.active,false);
  const unpaidChange=await scalar("select workspace_billing_prepare_change_v1($1,$2,$3,true,'si_unpaid',$4)",[unpaidWs,unpaidSlot.id,unpaidSlot.revision,iso(29)]);
  assert.equal(unpaidChange.quantity,2,'future billing can be cancelled even while paid access is suspended');
  console.log('PASS bulk SQL: three Slots, isolated credits, partial cancel/resume, all cancel, retry recovery, renewal, stale webhooks, frozen checkout');

  // Complimentary slots exercise the same production RPCs as subscriptions.
  const grantedWorkspace=randomUUID(), grantRequest=randomUUID();
  const grantRoles=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];
  await db.query("insert into company_workspace(company_workspace_id,billing_started_at,billing_free_anchor_at) values($1,now(),now())",[grantedWorkspace]);
  for (const id of grantRoles) await db.query("insert into company_roles(role_id,company_workspace_id,status,information) values($1,$2,'draft',$3)",[id,grantedWorkspace,JSON.stringify({testOnly:true,testFixture:'workspace-slot-grants'})]);
  await db.query("update company_roles set status='active' where role_id=$1",[grantRoles[0]]);
  const grantSummary=()=>scalar("select workspace_billing_summary_v2($1)",[grantedWorkspace]);
  const grant=(request=grantRequest, count=2, target=grantedWorkspace)=>scalar("select workspace_billing_grant_slots_v1($1,$2,$3,'operator@example.invalid','Local contract test')",[target,request,count]);
  const grantDebit=(roleId,key,action='intro_request')=>scalar("select workspace_billing_debit_v1($1,$2,$3,$4,$5,$6,'{}',true)",[grantedWorkspace,action,key,roleId,talent,actor]);
  for(let i=0;i<10;i++) await grantDebit(grantRoles[0],`free-before-grant-${i}`);
  assert.equal((await grantSummary()).creditSlots[0].remaining,0);
  const firstGrant=await grant();
  assert.equal(firstGrant.created,true);
  assert.equal(firstGrant.slotIds.length,2);
  assert.equal(await scalar("select $1::timestamptz=((($2::timestamptz at time zone 'Asia/Seoul')+interval '1 month') at time zone 'Asia/Seoul')",[firstGrant.endsAt,firstGrant.startedAt]),true);
  let gs=await grantSummary();
  assert.equal(gs.model,'slot'); assert.equal(gs.capacity,null); assert.equal(gs.hasCustomer,false);
  assert.deepEqual(gs.creditSlots.map(s=>s.remaining),[0,50,50],'spent Free credits do not reduce a grant');
  assert.ok(gs.slots.every(s=>s.source==='grant' && s.active && s.cancelAt===firstGrant.endsAt));
  await db.query("update company_roles set status='active' where role_id=$1",[grantRoles[1]]);
  await db.query("update company_roles set status='active' where role_id=$1",[grantRoles[2]]);
  const grantEvent=await grantDebit(grantRoles[0],'grant-connect','connect');
  assert.equal(await grantDebit(grantRoles[0],'grant-connect','connect'),grantEvent);
  const repeated=await grant(); assert.equal(repeated.created,false); assert.deepEqual(repeated.slotIds,firstGrant.slotIds);
  gs=await grantSummary(); assert.equal(gs.creditSlots.find(s=>s.roleId===grantRoles[0]).remaining,49);
  assert.equal(gs.creditSlots.find(s=>s.roleId===grantRoles[1]).remaining,50,'other slot balance is isolated');
  await assert.rejects(grant(grantRequest,3),/billing_grant_request_conflict/);
  await assert.rejects(grant(grantRequest,2,legacy),/billing_grant_request_conflict/);
  await assert.rejects(grant(randomUUID(),0),/billing_grant_invalid/);
  await assert.rejects(grant(randomUUID(),2,legacy),/billing_grant_standard_plan_required/);
  await assert.rejects(grant(randomUUID(),2,workspace),/billing_grant_standard_plan_required/);
  for (const roleName of ['anon','authenticated']) assert.equal(await scalar("select has_function_privilege($1,'workspace_billing_grant_slots_v1(uuid,uuid,integer,text,text)','execute')",[roleName]),false);
  assert.equal(await scalar("select has_function_privilege('service_role','workspace_billing_grant_slots_v1(uuid,uuid,integer,text,text)','execute')"),true);
  await assert.rejects(db.query("insert into company_workspace_credit_periods(company_workspace_id,slot_id,starts_at,ends_at,allowance,remaining) select company_workspace_id,id,started_at+interval '1 second',current_period_end,50,50 from company_workspace_slots where id=$1",[firstGrant.slotIds[0]]),/billing_period_source_conflict/);
  await assert.rejects(db.query("insert into company_workspace_credit_periods(company_workspace_id,slot_id,stripe_invoice_id,starts_at,ends_at,allowance,remaining) select company_workspace_id,id,'fake',started_at,current_period_end,50,50 from company_workspace_slots where id=$1",[firstGrant.slotIds[0]]),/billing_period_source_conflict/);
  await assert.rejects(db.query("insert into company_workspace_credit_periods(company_workspace_id,slot_id,starts_at,ends_at,allowance,remaining) select company_workspace_id,id,now()+interval '1 year',now()+interval '2 years',50,50 from company_workspace_slots where stripe_subscription_id='sub_year'"),/billing_period_source_conflict/);
  // Exhaustion never consumes the neighbouring slot, even for a grant.
  for(let i=0;i<49;i++) await grantDebit(grantRoles[0],`grant-spend-${i}`);
  await assert.rejects(grantDebit(grantRoles[0],'grant-exhausted'),/workspace_credits_exhausted/);
  assert.equal((await grantSummary()).creditSlots.find(s=>s.roleId===grantRoles[1]).remaining,50);
  // A new subscription can coexist with grants. Replayed Stripe invoices do not touch them.
  await db.query("update company_workspace set stripe_customer_id='cus_mixed' where company_workspace_id=$1",[grantedWorkspace]);
  const mixedSnapshot=JSON.stringify({customer:'cus_mixed',price:'price_mixed',status:'active',startedAt:iso(-1),periodEnd:iso(60)});
  const mixedPeriods=JSON.stringify([{invoiceId:'in_mixed',startsAt:iso(-1),endsAt:iso(60),confirmedAt:iso(-1)}]);
  await scalar("select workspace_billing_sync_slot_v1($1,'sub_mixed',0,$2,$3)",[grantedWorkspace,mixedSnapshot,mixedPeriods]);
  await db.query("update company_roles set status='active' where role_id=$1",[grantRoles[2]]);
  gs=await grantSummary(); assert.equal(gs.capacity,null); assert.equal(gs.creditSlots.length,4);
  const mixedSlot=gs.slots.find(s=>s.source==='stripe');
  assert.equal(mixedSlot.roleId,grantRoles[2]);
  await scalar("select workspace_billing_sync_slot_v1($1,'sub_mixed',$2,$3,$4)",[grantedWorkspace,mixedSlot.revision,mixedSnapshot,mixedPeriods]);
  assert.equal((await grantSummary()).creditSlots.find(s=>s.roleId===grantRoles[0]).remaining,0);
  // Advance only the test database clock; expiry uses the real production reconciler.
  await db.exec('begin');
  const afterGrantEnd=new Date(Date.parse(firstGrant.endsAt)+1).toISOString();
  for (const {definition} of (await db.query("select pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname like 'workspace_billing_%' and prokind='f'")).rows) {
    if(definition.includes('clock_timestamp()')) await db.exec(definition.replaceAll('clock_timestamp()',`'${afterGrantEnd}'::timestamptz`));
  }
  await scalar('select workspace_billing_expire_due_v1(200)');
  gs=await grantSummary(); assert.equal(gs.capacity,null); assert.equal(gs.model,'slot');
  assert.ok(gs.slots.filter(s=>s.source==='grant').every(s=>!s.active && s.roleId===null));
  assert.equal(gs.slots.find(s=>s.source==='stripe').roleId,grantRoles[2]);
  for (const id of grantRoles.slice(0,2)) assert.equal(await scalar('select status from company_roles where role_id=$1',[id]),'active');
  assert.equal((await grant()).created,false,'expired grant retry does not restore entitlement');
  await assert.rejects(grantDebit(grantRoles[0],'expired-grant-connect','connect'),/workspace_feature_unavailable/);
  await db.exec('rollback');
  // All slots ending keeps all Free Roles active, preserving data and prior Free spend.
  await db.query("update company_workspace_slots set ended_at=now()-interval '1 second',cancel_at=now()-interval '1 second' where company_workspace_id=$1",[grantedWorkspace]);
  gs=await grantSummary(); assert.equal(gs.capacity,null); assert.equal(gs.model,'free');
  assert.equal(gs.activeRoles,3); assert.equal(gs.creditSlots[0].remaining,0);
  assert.equal(await scalar('select count(*)::int from company_roles where company_workspace_id=$1',[grantedWorkspace]),4);
  assert.equal((await grant()).created,false);
  await assert.rejects(grantDebit(grantRoles[0],'free-connect','connect'),/workspace_feature_unavailable/);
  console.log('PASS grants: 50 per slot, paid rights, calendar-month expiry, mixed subscriptions, idempotency, no rollover, Free fallback, permissions');
  console.log("PASS billing SQL: unlimited Roles, drafts, atomic Intro, idempotency, Free→paid, slot isolation, per-slot renewal, swapping, cancellation, Scale, permissions");
} finally { await db.close(); }
