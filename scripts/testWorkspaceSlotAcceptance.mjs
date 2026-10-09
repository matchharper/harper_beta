// In-memory PostgreSQL integration: actual billing + candidate acceptance RPCs.
// No credentials, network, emails, production data, or new matching decisions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const scalar = async (sql, args=[]) => Object.values((await db.query(sql,args)).rows[0])[0];
async function loadFunction(file, name) {
  const source=migration(file);
  const start=source.toLowerCase().indexOf(`create or replace function public.${name}(`);
  const opening=/\bas\s+(\$[a-z_]*\$)/i.exec(source.slice(start));
  assert.ok(start>=0 && opening, name);
  const end=source.indexOf(opening[1]+';',start+opening.index+opening[0].length);
  await db.exec(source.slice(start,end+opening[1].length+1));
}
const history='20260928045449_company_first_score_reuse_and_recommendation_history.sql';
try {
  await db.exec(readFileSync(new URL('./fixtures/unifiedMatchingSchema.sql',import.meta.url),'utf8').replace(/(?:public\.)?vector\(\d+\)/g,'text'));
  // Rewind only captured billing columns so the complete additive migrations run.
  await db.exec(`alter table company_workspace drop column billing_model,drop column billing_started_at,
    drop column billing_free_anchor_at,drop column billing_reconciled_at,drop column stripe_customer_id,drop column billing_checkout;
    alter table company_workspace add column signup_state jsonb,add column signup_domain text;
    create table talent_role_activity(id uuid primary key default gen_random_uuid(),recommendation_id uuid,kind text,metadata jsonb);`);
  await loadFunction('20260918015954_relax_company_intro_constraints_and_fixture_guards.sql','company_intro_role_allows_talent_v1');
  for (const name of ['current_talent_recommendation_id_v1','update_talent_role_feedback_v1',
    'accept_talent_internal_role_recommendation_v1','handoff_ready_company_candidate_on_acceptance_v1','request_company_intro_v1']) {
    await loadFunction(history,name);
  }
  await loadFunction('20261007131000_internal_decision_revision.sql','accept_talent_internal_role_recommendation_v2');
  await db.exec(`create trigger handoff_ready_company_candidate_on_acceptance_v1
    after update of feedback,saved_stage on talent_opportunity_recommendation
    for each row when(old.feedback is distinct from new.feedback or old.saved_stage is distinct from new.saved_stage)
    execute function handoff_ready_company_candidate_on_acceptance_v1()`);
  for (const name of ['20261007052736_workspace_agent_subscriptions.sql','20261007061858_workspace_billing_annual_credits.sql',
    '20261007113918_workspace_slot_credits.sql','20261007125852_workspace_billing_slot_terminology.sql',
    '20261007130037_workspace_slot_free_period_terminology.sql','20261008062440_workspace_slot_grants.sql','20261008080835_workspace_bulk_slot_checkout.sql']) await db.exec(migration(name));
  await loadFunction('20261008043437_role_matching_route_eligibility.sql','role_matching_slot_type_v1');
  await db.exec(migration('20261008115719_workspace_shared_free_credits.sql'));

  for (const source of ['stripe','grant']) {
    const workspace=randomUUID(), talent=randomUUID(), request=randomUUID();
    const roles=[randomUUID(),randomUUID()];
    const recommendation=randomUUID();
    await db.query("insert into company_workspace(company_workspace_id,company_name,billing_started_at,billing_free_anchor_at,stripe_customer_id) values($1,'Local fixture',now(),now(),$2)",[workspace,source==='stripe'?`cus_${workspace}`:null]);
    await db.query("insert into talent_users(user_id,name) values($1,'Local fixture')",[talent]);
    await db.query("insert into talent_setting(user_id,is_onboarding_done,profile_visibility) values($1,true,'open_to_matches')",[talent]);
    for (const [index,role] of roles.entries()) {
      await db.query("insert into company_roles(role_id,company_workspace_id,name,status,information,created_at) values($1,$2,'Marked fixture','draft',$3,now()-interval '1 minute'+$4::int*interval '1 second')",[role,workspace,JSON.stringify({testOnly:true,testFixture:'slot-expiry-late-acceptance',testTalentIds:[talent]}),index]);
      await db.query('insert into company_internal_roles(role_id) values($1)',[role]);
    }
    if(source==='grant') await scalar("select workspace_billing_grant_slots_v1($1,$2,2,'fixture','Late acceptance')",[workspace,request]);
    else for(let i=0;i<2;i++) await scalar('select workspace_billing_sync_slot_v1($1,$2,0,$3,$4)',[workspace,`sub_${workspace}_${i}`,
      JSON.stringify({customer:`cus_${workspace}`,price:'price_fixture',status:'active',startedAt:new Date(Date.now()-86400000).toISOString(),periodEnd:new Date(Date.now()+86400000).toISOString()}),
      JSON.stringify([{invoiceId:`in_${workspace}_${i}`,startsAt:new Date(Date.now()-86400000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString()}])]);
    for(const role of roles) await db.query("update company_roles set status='active' where role_id=$1",[role]);
    for(const role of roles) assert.equal(await scalar('select role_matching_slot_type_v1($1)',[role]),'paid','grants and Stripe slots have the same matching entitlement');
    await db.query("insert into talent_opportunity_recommendation(id,talent_id,role_id,opportunity_type) values($1,$2,$3,'internal_recommendation')",[recommendation,talent,roles[1]]);
    // The recommendation precedes loss of entitlement. Real reconciliation may pause it.
    await db.query("update company_workspace_slots set ended_at=clock_timestamp(),cancel_at=clock_timestamp() where company_workspace_id=$1",[workspace]);
    const summary=await scalar('select workspace_billing_summary_v2($1)',[workspace]);
    assert.equal(summary.model,'free'); assert.equal(summary.activeRoles,2);
    const paused=roles[1];
    assert.equal(await scalar('select status from company_roles where role_id=$1',[paused]),'active','Slot expiry leaves the Role active with Free features');
    assert.equal(await scalar('select role_matching_slot_type_v1($1)',[paused]),'free');
    const accept=()=>scalar("select accept_talent_internal_role_recommendation_v2($1,$2)",[talent,recommendation]);
    let result=await accept();
    assert.equal(result.status,'accepted'); assert.equal(result.targetAccepted,true);
    assert.equal(result.companyShared,false,'consent alone does not invent a delivered introduction');
    assert.equal((await accept()).status,'no_change');
    assert.equal(await scalar('select count(*)::int from company_workspace_credit_events where company_workspace_id=$1',[workspace]),0,'candidate acceptance never debits company credits');
    assert.equal(await scalar('select feedback from talent_opportunity_recommendation where id=$1',[recommendation]),'like');

    // Exercise the real company-ready handoff after another candidate accepts late.
    const talent2=randomUUID(), rec2=randomUUID();
    await db.query("insert into talent_users(user_id,name) values($1,'Local second fixture')",[talent2]);
    await db.query("insert into talent_setting(user_id,is_onboarding_done,profile_visibility) values($1,true,'open_to_matches')",[talent2]);
    await db.query("update company_roles set information=jsonb_set(information,'{testTalentIds}',$2) where role_id=$1",[paused,JSON.stringify([talent,talent2])]);
    await db.query("insert into talent_opportunity_recommendation(id,talent_id,role_id,opportunity_type,recommended_at) values($1,$2,$3,'internal_recommendation',now()-interval '1 day')",[rec2,talent2,paused]);
    await db.query("insert into company_intro_candidates(company_workspace_id,role_id,talent_id,selection_run_id,selection_reason,role_fingerprint,talent_fingerprint) values($1,$2,$3,gen_random_uuid(),'Local fixture','r','t')",[workspace,paused,talent2]);
    result=await scalar('select accept_talent_internal_role_recommendation_v2($1,$2)',[talent2,rec2]);
    assert.equal(result.companyShared,true);
    assert.equal(await scalar('select processed_stage from talent_opportunity_recommendation where id=$1',[rec2]),'pending_connection');
    assert.equal(await scalar('select close_reason from company_intro_candidates where recommendation_id is null and talent_id=$1',[talent2]),'route_replaced');
    assert.equal(await scalar("select count(*)::int from talent_opportunity_tag where talent_id=$1 and tag='내부:연결대기'",[talent2]),1);
    // Expiry does not bypass genuine closure, privacy, or fixture isolation.
    for(const status of ['ended','deleted','draft']) {
      await db.query('update company_roles set status=$2 where role_id=$1',[paused,status]);
      assert.equal((await accept()).reason,'target_role_unavailable');
    }
    await db.query("update company_roles set status='paused',is_expired=true where role_id=$1",[paused]);
    assert.equal((await accept()).reason,'target_role_unavailable');
    await db.query("update company_roles set is_expired=false,expires_at=now()-interval '1 second' where role_id=$1",[paused]);
    assert.equal((await accept()).reason,'target_role_unavailable');
    await db.query('update company_roles set expires_at=null where role_id=$1',[paused]);
    await db.query("update talent_setting set profile_visibility='dont_share' where user_id=$1",[talent]);
    assert.equal((await accept()).reason,'profile_sharing_disabled');
    await db.query("update talent_setting set profile_visibility='open_to_matches',is_onboarding_done=false where user_id=$1",[talent]);
    assert.equal((await accept()).reason,'onboarding_required');
    await db.query('update talent_setting set is_onboarding_done=true where user_id=$1',[talent]);
    await db.query("update company_roles set information=information-'testTalentIds' where role_id=$1",[paused]);
    assert.equal((await accept()).reason,'target_role_unavailable');
    assert.equal(await scalar('select count(*)::int from talent_opportunity_fit'),0);
    console.log(`PASS ${source}: paid entitlements, expiry→Free/active, late candidate acceptance, company-ready handoff, closure/privacy guards, no credit debit`);
  }
} finally { await db.close(); }
