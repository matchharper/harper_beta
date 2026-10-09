/** Local-only PostgreSQL regression test. Schema-only capture: 2026-10-07.
 * Run with PGLITE_MODULE_PATH pointing to @electric-sql/pglite's dist/index.js.
 * No production connection. PGlite verifies SQL/RPC behavior, not multiprocess locks.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
const exec = async (sql, params) => params ? db.query(sql,params) : db.exec(sql);
const scalar = async (sql, params) => (await db.query(sql,params)).rows[0];
const talent='11111111-1111-4111-8111-111111111111';
const role='22222222-2222-4222-8222-222222222222';
const workspace='33333333-3333-4333-8333-333333333333';
const recommendation='44444444-4444-4444-8444-444444444444';
try {
 const schema=(await fs.readFile(path.join(root,'scripts/fixtures/unifiedMatchingSchema.sql'),'utf8')).replace(/(?:public\.)?vector\(\d+\)/g,'text');
 await exec(schema);
 const legacy=await fs.readFile(path.join(root,'supabase/migrations/20260928045449_company_first_score_reuse_and_recommendation_history.sql'),'utf8');
 const start=legacy.toLowerCase().indexOf('create or replace function public.update_talent_role_feedback_v1(');
 assert.ok(start>=0);
 const end=legacy.indexOf('$function$;',legacy.indexOf('AS $function$',start)+13)+11;
 await exec(legacy.slice(start,end));
 await exec(`create function public.current_talent_recommendation_id_v1(p_recommendation_id uuid) returns uuid language sql stable as $$select coalesce((select target.id from public.talent_opportunity_recommendation original join public.company_intro_candidates intro on intro.talent_id=original.talent_id and intro.role_id=original.role_id join public.talent_opportunity_recommendation target on target.id=intro.recommendation_id where original.id=p_recommendation_id and target.opportunity_type='intro_request' and coalesce(original.opportunity_type,'')<>'intro_request' and target.created_at>=original.created_at order by target.created_at desc,target.id desc limit 1),p_recommendation_id)$$;`);
 await exec('create table public.talent_role_activity(id uuid default gen_random_uuid(),recommendation_id uuid,kind text,metadata jsonb)');
 await exec('create table public.talent_opportunity_delivery(id uuid default gen_random_uuid() primary key,talent_id uuid,discovery_run_id uuid,channel text,status text,payload jsonb,sent_at timestamptz)');
 // Load the real legacy implementations wrapped by the new revision checks.
 for (const [file,name] of [
   ['20260928045449_company_first_score_reuse_and_recommendation_history.sql','accept_talent_internal_role_recommendation_v1'],
   ['20260918022746_company_intro_acceptance_handoff.sql','decide_company_intro_request_v1'],
   ['20260914123000_paused_internal_role_candidate_decisions.sql','present_talent_internal_role_recommendation_for_review_v1'],
   ['20260914123000_paused_internal_role_candidate_decisions.sql','set_talent_internal_role_recommendation_before_company_share_v1'],
 ]) {
   const source=await fs.readFile(path.join(root,'supabase/migrations',file),'utf8');
   const begin=source.toLowerCase().indexOf(`create or replace function public.${name}(`);
   const opening=/\bas\s+(\$[a-z_]*\$)/i.exec(source.slice(begin));
   assert.ok(begin>=0 && opening,`missing legacy function ${name}`);
   const stop=source.indexOf(opening[1]+';',begin+opening.index+opening[0].length);
   await exec(source.slice(begin,stop+opening[1].length+1));
 }
 const migrations=(await fs.readdir(path.join(root,'supabase/migrations'))).filter(n=>(/^202610071[23]/.test(n) && !/workspace_billing|workspace_slot_free|role_anonymous_visibility/.test(n)) || /_(role_based_priority_review|priority_review_presentation_v2|priority_review_rating_eligibility)\.sql$/.test(n)).sort();
 for(const name of migrations){await exec(await fs.readFile(path.join(root,'supabase/migrations',name),'utf8'));console.log('PASS migration',name);}
 await exec(`create trigger talent_progress_company_intro_route before insert or update of kind,role_id,talent_id on public.talent_progress for each row when(new.kind='candidate_requested_connection') execute function public.route_candidate_priority_request_v1();`);
 await exec(`insert into public.talent_users(user_id,name) values($1,'Local fixture')`,[talent]);
 await exec(`insert into public.talent_setting(user_id,is_onboarding_done,get_internal_recommendation,profile_visibility) values($1,true,true,'open_to_matches')`,[talent]);
 await exec(`insert into public.company_workspace(company_workspace_id,company_name) values($1,'Local fixture')`,[workspace]);
 await exec(`insert into public.company_roles(role_id,company_workspace_id,name,status,source_type,information) values($1,$2,'Marked fixture','active','internal',$3)`,[role,workspace,JSON.stringify({testOnly:true,testFixture:'unified-matching-db',testTalentIds:[talent]})]);
 await exec(`insert into public.company_internal_roles(role_id,is_company_first_search,is_harper_tailored_role) values($1,false,false)`,[role]);
 // Evaluate composite inputs without inserting fit rows for a marked fixture.
 const priorityEligibility=async (changes={})=>scalar(`select public.talent_internal_role_priority_review_is_recommendable_v1(
   jsonb_populate_record(null::public.talent_opportunity_fit,$1::jsonb)) as eligible`,[JSON.stringify({
     id:'55555555-5555-4555-8555-555555555555',talent_id:talent,opportunity_id:role,
     fit_contract_version:'talent_role_fit_v2',evaluated_stage:2,input_fingerprint:'priority-test-input',
     role_fit:'perfect',company_fit:'perfect',candidate_fit:'worth_considering',expires_at:'2000-01-01T00:00:00Z',...changes})]);
 assert.equal((await priorityEligibility()).eligible,true,'perfect role/company does not need a selection or unexpired fit');
 assert.equal((await priorityEligibility({role_fit:'good'})).eligible,false);
 assert.equal((await priorityEligibility({company_fit:'good'})).eligible,false);
 for(const axis of ['role_fit','candidate_fit','company_fit']) for(const value of ['bad','unfit']) {
   assert.equal((await priorityEligibility({[axis]:value})).eligible,false);
 }
 assert.equal((await priorityEligibility({evaluated_stage:1})).eligible,false);
 assert.equal((await priorityEligibility({input_fingerprint:null})).eligible,false);
 assert.equal((await priorityEligibility({human_label:'unfit'})).eligible,false);
 await exec('begin');
 await exec(`insert into public.talent_opportunity_matching_review(talent_id,opportunity_id,decision,reason,input_fingerprint)
   values($1,$2,'candidate_first','Local selection','priority-test-input')`,[talent,role]);
 assert.equal((await priorityEligibility({role_fit:'good',company_fit:'good'})).eligible,true,'expired previously selected fit remains eligible');
 assert.equal((await priorityEligibility({input_fingerprint:'different-input',role_fit:'good',company_fit:'good'})).eligible,false);
 await exec(`update public.talent_opportunity_matching_review set closed_at=now() where talent_id=$1 and opportunity_id=$2`,[talent,role]);
 assert.equal((await priorityEligibility({role_fit:'good',company_fit:'good'})).eligible,false);
 await exec('rollback');
 console.log('PASS priority-review eligibility: fixed perfect threshold, expiry ignored, prior selection, negative grades, human override');
 assert.equal((await scalar('select count(*)::int as n from public.company_first_search_runs')).n,0,'test role must never trigger automatic matching');
 await assert.rejects(()=>exec(`insert into public.talent_progress(talent_id,role_id,kind,text) values($1,$2,'candidate_requested_connection','Local request')`,[talent,role]),/internal_role_unavailable/);
 await exec(`insert into public.talent_opportunity_recommendation(id,talent_id,role_id,opportunity_type,email_acceptance_confirmation) values($1,$2,$3,'internal_role',$4)`,[recommendation,talent,role,JSON.stringify({awaiting:true})]);
 const before=await scalar('select updated_at from public.talent_opportunity_recommendation where id=$1',[recommendation]);
 const feedback=async (value,expected=null)=>scalar('select public.update_talent_role_feedback_v2($1,$2,$3,null,null,null,$4,\'test\') as result',[talent,recommendation,value,expected]);
 await feedback('keep',before.updated_at);
 let saved=await scalar('select feedback,saved_stage,feedback_at,updated_at,email_acceptance_confirmation from public.talent_opportunity_recommendation where id=$1',[recommendation]);
 assert.equal(saved.feedback,'keep');assert.equal(saved.saved_stage,'saved');assert.deepEqual(saved.email_acceptance_confirmation,{});
 assert.equal((await scalar('select count(*)::int as n from public.company_intro_candidates')).n,0,'keep must not create company sharing');
 assert.equal((await scalar("select count(*)::int as n from public.talent_progress where kind='candidate_opportunity_feedback_changed'")).n,1);
 await feedback('keep',before.updated_at);
 assert.deepEqual((await scalar('select feedback_at from public.talent_opportunity_recommendation where id=$1',[recommendation])).feedback_at,saved.feedback_at,'repeat keep preserves initial feedback time');
 await assert.rejects(()=>feedback('dislike',before.updated_at),/recommendation_changed_refresh_required/);
 await assert.rejects(()=>scalar('select public.accept_talent_internal_role_recommendation_v2($1,$2,null,null,null,\'{}\'::jsonb,$3)',[talent,recommendation,before.updated_at]),/recommendation_changed_refresh_required/);
 await assert.rejects(()=>scalar('select public.decide_company_intro_request_v2($1,$2,\'accept\',null,null,$3)',[talent,recommendation,before.updated_at]),/recommendation_changed_refresh_required/);
 console.log('PASS acceptance and company Intro reject an old displayed revision after keep');
 await feedback(null,saved.updated_at);
 assert.equal((await scalar('select feedback from public.talent_opportunity_recommendation where id=$1',[recommendation])).feedback,null);
 await feedback('dislike');
 await assert.rejects(()=>feedback('keep'),/keep_cannot_change_existing_decision/);
 console.log('PASS keep: no consent/sharing, idempotency, stale response, unsave, final-decision guard');
 await exec(`insert into public.talent_contexts(id,talent_id,ref,collection,label,content) values(1,$1,1,'brief','Location','Domestic roles, with an exception for the named role.')`,[talent]);
 assert.equal((await scalar("select count(*)::int as n from public.opportunity_discovery_run where trigger='matching_refresh'")).n,1);
 await exec(`update public.talent_contexts set content='The exception applies only to that role.' where id=1`);
 assert.equal((await scalar("select count(*)::int as n from public.opportunity_discovery_run where trigger='matching_refresh'")).n,1,'brief writes coalesce');
 await exec(`insert into public.talent_contexts(id,talent_id,ref,collection,content,importance) values(2,$1,2,'memory','Confirmed project context.',2)`,[talent]);
 assert.equal((await scalar("select count(*)::int as n from public.opportunity_discovery_run where trigger='matching_refresh'")).n,1,'memory writes do not queue matching');
 assert.equal((await scalar("select count(*)::int as n from public.talent_opportunity_fit where opportunity_id=$1",[role])).n,0,'marked fixture never receives fit');
 console.log('PASS Brief refresh: atomic work request, debounce, Memory exclusion');
 await exec("update public.opportunity_discovery_run set status='succeeded' where trigger='matching_refresh'");
 await exec("update public.talent_users set headline='Updated professional scope' where user_id=$1",[talent]);
 assert.equal((await scalar("select count(*)::int as n from public.opportunity_discovery_run where trigger='matching_refresh' and status='queued'")).n,1,'profile changes also enqueue matching');
 await exec("update public.talent_users set headline='Updated professional scope' where user_id=$1",[talent]);
 assert.equal((await scalar("select count(*)::int as n from public.opportunity_discovery_run where trigger='matching_refresh' and status='queued'")).n,1,'unchanged profile does not add work');
 console.log('PASS profile refresh: same durable queue, no duplicate work');
 // Model a historical request in this in-memory DB only. The canonical role
 // remains testOnly; no fit row or work item is created for this fixture.
 await exec('alter table public.talent_progress disable trigger talent_progress_company_intro_route');
 assert.equal((await scalar("select count(*)::int as n from pg_trigger where tgname='queue_candidate_priority_review'")).n,0,'registration never starts a separate discovery run');
 const requested=await scalar(`insert into public.talent_progress(talent_id,role_id,kind,text)
   values($1,$2,'candidate_requested_connection','Historical fixture request') returning id`,[talent,role]);
 await exec('alter table public.talent_progress enable trigger talent_progress_company_intro_route');
 await exec(`insert into public.talent_opportunity_matching_review(talent_id,opportunity_id,decision,reason,input_fingerprint,priority_request_id)
   values($1,$2,'candidate_first','Requested selection','synthetic-fingerprint',$3),
         ($1,$2,'candidate_first','Independent selection','synthetic-fingerprint',null)`,[talent,role,requested.id]);
 const withdrawn=(await scalar('select public.withdraw_candidate_priority_review_v1($1,$2) as result',[talent,role])).result;
 assert.equal(withdrawn.withdrawn,true);
 assert.equal((await scalar("select count(*)::int as n from public.talent_opportunity_matching_review where priority_request_id=$1 and close_reason='priority_request_withdrawn'",[requested.id])).n,1);
 assert.equal((await scalar('select count(*)::int as n from public.talent_opportunity_matching_review where priority_request_id is null and closed_at is null')).n,1);
 assert.equal((await scalar('select public.withdraw_candidate_priority_review_v1($1,$2) as result',[talent,role])).result.withdrawn,false);
 assert.equal((await scalar('select count(*)::int as n from public.talent_opportunity_fit where opportunity_id=$1',[role])).n,0);
 console.log('PASS withdrawal: cancels only unpublished selection from exact request, preserves independent selection, idempotent');
 for(let i=0;i<11;i++)await exec(`insert into public.talent_progress(talent_id,role_id,kind,text,metadata,open_to_talent,open_to_company,created_at) values($1,$2,'matching_clarification_sent',$3,$4,true,false,now()-($5::int*interval '1 day'))`,[talent,role,`Question ${i}: exact scope`,JSON.stringify({ref:`q${i}`,discoveryRunId:`run${i}`,coveredRoleIds:[role],sentChannel:'email'}),i]);
 const page=(await scalar('select public.read_talent_contact_history_v1($1) as result',[talent])).result;
 assert.equal(page.items.length,5);assert.ok(page.nextCursor);
 const next=(await scalar('select public.read_talent_contact_history_v1($1,5,$2) as result',[talent,page.nextCursor])).result;
 assert.equal(next.items.length,5);assert.ok(next.nextCursor);assert.notEqual(page.items[0].ref,next.items[0].ref);
 const older=(await scalar('select public.read_talent_contact_history_v1($1,5,null,\'Question 10:\') as result',[talent])).result;
 assert.equal(older.items.length,1);
 const exact=(await scalar('select public.read_talent_contact_history_v1($1,5,null,null,$2::uuid[]) as result',[talent,[older.items[0].ref]])).result;
 assert.deepEqual(exact.items[0].roleIds,[role]);
 console.log('PASS actual-contact history: bounded defaults, pagination, old-question search, exact scope');
 const beforeSent=(await scalar("select count(*)::int as n from public.talent_progress where kind='matching_clarification_sent'")).n;
 const outbox=(await scalar(`insert into public.talent_opportunity_delivery(talent_id,channel,status,payload)
   values($1,'email','failed',$2) returning id`,[talent,JSON.stringify({matchingClarifications:[{ref:'sealed-ref',roleId:role,question:'Sealed actual question',coveredRoleIds:[role],inputFingerprints:{[role]:'v1'}}]})])).id;
 assert.equal((await scalar("select count(*)::int as n from public.talent_progress where kind='matching_clarification_sent'")).n,beforeSent,'failed email is not an actual ask');
 await exec("update public.talent_opportunity_delivery set status='sent',sent_at=now() where id=$1",[outbox]);
 await exec("update public.talent_opportunity_delivery set status='sent' where id=$1",[outbox]);
 assert.equal((await scalar("select count(*)::int as n from public.talent_progress where kind='matching_clarification_sent'")).n,beforeSent+1,'sent retry records one actual ask');
 console.log('PASS email outbox: failed send does not ask; sent transition records the sealed question exactly once');
 // Only company-visible proposals may reveal recommendation delivery facts.
 const candidateDelivery=async(ws)=>db.query('select * from public.read_company_candidate_delivery_v1($1,$2,$3)',[ws,[role],[talent]]);
 assert.equal((await candidateDelivery(workspace)).rows.length,0);
 await exec(`insert into public.company_intro_candidates(company_workspace_id,role_id,talent_id,selection_run_id,selection_reason,role_fingerprint,talent_fingerprint)
   values($1,$2,$3,gen_random_uuid(),'Shareable profile introduction','role','talent')`,[workspace,role,talent]);
 let facts=(await candidateDelivery(workspace)).rows[0];
 assert.ok(facts.available_in_app_at);assert.equal(facts.email_sent_at,null);
 assert.equal('feedback' in facts,false,'private keep/decline state is never exposed');
 const deliveryRun='55555555-5555-4555-8555-555555555555';
 await exec('update public.talent_opportunity_recommendation set discovery_run_id=$1 where id=$2',[deliveryRun,recommendation]);
 const deliveryId=(await scalar(`insert into public.talent_opportunity_delivery(talent_id,discovery_run_id,channel,status,payload,sent_at)
   values($1,$2,'email','failed',$3,now()) returning id`,[talent,deliveryRun,JSON.stringify({recommendationExposures:[{recommendationId:recommendation}]})])).id;
 assert.equal((await candidateDelivery(workspace)).rows[0].email_sent_at,null,'failed send is not delivered');
 await exec("update public.talent_opportunity_delivery set status='sent' where id=$1",[deliveryId]);
 assert.ok((await candidateDelivery(workspace)).rows[0].email_sent_at);
 assert.equal((await candidateDelivery('99999999-9999-4999-8999-999999999999')).rows.length,0,'cross-workspace read is empty');
 await exec("update public.company_intro_candidates set status='closed',close_reason='privacy_withdrawn' where talent_id=$1",[talent]);
 assert.equal((await candidateDelivery(workspace)).rows.length,0,'closed private proposal grants no delivery access');
 console.log('PASS company delivery facts: visibility, actual sent evidence, no private feedback, workspace scope');
} finally {await db.close();}
