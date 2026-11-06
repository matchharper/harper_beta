import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migration = readFileSync("supabase/migrations/20261106084304_career_company_intro_agent.sql","utf8");
const id = (n:number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const talent=id(1),company=id(2),member=id(3),role=id(4),intro=id(5),conversation=id(6);
const source = (name:string) => readFileSync(`supabase/migrations/${name}`,"utf8");
function functionSql(sql:string,name:string) {
  const start=sql.search(new RegExp(`create(?: or replace)? function public\\.${name}\\(`,"i"));
  if(start<0) throw Error(name);
  return sql.slice(start,sql.indexOf("$$;",start)+3);
}
async function database() {
 const db=new PGlite();
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create table talent_users(user_id uuid primary key,name text,deleted_at timestamptz);
 create table talent_setting(user_id uuid primary key,is_onboarding_done boolean,profile_visibility text,get_internal_recommendation boolean,blocked_companies text[]);
 create table company_workspace(company_workspace_id uuid primary key,company_name text,published_name text);
 create table company_user_workspace(company_user_id uuid,company_workspace_id uuid);
 create table company_roles(role_id uuid primary key,company_workspace_id uuid,name text,source_type text,status text,is_expired boolean,expires_at timestamptz,information jsonb);
 create table company_internal_roles(role_id uuid primary key);
 create table ops_matching_role_stages(id uuid primary key,role_id uuid);
 create table talent_conversations(id uuid primary key,user_id uuid,created_at timestamptz default now(),updated_at timestamptz default now());
 create table talent_agent_runtime(conversation_id uuid primary key,user_id uuid,state jsonb);
 create table talent_messages(id bigserial primary key,user_id uuid,conversation_id uuid,role text,message_type text,content text,payload jsonb);
 create table opportunity_discovery_run(id uuid primary key,talent_id uuid,conversation_id uuid,run_mode text,status text,trigger text,target_recommendation_count int,settings_snapshot jsonb,trigger_payload jsonb,dedupe_key text,coverage jsonb default '{}',completed_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
 create table talent_opportunity_recommendation(id uuid primary key,discovery_run_id uuid,evidence jsonb,fit_reasons jsonb,kind text,opportunity_type text,preference_fit jsonb,rank int,role_id uuid,talent_id uuid,tradeoffs jsonb,fit_summary text,feedback text,saved_stage text);
 create table talent_opportunity_memberships(talent_id uuid,recommendation_id uuid unique,role_id uuid,explanation text,rank int,archived_at timestamptz);
 create table talent_opportunity_tag(id uuid primary key,talent_id uuid,opportunity_id uuid,tag text,updated_at timestamptz,created_at timestamptz);
 create table company_intro_candidates(id uuid primary key,company_workspace_id uuid,talent_id uuid,role_id uuid,status text,revision bigint default 1,close_reason text,talent_decision_at timestamptz,requested_at timestamptz,requested_by_company_user_id uuid,company_appeal text,selection_reason text,next_stage_id uuid,intro_recipient_emails text[],delivery_run_id uuid unique,recommendation_id uuid,candidate_sent_at timestamptz,followups_initialized_at timestamptz,updated_at timestamptz);
 create table talent_opportunity_delivery(id uuid primary key default gen_random_uuid(),talent_id uuid,discovery_run_id uuid,channel text,status text,sent_at timestamptz,payload jsonb,updated_at timestamptz,error_message text);
 create unique index career_agent_email_per_run on talent_opportunity_delivery(discovery_run_id,channel) where payload->>'runContract'='career_agent_v1';
 create table meeting_schedules(id uuid,talent_id uuid,version bigint);
 create table company_talent_requests(id uuid);
 create table company_messages(id bigint);
 create table contact_queue(id uuid);
 create table career_email_messages(id uuid);
 create table meeting_schedule_rounds(id uuid);
 create table opportunity_scheduler_state(talent_id uuid primary key,next_check_at timestamptz);
 create table company_talent_followups(id uuid primary key default gen_random_uuid(),company_workspace_id uuid,role_id uuid,talent_id uuid,recommendation_id uuid,source_kind text,source_id uuid,delay_days int,due_at timestamptz,created_by uuid,idempotency_key text unique,status text default 'pending');
 create function record_company_followup_event_v1(uuid,text,jsonb default '{}') returns void language sql as $$select$$;
 `);
 const isolation=source("20260918015954_relax_company_intro_constraints_and_fixture_guards.sql");
 await db.exec(functionSql(isolation,"company_intro_role_allows_talent_v1"));
 const memberships=source("20261029183004_career_matching_workspaces.sql");
 await db.exec(functionSql(memberships,"ensure_career_opportunity_membership"));
 await db.exec("create trigger career_opportunity_membership_after_insert after insert on talent_opportunity_recommendation for each row execute function ensure_career_opportunity_membership()");
 const followups=source("20261014180746_company_talent_followup_schedules.sql");
 for(const name of ["company_followup_source_v1","initialize_company_followups_v1","company_followup_first_delivery_v1"]) await db.exec(functionSql(followups,name));
 // The dates under test use the actual source reader/initializer; refresh's other
 // contact/meeting branches are outside this synthetic Intro fixture.
 await db.exec("create function refresh_company_followups_v1(text,uuid) returns void language sql as $$select$$; create trigger company_followup_intro_delivery after insert or update of status,sent_at on talent_opportunity_delivery for each row execute function company_followup_first_delivery_v1()");
 const legacy=source("20261013111553_preserve_presented_candidates_and_intro_decisions.sql");
 const start=legacy.indexOf("CREATE OR REPLACE FUNCTION public.request_company_intro_without_billing_v1(");
 const end=legacy.indexOf("$function$",legacy.indexOf("$function$",start)+10);
 await db.exec(legacy.slice(start,end+10)+";");
 // Billing is covered by its own contract; run the real decision wrapper here.
 await db.exec(`create function request_company_intro_v1(uuid,uuid,uuid,uuid,text[],text) returns jsonb language sql as $$select public.request_company_intro_without_billing_v1($1,$2,$3,$4,$5,$6)$$;
 create function record_company_decision_v1(uuid,uuid,text,uuid,text,text,uuid,text,uuid,text,text[],jsonb,bigint) returns bigint language sql as $$select 1::bigint$$;`);
 await db.exec(functionSql(source("20261105020000_company_decision_events.sql"),"request_company_intro_v2"));
 await db.exec(migration);
 await db.query("insert into talent_users values($1,'Synthetic candidate',null)",[talent]);
 await db.query("insert into talent_setting values($1,true,'open_to_matches',true,'{}')",[talent]);
 await db.query("insert into company_workspace values($1,'Cedar','Cedar')",[company]);
 await db.query("insert into company_user_workspace values($1,$2)",[member,company]);
 await db.query("insert into company_roles values($1,$2,'Platform Engineer','internal','active',false,null,'{}')",[role,company]);
 await db.query("insert into company_internal_roles values($1)",[role]);
 await db.query("insert into company_intro_candidates(id,company_workspace_id,talent_id,role_id,status) values($1,$2,$3,$4,'ready')",[intro,company,talent,role]);
 await db.query("insert into talent_conversations(id,user_id) values($1,$2)",[conversation,talent]);
 return db;
}
async function request(db:PGlite) {
 return (await db.query<any>("select request_company_intro_for_career_v1($1,$2,$3,null,array['member@example.invalid'],'플랫폼 경험이 좋아 만나고 싶습니다.','web',null) result",[intro,company,member])).rows[0].result;
}
async function current(db:PGlite,run:string) {return (await db.query<any>("select career_company_intro_is_current($1,$2) ok",[run,talent])).rows[0].ok;}

test("Request Intro atomically saves a visible recommendation and one immediate original-agent invocation",async()=>{
 const db=await database();try {
 const result=await request(db);const duplicate=await request(db);
 assert.equal(duplicate.status,'already_requested');assert.equal(duplicate.deliveryRunId,result.deliveryRunId);
 const r=(await db.query<any>("select * from opportunity_discovery_run")).rows[0];
 assert.equal(r.status,'queued');assert.equal(r.run_mode,'immediate');assert.equal(r.trigger_payload.runContract,'career_agent_v1');
 assert.equal(r.trigger_payload.opportunityAgentVariant,undefined);assert.equal(r.trigger_payload.manualInternalRecommendation,undefined);
 assert.equal((await db.query("select * from talent_opportunity_recommendation")).rows.length,1);
 assert.equal((await db.query("select * from talent_opportunity_memberships where archived_at is null")).rows.length,1);
 assert.equal((await db.query<any>("select evidence from talent_opportunity_recommendation")).rows[0].evidence.preFinalDelivery,undefined);
 assert.equal((await db.query("select * from talent_opportunity_delivery")).rows.length,0);
 assert.equal(await current(db,r.id),true);
 assert.equal((await db.query<any>("select career_company_intro_is_current($1,$2) ok",[r.id,id(99)])).rows[0].ok,false);
 await db.query("update talent_setting set profile_visibility='dont_share'");assert.equal(await current(db,r.id),false);
 await db.query("update talent_setting set profile_visibility='open_to_matches',blocked_companies=array['Cedar']");assert.equal(await current(db,r.id),false);
 await db.query("update talent_setting set blocked_companies='{}';");
 await db.query("update company_roles set information=$1",[{testOnly:true,testFixture:"intro-agent-test",testTalentIds:[]}]);assert.equal(await current(db,r.id),false);
 await db.query("update company_roles set information=$1",[{testOnly:true,testFixture:"intro-agent-test",testTalentIds:[talent]}]);assert.equal(await current(db,r.id),true);
 }finally{await db.close();}
});

test("original-agent chat records actual contact and existing follow-up dates once; stale requests cannot deliver",async()=>{
 const db=await database();try {
 const result=await request(db),run=result.deliveryRunId;
 await db.query("update opportunity_discovery_run set status='handed_off'");
 const chat=()=>db.query("insert into talent_messages(user_id,conversation_id,role,message_type,content,payload) values($1,$2,'assistant','chat','Cedar에서 만나고 싶다는 요청이 왔어요.',$3)",[talent,conversation,{backgroundRunId:run}]);
 await chat();
 const delivered=(await db.query<any>("select * from talent_opportunity_delivery")).rows[0];
 assert.equal(delivered.channel,'chat');assert.equal(delivered.status,'sent');assert.ok(delivered.payload.auditCompletedAt);
 assert.deepEqual((await db.query<any>("select candidate_sent_at from company_intro_candidates")).rows[0].candidate_sent_at,delivered.sent_at);
 assert.deepEqual((await db.query<any>("select delay_days from company_talent_followups order by delay_days")).rows.map(r=>r.delay_days),[3,9,18]);
 const original=(await db.query<any>("select company_followup_source_v1('intro',$1) source",[intro])).rows[0].source;
 assert.equal(original.originalBody,'Cedar에서 만나고 싶다는 요청이 왔어요.');
 await db.query("insert into talent_opportunity_delivery(talent_id,discovery_run_id,channel,status,payload) values($1,$2,'email','queued','{\"runContract\":\"career_agent_v1\"}')",[talent,run]);
 await db.query("update opportunity_discovery_run set trigger_payload=trigger_payload||'{\"agentInvocation\":{\"replyId\":\"reply\"}}'");
 await db.query("insert into talent_agent_runtime values($1,$2,$3)",[conversation,talent,{activeReply:{replyId:'reply',claimId:'claim',expiresAt:new Date(Date.now()+60000).toISOString()}}]);
 await db.query("select finish_career_background_reply($1,$2,'reply','claim',$3)",[talent,conversation,run]);
 assert.equal((await db.query<any>("select coverage from opportunity_discovery_run")).rows[0].coverage.agentOutcome,'delivery_pending');
 await db.query("update company_intro_candidates set status='connected',revision=revision+1");
 await assert.rejects(chat,/Company introduction unavailable/);
 assert.equal((await db.query("select * from talent_messages")).rows.length,1);
 }finally{await db.close();}
});

test("email admission stops a withdrawn Intro and confirmed email receipts preserve contact time and follow-up body",async()=>{
 const db=await database();try {
 const result=await request(db),run=result.deliveryRunId;
 await db.query("update opportunity_discovery_run set status='handed_off'");
 const payload={runContract:'career_agent_v1',claimId:'sender',claimExpiresAt:new Date(Date.now()+60000).toISOString(),conversationId:conversation,sourceMessageCursor:0,emailPayload:{subject:'Cedar의 만남 제안',text:'후보자에게 전하는 원문'},bodyMarkdown:'후보자에게 전하는 원문'};
 const mail=(await db.query<any>("insert into talent_opportunity_delivery(talent_id,discovery_run_id,channel,status,payload) values($1,$2,'email','sending',$3) returning id",[talent,run,payload])).rows[0].id;
 await db.query("update company_intro_candidates set status='closed'");
 assert.equal((await db.query<any>("select begin_career_agent_email_attempt($1,'sender') ok",[mail])).rows[0].ok,false);
 assert.equal((await db.query<any>("select candidate_sent_at from company_intro_candidates")).rows[0].candidate_sent_at,null);
 await db.query("update company_intro_candidates set status='awaiting_talent'");
 await db.query("update talent_opportunity_delivery set status='sending' where id=$1",[mail]);
 assert.equal((await db.query<any>("select begin_career_agent_email_attempt($1,'sender') ok",[mail])).rows[0].ok,true);
 await db.query("update talent_opportunity_delivery set status='sent',sent_at=now() where id=$1",[mail]);
 const sent=(await db.query<any>("select candidate_sent_at from company_intro_candidates")).rows[0].candidate_sent_at;
 await db.query("update talent_opportunity_delivery set status='sent' where id=$1",[mail]);
 assert.deepEqual((await db.query<any>("select candidate_sent_at from company_intro_candidates")).rows[0].candidate_sent_at,sent);
 assert.equal((await db.query("select * from company_talent_followups")).rows.length,3);
 assert.equal((await db.query<any>("select company_followup_source_v1('intro',$1) source",[intro])).rows[0].source.originalBody,'후보자에게 전하는 원문');
 }finally{await db.close();}
});

 test("existing deployed callers keep legacy delivery and retries do not re-route them",async()=>{
 const db=await database();try {
 const legacy=(await db.query<any>("select request_company_intro_without_billing_v1($1,$2,$3,null,array['member@example.invalid'],'회사 관심') result",[intro,company,member])).rows[0].result;
 const before=(await db.query<any>("select trigger_payload from opportunity_discovery_run")).rows[0].trigger_payload;
 assert.notEqual(before.runContract,'career_agent_v1');
 const retry=await request(db);
 assert.equal(retry.status,'already_requested');assert.equal(retry.deliveryRunId,legacy.deliveryRunId);
 assert.deepEqual((await db.query<any>("select trigger_payload from opportunity_discovery_run")).rows[0].trigger_payload,before);
 }finally{await db.close();}
 });
