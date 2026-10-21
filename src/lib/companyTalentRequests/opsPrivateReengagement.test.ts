import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
let db: PGlite;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [workspace, role, talent, recommendation, request] = [1,2,3,4,5].map(id);
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create role harper_worker;
    create table company_roles(role_id uuid primary key, company_workspace_id uuid, source_type text, status text);
    create table talent_opportunity_recommendation(id uuid primary key, role_id uuid, talent_id uuid, opportunity_type text, feedback text, feedback_at timestamptz, saved_stage text, processed_stage text, created_at timestamptz default now(), updated_at timestamptz default now());
    create table talent_opportunity_matching_review(recommendation_id uuid,decision text,reviewed_at timestamptz default now(),closed_at timestamptz,close_reason text);
    create table talent_opportunity_tag(talent_id uuid, opportunity_id uuid, tag text, created_at timestamptz default now(), updated_at timestamptz default now());
    create table company_talent_requests(id uuid primary key, company_workspace_id uuid,role_id uuid,talent_id uuid,recommendation_id uuid,source_company_message_id bigint not null,contact_kind text,contact_purpose text,delivery_subject text,delivery_body text,request_context text,draft_revision int,expects_document boolean,intent text,workflow_status text,expires_at timestamptz,approved_at timestamptz,talent_source_message_id bigint,response_disposition text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table talent_messages(id bigint primary key,user_id uuid,role text,payload jsonb,created_at timestamptz default now());
    create table talent_progress(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,recommendation_id uuid,user_id text,kind text,text text,metadata jsonb,open_to_company boolean,open_to_talent boolean);
    create table contact_queue(id uuid primary key default gen_random_uuid(),company_talent_request_id uuid,recommendation_id uuid,company_talent_relay_id uuid,type text,status text,sent_at timestamptz);
    create table company_talent_relays(id uuid primary key default gen_random_uuid(),recommendation_id uuid,talent_id uuid,source_talent_message_id bigint,company_talent_request_id uuid);
    create table company_talent_followups(id uuid primary key default gen_random_uuid(),source_kind text,source_id uuid);
    create function accept_talent_internal_role_recommendation_v1(p_talent_id uuid,p_recommendation_id uuid,p_source_role_id uuid,p_feedback_reason text,p_email_acceptance_confirmation jsonb,p_context jsonb)
      returns jsonb language plpgsql as $$
begin
  update talent_opportunity_recommendation set saved_stage='connected' where id=p_recommendation_id;
  return '{"status":"accepted"}'::jsonb;
end $$;
    create function handoff_ready_company_candidate_on_acceptance_v1() returns trigger language plpgsql as $$
begin
  return new;
end $$;
    create function company_talent_pair_is_contactable_v1(uuid,uuid,uuid,uuid) returns boolean language sql as $$ select exists(select 1 from company_roles where role_id=$2 and status='active') $$;
  `);
  await db.exec(await readFile(new URL("../../../supabase/migrations/20261020130031_ops_private_reengagement.sql", import.meta.url), "utf8"));
});
after(async () => db.close());
beforeEach(async () => {
  await db.exec(`truncate company_roles,talent_opportunity_recommendation,talent_opportunity_matching_review,talent_opportunity_tag,company_talent_requests,talent_messages,talent_progress,contact_queue,company_talent_relays,company_talent_followups;
    insert into company_roles values('${role}','${workspace}','internal','active');
    insert into talent_opportunity_recommendation(id,role_id,talent_id,opportunity_type,feedback,saved_stage) values('${recommendation}','${role}','${talent}','internal_recommendation','like','archived');
    insert into talent_opportunity_tag values('${talent}','${role}','내부:아카이브',now()-interval '1 day',now()-interval '1 day');
  `);
});
async function prepare() {
  return db.query(`select prepare_ops_candidate_contact_v1($1,$2,$3,'ops@example.test','채용 재개 안내','현재도 관심 있으신가요?') as result`, [request,role,talent]);
}
async function deliver() {
  await prepare();
  await db.exec(`insert into contact_queue(company_talent_request_id,recommendation_id,type,status,sent_at) values('${request}','${recommendation}','company_request_candidate_delivery','sent',now());
    insert into talent_messages values(1,'${talent}','user',null,now()),(2,'${talent}','user',null,now());`);
}
async function reply(resume: boolean, message=1) {
  return db.query<{result: any}>(`select record_ops_candidate_reply_v1($1,$2,$3,'후보자 답변',$4) as result`,[request,talent,message,resume]);
}
test("clear consent restores accepted without a company relay, delivery, or followup; retry is idempotent", async () => {
  await deliver();
  assert.equal((await reply(true)).rows[0].result.restored,true);
  assert.equal((await reply(true)).rows[0].result.idempotent,true);
  assert.deepEqual((await db.query(`select saved_stage,processed_stage from talent_opportunity_recommendation`)).rows,[{saved_stage:'connected',processed_stage:'accepted'}]);
  assert.deepEqual((await db.query(`select tag from talent_opportunity_tag`)).rows,[{tag:'내부:수락'}]);
  assert.equal((await db.query(`select 1 from company_talent_relays`)).rows.length,0);
  assert.equal((await db.query(`select 1 from contact_queue where type like '%company_delivery'`)).rows.length,0);
  assert.equal((await db.query(`select 1 from talent_progress where open_to_company or open_to_talent`)).rows.length,0);
  await db.exec(`insert into company_talent_followups(source_kind,source_id) values('contact','${request}')`);
  assert.equal((await db.query(`select 1 from company_talent_followups`)).rows.length,0);
});
test("question is recorded without resumption, then a later affirmative reply can resume",async()=>{
  await deliver(); assert.equal((await reply(false)).rows[0].result.restored,false);
  assert.equal((await db.query<{tag:string}>(`select tag from talent_opportunity_tag`)).rows[0].tag,'내부:아카이브');
  assert.equal((await reply(true,2)).rows[0].result.restored,true);
});
test("only the private reply's source and request are blocked; later ordinary messages still deliver",async()=>{
  await deliver(); await reply(true);
  await assert.rejects(db.exec(`insert into company_talent_relays(recommendation_id,talent_id,source_talent_message_id) values('${recommendation}','${talent}',1)`),/ops_private_contact_requires_internal_reply/);
  await assert.rejects(db.exec(`insert into contact_queue(company_talent_request_id,type) values('${request}','company_request_company_delivery')`),/ops_private_contact_company_delivery_forbidden/);
  await db.exec(`insert into company_talent_relays(recommendation_id,talent_id,source_talent_message_id) values('${recommendation}','${talent}',2);
    insert into contact_queue(recommendation_id,type) values('${recommendation}','company_contact_company_delivery')`);
  assert.equal((await db.query(`select 1 from company_talent_relays`)).rows.length,1);
});
test("a later affirmative reply is recorded once without restoring again or overwriting a later stage",async()=>{
  await deliver(); await reply(true);
  assert.equal((await reply(true,2)).rows[0].result.alreadyRestored,true);
  assert.equal((await reply(true,2)).rows[0].result.idempotent,true);
  assert.equal((await db.query(`select 1 from talent_opportunity_tag where tag='내부:수락'`)).rows.length,1);
  await db.exec(`update talent_opportunity_tag set tag='내부:연결됨'; insert into talent_messages values(3,'${talent}','user',null,now());`);
  await reply(true,3);
  assert.equal((await db.query<{tag:string}>(`select tag from talent_opportunity_tag`)).rows[0].tag,'내부:연결됨');
});
test("normal acceptance executor cannot bypass the private decision before or after restoration",async()=>{
  await deliver();
  const accept=()=>db.query(`select accept_talent_internal_role_recommendation_v1($1,$2,null,null,null,'{}')`,[talent,recommendation]);
  await assert.rejects(accept(),/ops_contact_reply_required/);
  await reply(true);
  await assert.rejects(accept(),/ops_contact_reply_required/);
  assert.equal((await db.query<{saved_stage:string}>(`select saved_stage from talent_opportunity_recommendation`)).rows[0].saved_stage,'connected');
  await db.exec(`update company_talent_requests set workflow_status='cancelled'`);
  await accept();
  assert.equal((await db.query<{saved_stage:string}>(`select saved_stage from talent_opportunity_recommendation`)).rows[0].saved_stage,'connected');
});
test("binding an explicit reply prevents a wrong ordinary connection from sharing it",async()=>{
  await deliver();
  await db.query(`select bind_ops_candidate_reply_v1($1,$2,1)`,[request,talent]);
  await assert.rejects(db.exec(`insert into company_talent_relays(recommendation_id,talent_id,source_talent_message_id) values('${id(99)}','${talent}',1)`),/ops_private_contact_requires_internal_reply/);
});
test("ordinary contacts keep their existing delivery and followup path",async()=>{
  await db.exec(`insert into company_talent_relays(recommendation_id) values('${recommendation}'); insert into contact_queue(recommendation_id,type) values('${recommendation}','company_contact_company_delivery'); insert into company_talent_followups(source_kind,source_id) values('contact','${id(9)}')`);
  assert.equal((await db.query(`select 1 from company_talent_relays`)).rows.length,1);
  assert.equal((await db.query(`select 1 from company_talent_followups`)).rows.length,1);
});
test("unsent outreach, non-user evidence, closed role and later stage changes cannot restore",async()=>{
  await prepare(); await db.exec(`insert into talent_messages values(1,'${talent}','user',null,now())`);
  await assert.rejects(reply(true),/ops_contact_not_delivered/);
  await db.exec(`insert into contact_queue(company_talent_request_id,type,status,sent_at) values('${request}','company_request_candidate_delivery','sent',now()); update talent_messages set role='assistant'`);
  await assert.rejects(reply(true),/candidate_message_evidence_not_found/);
  await db.exec(`update talent_messages set role='user'; update company_roles set status='closed'`);
  await assert.rejects(reply(true),/candidate_not_contactable/);
  await db.exec(`update company_roles set status='active'; update talent_opportunity_tag set updated_at=now()+interval '1 second'`);
  await assert.rejects(reply(true),/candidate_stage_changed/);
});
test("repeat preparation reuses one request and private progress stays invisible",async()=>{
  await prepare(); await prepare();
  assert.equal((await db.query(`select 1 from company_talent_requests`)).rows.length,1);
  await db.exec(`insert into talent_progress(metadata,open_to_company,open_to_talent) values('{"requestId":"${request}"}',true,true)`);
  assert.equal((await db.query(`select 1 from talent_progress where open_to_company or open_to_talent`)).rows.length,0);
});
