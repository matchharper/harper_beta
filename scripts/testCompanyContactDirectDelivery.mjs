// Isolated PostgreSQL tests of the real migration. No credentials or network.
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
    create table company_workspace(company_workspace_id uuid primary key,company_name text);
    create table company_roles (role_id uuid primary key,company_workspace_id uuid,status text default 'active',is_expired boolean default false,information jsonb,name text);
    create table talent_users (user_id uuid primary key,email text,deleted_at timestamptz);
    create table talent_opportunity_recommendation (id uuid primary key,role_id uuid,talent_id uuid,saved_stage text,feedback text,updated_at timestamptz default now());
    create table talent_opportunity_tag (id bigserial primary key,opportunity_id uuid,talent_id uuid,tag text,updated_at timestamptz default now(),created_at timestamptz default now());
    create table company_intro_candidates (company_workspace_id uuid,role_id uuid,talent_id uuid,recommendation_id uuid,status text,candidate_sent_at timestamptz);
    create table company_messages (id bigserial primary key,company_workspace_id uuid,role text);
    create table talent_messages(id bigint primary key,user_id uuid,role text,message_type text);
    create table talent_documents(id uuid primary key,talent_id uuid,kind text,is_public boolean,is_deleted boolean);
    create table talent_progress(recommendation_id uuid,talent_id uuid,role_id uuid,kind text,metadata jsonb);
    create table company_talent_relays(id uuid primary key default gen_random_uuid(),company_talent_request_id uuid,recommendation_id uuid,source_talent_message_id bigint,relay_content text,document_id uuid,created_at timestamptz default now());
    create table company_talent_requests (id uuid primary key,company_workspace_id uuid,role_id uuid,talent_id uuid,recommendation_id uuid,source_company_message_id bigint,contact_kind text,delivery_subject text,delivery_body text,request_context text,draft_revision integer,expects_document boolean,intent text,workflow_status text,approved_at timestamptz,expires_at timestamptz,in_reply_to_company_talent_relay_id uuid,created_at timestamptz default now());
    create table contact_queue (id uuid primary key default gen_random_uuid(),user_id uuid,type text,status text,payload jsonb,scheduled_at timestamptz,role_id uuid,recommendation_id uuid,company_talent_request_id uuid,created_at timestamptz default now());
    alter table company_talent_requests add column talent_source_message_id bigint,add column document_id uuid,add column updated_at timestamptz default now();
    alter table contact_queue add column company_talent_relay_id uuid,add column sent_at timestamptz;
    create unique index company_talent_requests_workspace_role_talent_open_uidx on company_talent_requests(company_workspace_id,role_id,talent_id) where workflow_status in ('draft','queued','failed') and talent_source_message_id is null and document_id is null and in_reply_to_company_talent_relay_id is null;
    create unique index company_talent_requests_source_message_target_uidx on company_talent_requests(source_company_message_id,role_id,talent_id);
    create unique index contact_queue_company_request_type_uidx on contact_queue(company_talent_request_id,type) where company_talent_request_id is not null;
    create unique index relay_delivery_idx on contact_queue(company_talent_relay_id,type) where company_talent_relay_id is not null and type='company_contact_company_delivery';
  `);
  await db.exec(readFileSync(new URL("../supabase/migrations/20260924151548_company_contact_direct_delivery.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20260927040514_remove_cross_request_candidate_contact_blocking.sql", import.meta.url), "utf8"));
  assert.equal(
    await scalar("select count(*)::int from pg_indexes where schemaname='public' and indexname='company_talent_requests_workspace_role_talent_open_uidx'"),
    0,
    "the same candidate and Role no longer reserve a single unresolved-contact slot"
  );
  const workspace = randomUUID(), role = randomUUID(), talent = randomUUID(), rec = randomUUID();
  await db.query("insert into company_roles(role_id,company_workspace_id,information) values ($1,$2,$3)", [role, workspace, JSON.stringify({ testOnly: true, testFixture: "contact-direct-v1", testTalentIds: [talent] })]);
  await db.query("insert into talent_users values ($1,'synthetic@example.invalid',null)", [talent]);
  await db.query("insert into talent_opportunity_recommendation(id,role_id,talent_id) values ($1,$2,$3)", [rec,role,talent]);
  await db.query("insert into company_workspace values ($1,'Synthetic Labs')", [workspace]);
  await db.exec("update company_roles set name='Backend'");
  await db.query("insert into company_intro_candidates values ($1,$2,$3,$4,'ready',null)", [workspace,role,talent,rec]);
  const eligible = () => scalar("select company_talent_pair_is_contactable_v1($1,$2,$3,$4)", [workspace,role,talent,rec]);
  assert.equal(await eligible(), false, "uncontacted profile cannot receive an ordinary message");
  await db.exec("update company_intro_candidates set status='awaiting_talent'");
  assert.equal(await eligible(), false, "prepared, not delivered, proposal is not contactable");
  await db.exec("update company_intro_candidates set candidate_sent_at=now()-interval '4 days'");
  assert.equal(await eligible(), true, "delivered proposal accepts generic company messages");
  const oldMessage = await scalar("insert into company_messages(company_workspace_id,role) values ($1,'user') returning id", [workspace]);
  const oldDraft = randomUUID();
  await db.query(`insert into company_talent_requests (
    id,company_workspace_id,role_id,talent_id,recommendation_id,source_company_message_id,
    contact_kind,delivery_subject,delivery_body,request_context,draft_revision,expects_document,
    intent,workflow_status,expires_at
  ) values ($1,$2,$3,$4,$5,$6,'contact','9월의 다른 초안','DevRel 관련 오래된 내용',
    'AI Research Engineer 역할에 관한 예전 연락',1,false,'ordinary','draft',now()+interval '1 day')`,
  [oldDraft,workspace,role,talent,rec,oldMessage]);
  const message = await scalar("insert into company_messages(company_workspace_id,role) values ($1,'user') returning id", [workspace]);
  const request = randomUUID();
  const args = [request,workspace,role,talent,rec,message,"안녕하세요","새 기회를 이야기해봐도 괜찮을까요?","후보자에게 의향을 물어보기"];
  const send = (input = args) => scalar("select send_company_talent_contact_v1($1,$2,$3,$4,$5,$6,$7,$8,$9)", input);
  const first = await send();
  assert.equal(first.status, "queued");
  assert.equal(first.idempotent, false);
  assert.equal(await scalar("select count(*)::int from contact_queue"), 1);
  assert.equal(await scalar("select count(*)::int from company_talent_requests"), 2);
  assert.equal(await scalar("select workflow_status from company_talent_requests where id=$1", [oldDraft]), "draft", "the unrelated old draft remains unchanged");
  assert.equal(await scalar("select delivery_body from company_talent_requests where id=$1", [request]), args[7], "the new request keeps the newly requested content");
  assert.equal(await scalar("select scheduled_at <= now() from contact_queue"), true);
  assert.equal(await scalar("select company_talent_request_target_is_active_v1($1)", [request]), true);
  assert.equal(await scalar("select status from company_intro_candidates"), "awaiting_talent", "contact does not manufacture acceptance");
  assert.equal(await scalar("select saved_stage from talent_opportunity_recommendation"), null);
  const retry = await send([randomUUID(), ...args.slice(1,7), "retry must not rewrite", args[8]]);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.requestId, first.requestId);
  assert.equal(await scalar("select count(*)::int from contact_queue"), 1);
  assert.equal(await scalar("select delivery_body from company_talent_requests where id=$1", [request]), args[7]);
  const nextMessage = await scalar("insert into company_messages(company_workspace_id,role) values ($1,'user') returning id", [workspace]);
  assert.deepEqual(await scalar("select read_company_talent_connections_v1($1)", [talent]), [], "queued is not delivered correspondence");
  await db.query("insert into talent_messages values (901,$1,'user','text')", [talent]);
  await assert.rejects(scalar("select create_company_talent_relay_v2($1,$2,901,'확인해볼게요')", [rec,talent]), /connection_not_found/);
  await db.query("update company_talent_requests set workflow_status='awaiting_talent' where id=$1", [request]);
  await db.query("update contact_queue set status='sent',sent_at=now() where company_talent_request_id=$1", [request]);
  assert.equal((await scalar("select read_company_talent_connections_v1($1)", [talent])).length, 1);
  await assert.rejects(scalar("select create_company_talent_relay_v2($1,$2,999,'가짜 원문')", [rec,talent]), /message_evidence_not_found/);
  const relayed = await scalar("select create_company_talent_relay_v2($1,$2,901,'검토하고 답할게요',null,$3)", [rec,talent,request]);
  assert.equal(relayed.status, "queued", "candidate reply uses existing company delivery");
  assert.equal(await scalar("select feedback from talent_opportunity_recommendation"), null, "reply does not accept the intro");
  assert.equal((await scalar("select create_company_talent_relay_v2($1,$2,901,'검토하고 답할게요',null,$3)", [rec,talent,request])).idempotent, true);
  const document = randomUUID();
  await db.query("insert into talent_messages values (902,$1,'user','resume_upload_note')", [talent]);
  await db.query("insert into talent_documents values ($1,$2,'resume',false,false)", [document,talent]);
  const relayDocument = () => scalar("select create_company_talent_relay_v2($1,$2,902,'이 자료를 회사에 전해주세요',$3,$4)", [rec,talent,document,request]);
  await assert.rejects(relayDocument(), /document_not_found/, "private resume is not relayable");
  await db.exec("update talent_documents set is_public=true,is_deleted=true");
  await assert.rejects(relayDocument(), /document_not_found/, "deleted resume is not relayable");
  await db.query("update talent_documents set is_deleted=false,talent_id=$1", [randomUUID()]);
  await assert.rejects(relayDocument(), /document_not_found/, "another talent's resume is not relayable");
  await db.query("update talent_documents set talent_id=$1", [talent]);
  assert.equal((await relayDocument()).idempotent, false);
  assert.equal((await relayDocument()).idempotent, true);
  assert.equal(await scalar("select feedback from talent_opportunity_recommendation"), null, "document sharing does not accept an intro");
  const next = await send([randomUUID(),workspace,role,talent,rec,nextMessage,"자료 요청","이력서 공유 부탁드려요.","이력서 요청"]);
  assert.equal(next.idempotent, false, "new authorized message does not need a scenario-specific action");
  assert.equal(await scalar("select count(*)::int from contact_queue where type='company_request_candidate_delivery'"), 2);
  assert.equal(await scalar("select workflow_status from company_talent_requests where id=$1", [oldDraft]), "draft", "later independent sends do not consume the old draft");
  await db.exec("update company_intro_candidates set status='closed'");
  assert.equal(await eligible(), false, "privacy withdrawal/closed proposal blocks dispatch");
  assert.equal(await scalar("select company_talent_request_target_is_active_v1($1)", [next.requestId]), false);
  assert.deepEqual(await scalar("select read_company_talent_connections_v1($1)", [talent]), []);
  await db.exec("update company_intro_candidates set status='awaiting_talent'; update company_roles set status='paused'");
  assert.equal(await eligible(), true, "paused hiring does not stop existing correspondence");
  await db.exec("update company_roles set status='ended'");
  assert.equal(await eligible(), false);
  await db.exec("update company_roles set status='active'; update talent_users set deleted_at=now()");
  assert.equal(await eligible(), false);
  await db.exec("update talent_users set deleted_at=null,email=null");
  assert.equal(await eligible(), false);
  await db.exec("update talent_users set email='synthetic@example.invalid'; update company_roles set information=information-'testTalentIds'");
  assert.equal(await eligible(), false, "testOnly requires explicit candidate allowlist");
  assert.equal(await scalar("select company_talent_pair_is_contactable_v1($1,$2,$3,$4)", [randomUUID(),role,talent,rec]), false);
  await assert.rejects(send([randomUUID(),randomUUID(),role,talent,rec,nextMessage,...args.slice(6)]), /source_not_found/);
  for (const dbRole of ["anon", "authenticated"]) {
    for (const signature of ["send_company_talent_contact_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text)", "create_company_talent_relay_v2(uuid,uuid,bigint,text,uuid,uuid)", "company_talent_pair_is_contactable_v1(uuid,uuid,uuid,uuid)"]) {
      assert.equal(await scalar("select has_function_privilege($1,$2,'execute')", [dbRole, signature]), false);
    }
  }
  await db.query("update company_roles set information=$1", [JSON.stringify({ testOnly:true,testFixture:"contact-direct-v1",testTalentIds:[talent] })]);
  await db.exec("delete from company_intro_candidates");
  await db.query("insert into talent_opportunity_tag(opportunity_id,talent_id,tag) values ($1,$2,'내부:연결대기')", [role,talent]);
  assert.equal(await eligible(), true, "normal shared candidate remains contactable");
  await db.exec("update talent_opportunity_tag set tag='내부:거절'");
  assert.equal(await eligible(), false, "candidate-side rejection is not contact permission");
  await db.exec("update talent_opportunity_recommendation set feedback='like',saved_stage='closed'");
  assert.equal(await eligible(), false, "latest talent rejection still blocks a previously delivered relationship");
  await db.exec("delete from talent_opportunity_tag");
  assert.equal(await eligible(), true, "actual sent contact preserves the existing relationship");
  await db.exec("update contact_queue set status='cancelled',sent_at=null where type='company_request_candidate_delivery'");
  assert.equal(await eligible(), false, "closed + like alone never establishes company sharing");
  await db.query("insert into talent_progress values ($1,$2,$3,'org_stage_change','{\"stage\":\"pending_connection\"}')", [rec,talent,role]);
  assert.equal(await eligible(), true, "verified prior company handoff permits a closed pair's ordinary correspondence, not reopening");
  assert.equal(await scalar("select saved_stage from talent_opportunity_recommendation"), "closed");
  console.log("Direct contact and pre-acceptance reply SQL checks passed; no external dispatch, no production data.");
} finally { await db.close(); }
