// Isolated PostgreSQL (PGlite) contract test; no network, credentials or production data.
// PGLITE_MODULE_PATH=/absolute/path/to/@electric-sql/pglite node scripts/testUnifiedCompanyContacts.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
const { PGlite } = require(
  process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite"
);
const db = new PGlite();
const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const fn = (source, name) => {
  const match = source.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`
    )
  );
  assert.ok(match, name);
  return match[0];
};
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table company_workspace (company_workspace_id uuid primary key, company_name text);
    create table company_roles (role_id uuid primary key, company_workspace_id uuid, name text, status text default 'active', is_expired boolean default false, information jsonb);
    create table company_user_workspace (id uuid primary key default gen_random_uuid(), company_workspace_id uuid, company_user_id uuid, authority text);
    create table company_conversations (id uuid primary key default gen_random_uuid(), company_workspace_id uuid, role_id uuid, metadata jsonb default '{}', last_message_id bigint, last_message_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), unique(company_workspace_id, role_id));
    create table company_messages (id bigserial primary key, company_workspace_id uuid, conversation_id uuid, role_id uuid, company_user_id uuid, role text, content text, message_type text, metadata jsonb default '{}', model text, status text, mentions jsonb default '[]', thinking_logs jsonb default '[]', slack_thread_id uuid, created_at timestamptz default now());
    create table talent_opportunity_recommendation (id uuid primary key, role_id uuid, talent_id uuid, feedback text, saved_stage text, processed_stage text, updated_at timestamptz default now());
    create table talent_messages (id bigserial primary key, user_id uuid, conversation_id uuid, role text, content text, message_type text default 'chat', created_at timestamptz default now());
    create table talent_opportunity_tag (id bigserial primary key, talent_id uuid, opportunity_id uuid, tag text, created_at timestamptz default now(), updated_at timestamptz default now());
    create table talent_progress (id bigserial primary key, recommendation_id uuid, talent_id uuid, role_id uuid, kind text, metadata jsonb, created_at timestamptz default now());
    create table company_intro_candidates (recommendation_id uuid, talent_id uuid, status text);
    create table talent_documents (id uuid primary key default gen_random_uuid(), talent_id uuid, kind text, file_name text, storage_path text, content_type text, size_bytes bigint, extracted_text text, is_public boolean, is_primary boolean, is_deleted boolean, origin_type text, origin_id text);
    create table talent_users (user_id uuid primary key, resume_file_name text, resume_storage_path text, resume_text text, updated_at timestamptz);
    create table talent_activity_events (talent_id uuid, conversation_id uuid, message_id bigint, source text, event_type text, summary text, impact_level text, changed_domains text[]);
    create table company_talent_requests (id uuid primary key default gen_random_uuid(), company_workspace_id uuid, recommendation_id uuid, role_id uuid, talent_id uuid, source_company_message_id bigint, contact_kind text default 'contact', expects_document boolean default false, intent text default 'ordinary', resume_stage text, response_disposition text, request_context text, workflow_status text default 'closed', talent_source_message_id bigint, document_id uuid, expires_at timestamptz, delivery_body text, created_at timestamptz default now(), updated_at timestamptz default now());
    create table company_talent_relays (id uuid primary key default gen_random_uuid(), recommendation_id uuid not null, company_talent_request_id uuid, source_talent_message_id bigint, relay_content text, document_id uuid, created_at timestamptz default now(), unique(recommendation_id, source_talent_message_id));
    create table contact_queue (id uuid primary key default gen_random_uuid(), user_id uuid, type text, status text, payload jsonb, scheduled_at timestamptz, sent_at timestamptz, role_id uuid, recommendation_id uuid, company_talent_request_id uuid, company_talent_relay_id uuid, last_error text, locked_at timestamptz, locked_by text, created_at timestamptz default now(), updated_at timestamptz default now());
    create unique index relay_delivery_unique on contact_queue (company_talent_relay_id, type) where company_talent_relay_id is not null and type = 'company_contact_company_delivery';
    -- The unchanged pipeline executor is stubbed: this test exercises the new
    -- evidence/ownership/freshness boundary and absence of automatic reopening.
    create function confirm_internal_candidate_reengagement_v1(uuid,uuid,uuid,text,uuid,text,text,jsonb) returns boolean language sql as $$
      update talent_opportunity_recommendation set saved_stage='accepted', processed_stage=$4 where id=$1 and talent_id=$2 and role_id=$3 returning true;
    $$;
  `);
  const mutual = read(
    "supabase/migrations/20260922190000_mutual_company_talent_relays.sql"
  );
  const ongoing = read(
    "supabase/migrations/20260915130000_company_talent_ongoing_relays.sql"
  );
  await db.exec(fn(mutual, "create_company_talent_relay_v2"));
  await db.exec(fn(mutual, "create_company_talent_relay_v1"));
  await db.exec(fn(ongoing, "finalize_company_talent_relay_delivery_v1"));
  await db.exec(
    read(
      "supabase/migrations/20260922082129_company_agent_web_action_turns.sql"
    )
  );
  await db.exec(
    read(
      "supabase/migrations/20260923063625_unified_company_talent_contacts.sql"
    )
  );
  const workspace = randomUUID(),
    role = randomUUID(),
    talent = randomUUID(),
    other = randomUUID(),
    actor = randomUUID(),
    rec = randomUUID(),
    conversation = randomUUID();
  await db.query(
    "insert into company_workspace values ($1,'Fixture company')",
    [workspace]
  );
  await db.query(
    "insert into company_roles(role_id,company_workspace_id,name,information) values ($1,$2,'Fixture role',$3)",
    [
      role,
      workspace,
      JSON.stringify({
        testOnly: true,
        testFixture: "unified-contacts",
        testTalentIds: [talent],
      }),
    ]
  );
  await db.query(
    "insert into company_user_workspace(company_workspace_id,company_user_id,authority) values ($1,$2,'owner')",
    [workspace, actor]
  );
  await db.query(
    "insert into company_conversations(id,company_workspace_id,role_id) values ($1,$2,$3)",
    [conversation, workspace, role]
  );
  const source = await scalar(
    "insert into company_messages(company_workspace_id,conversation_id,role_id,company_user_id,role,content,message_type) values ($1,$2,$3,$4,'user','Ask which role they want; act on their choice.','chat') returning id",
    [workspace, conversation, role, actor]
  );
  await db.query(
    "insert into talent_opportunity_recommendation(id,role_id,talent_id,feedback,saved_stage,updated_at) values ($1,$2,$3,'like','closed',now()-interval '1 day')",
    [rec, role, talent]
  );
  const contact = randomUUID();
  await db.query(
    "insert into company_talent_requests(id,company_workspace_id,recommendation_id,role_id,talent_id,source_company_message_id,intent,request_context) values ($1,$2,$3,$4,$5,$6,'candidate_reengagement','Which role?')",
    [contact, workspace, rec, role, talent, source]
  );
  await db.query(
    "insert into contact_queue(company_talent_request_id,type,status,sent_at) values ($1,'company_request_candidate_delivery','sent',now())",
    [contact]
  );
  const candidateMessage = async (body, owner = talent) =>
    scalar(
      "insert into talent_messages(user_id,role,content) values ($1,'user',$2) returning id",
      [owner, body]
    );
  const send = (
    message,
    content,
    contactId = null,
    document = null,
    owner = talent
  ) =>
    scalar("select create_company_talent_relay_v2($1,$2,$3,$4,$5,$6)", [
      rec,
      owner,
      message,
      content,
      document,
      contactId,
    ]);
  const msg = await candidateMessage(
    "I prefer Role B, with the stated conditions."
  );
  const relay = await send(msg, "Role B with conditions", contact);
  assert.equal(relay.status, "queued");
  assert.equal(
    await scalar(
      "select saved_stage from talent_opportunity_recommendation where id=$1",
      [rec]
    ),
    "closed"
  );
  assert.equal(
    await scalar("select count(*)::int from company_agent_web_action_jobs"),
    0
  );
  const retry = await send(msg, "Different rewrite", contact);
  assert.equal(retry.id, relay.id);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.contentMismatch, true);
  await assert.rejects(
    send(await candidateMessage("wrong owner", other), "wrong owner", contact),
    /candidate_message_evidence_not_found/
  );
  const wrongContact = randomUUID();
  await db.query(
    "insert into company_talent_requests(id,recommendation_id,role_id,talent_id) values ($1,$2,$3,$4)",
    [wrongContact, rec, role, other]
  );
  await assert.rejects(
    send(await candidateMessage("wrong target"), "wrong target", wrongContact),
    /company_talent_contact_not_found/
  );
  const unsent = randomUUID();
  await db.query(
    "insert into company_talent_requests(id,recommendation_id,role_id,talent_id) values ($1,$2,$3,$4)",
    [unsent, rec, role, talent]
  );
  await assert.rejects(
    send(await candidateMessage("unsent contact"), "unsent", unsent),
    /company_talent_contact_not_delivered/
  );
  assert.equal(
    await scalar(
      "select has_function_privilege('anon','read_company_talent_connections_v1(uuid,text,integer)','execute')"
    ),
    false
  );
  assert.equal(
    await scalar(
      "select has_function_privilege('anon','create_company_talent_relay_v2(uuid,uuid,bigint,text,uuid,uuid)','execute')"
    ),
    false
  );
  const proactive = await send(
    await candidateMessage("A new question"),
    "A new question"
  );
  assert.equal(proactive.requestId, null);
  const compatMsg = await candidateMessage("Continue, conditionally");
  await scalar(
    "select record_company_talent_response_v2($1,$2,$3,'positive')",
    [contact, talent, compatMsg]
  );
  assert.equal(
    await scalar(
      "select saved_stage from talent_opportunity_recommendation where id=$1",
      [rec]
    ),
    "closed"
  );
  const connections = await scalar(
    "select read_company_talent_connections_v1($1,null,20)",
    [talent]
  );
  assert.equal(connections[0].connectionId, `recommendation:${rec}`);
  assert.deepEqual(
    await scalar("select read_company_talent_connections_v1($1,null,20)", [
      other,
    ]),
    []
  );

  // Delivering and registering the existing company-side agent job are atomic.
  await db.query(
    "update contact_queue set payload=jsonb_build_object('delivery',jsonb_build_object('body','Candidate selected Role B')) where company_talent_relay_id=$1",
    [relay.id]
  );
  await scalar(
    "select finalize_company_talent_relay_delivery_v1($1,null,null)",
    [relay.id]
  );
  await scalar(
    "select finalize_company_talent_relay_delivery_v1($1,null,null)",
    [relay.id]
  );
  const jobs = (await db.query("select * from company_agent_web_action_jobs"))
    .rows;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].action_name, "candidate_contact_received");
  assert.equal(jobs[0].actor_user_id, actor);
  assert.equal(jobs[0].action_context.relayId, relay.id);
  assert.equal(jobs[0].queue_dispatch_status, "pending");
  assert.equal(
    await scalar(
      "select count(*)::int from company_messages where metadata->>'relayId'=$1",
      [relay.id]
    ),
    1
  );
  assert.equal(
    await scalar(
      "select saved_stage from talent_opportunity_recommendation where id=$1",
      [rec]
    ),
    "closed"
  );
  const consent = (relayId) =>
    scalar(
      "select confirm_internal_candidate_from_contact_v1($1,$2,$3,'pending_connection',$4,null,'Confirmed from contact','{}',$5)",
      [rec, talent, role, actor, relayId]
    );
  await assert.rejects(
    consent(proactive.id),
    /candidate_contact_consent_evidence_not_found/
  );
  await assert.rejects(
    consent(relay.id),
    /candidate_contact_consent_evidence_superseded/
  );
  const latestConsent = await send(
    await candidateMessage("Proceed after reviewing the conditions"),
    "Proceed after reviewing the conditions"
  );
  await db.query(
    "update contact_queue set payload=jsonb_build_object('delivery',jsonb_build_object('body','Proceed after reviewing the conditions')) where company_talent_relay_id=$1",
    [latestConsent.id]
  );
  await scalar(
    "select finalize_company_talent_relay_delivery_v1($1,null,null)",
    [latestConsent.id]
  );
  assert.equal(await consent(latestConsent.id), true);
  await db.query(
    "update talent_opportunity_recommendation set saved_stage='closed',updated_at=now()+interval '1 second' where id=$1",
    [rec]
  );
  await assert.rejects(
    consent(latestConsent.id),
    /candidate_contact_consent_evidence_superseded/
  );

  // Request category never controls attachment handling; exact destination and
  // sent contact are required. A follow-up upload is valid after a text answer.
  await db.query("insert into talent_users(user_id) values ($1)", [talent]);
  const uploaded = await scalar(
    "select finalize_talent_resume_upload_v1($1,$2,$3,'fixture.txt','fixture/path','text/plain',20,'fixture resume')",
    [contact, talent, randomUUID()]
  );
  assert.ok(uploaded.relayId);
  assert.ok(uploaded.documentId);
  const uploadRetry = await scalar(
    "select finalize_talent_resume_upload_v1($1,$2,$3,'fixture.txt','fixture/path','text/plain',20,'fixture resume')",
    [contact, talent, randomUUID()]
  );
  assert.equal(uploadRetry.documentId, uploaded.documentId);
  assert.equal(uploadRetry.relayId, uploaded.relayId);
  assert.equal(uploadRetry.messageId, uploaded.messageId);
  assert.equal(uploadRetry.idempotent, true);
  assert.equal(
    await scalar(
      "select recommendation_id from company_talent_relays where id=$1",
      [uploaded.relayId]
    ),
    rec
  );
  const privateDoc = randomUUID();
  await db.query(
    "insert into talent_documents(id,talent_id,kind,is_public,is_deleted) values ($1,$2,'resume',false,false)",
    [privateDoc, talent]
  );
  await assert.rejects(
    send(
      await candidateMessage("private attachment"),
      "attachment",
      contact,
      privateDoc
    ),
    /candidate_relay_document_not_found/
  );
  console.log(
    "PASS: PostgreSQL contact routing, historical labels, proactive contacts, ownership, attachments, idempotency, durable event and consent freshness"
  );
} catch (error) {
  console.error({
    message: error.message,
    detail: error.detail,
    where: error.where,
    position: error.position,
  });
  process.exitCode = 1;
} finally {
  await db.close();
}
