import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const roleId = "00000000-0000-4000-8000-000000000002";
const talentId = "00000000-0000-4000-8000-000000000003";
const recommendationId = "00000000-0000-4000-8000-000000000004";
const requestId = "00000000-0000-4000-8000-000000000005";
const actorId = "00000000-0000-4000-8000-000000000006";
const otherId = "00000000-0000-4000-8000-000000000007";
const migration = new URL(
  "../../../supabase/migrations/20261014113340_company_contact_integrity_and_delivery_progress.sql",
  import.meta.url
);
let db: PGlite;

async function existingFunction(path: string, name: string) {
  const sql = await readFile(new URL(path, import.meta.url), "utf8");
  const definition = sql.match(
    new RegExp(
      `create (?:or replace )?function public\\.${name}\\([\\s\\S]*?^\\$\\$;`,
      "im"
    )
  );
  assert.ok(definition, `Missing canonical function ${name}`);
  return definition[0];
}

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table company_roles (
      role_id uuid primary key, company_workspace_id uuid,
      status text default 'active', is_expired boolean default false, information jsonb
    );
    create table talent_users (user_id uuid primary key, email text, deleted_at timestamptz);
    create table talent_opportunity_recommendation (
      id uuid primary key, role_id uuid, talent_id uuid, feedback text,
      saved_stage text, processed_stage text
    );
    create table talent_opportunity_tag (opportunity_id uuid, talent_id uuid, tag text);
    create table company_intro_candidates (recommendation_id uuid, status text);
    create table company_messages (
      id bigint primary key, company_workspace_id uuid, company_user_id uuid, role text
    );
    create table company_talent_requests (
      id uuid primary key, company_workspace_id uuid, role_id uuid, talent_id uuid,
      recommendation_id uuid, source_company_message_id bigint,
      contact_kind text, contact_purpose text default 'deliver', delivery_subject text,
      delivery_body text, request_context text, draft_revision integer,
      expects_document boolean, intent text, workflow_status text, approved_at timestamptz,
      expires_at timestamptz default 'infinity', talent_source_message_id bigint,
      document_id uuid, in_reply_to_company_talent_relay_id uuid,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table contact_queue (
      id uuid primary key default gen_random_uuid(), user_id uuid, type text, status text,
      payload jsonb default '{}', scheduled_at timestamptz default now(),
      sent_at timestamptz, cancelled_at timestamptz, resend_email_id text, last_error text,
      attempts integer default 0, role_id uuid, recommendation_id uuid,
      company_talent_request_id uuid, created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table talent_progress (
      id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
      recommendation_id uuid, company_user_id uuid, user_id text, kind text,
      text text, metadata jsonb, created_at timestamptz default now(),
      open_to_talent boolean default false, open_to_company boolean default false
    );
  `);
  await db.exec(
    await existingFunction(
      "../../../supabase/migrations/20260927040514_remove_cross_request_candidate_contact_blocking.sql",
      "send_company_talent_contact_v1"
    )
  );
  await db.exec(
    await existingFunction(
      "../../../supabase/migrations/20260930052123_company_contact_purpose_and_career_recent_info.sql",
      "send_company_talent_contact_v2"
    )
  );
  const audienceSql = await readFile(
    new URL(
      "../../../supabase/migrations/20261013111553_preserve_presented_candidates_and_intro_decisions.sql",
      import.meta.url
    ),
    "utf8"
  );
  const audience = audienceSql.match(
    /create or replace function public\.set_talent_progress_audiences_v1\(\)[\s\S]*?\$function\$;/i
  );
  assert.ok(audience);
  await db.exec(audience[0]);
  await db.exec(`
    create trigger set_progress_audiences before insert or update on talent_progress
    for each row execute function set_talent_progress_audiences_v1();
    create function reject_test_history() returns trigger language plpgsql as $$
    begin
      if current_setting('test.reject_history', true) = 'yes' then
        raise exception 'synthetic_history_write_failure';
      end if;
      return new;
    end;
    $$;
    create trigger reject_test_history before insert or update on talent_progress
    for each row execute function reject_test_history();
  `);
  await db.exec(await readFile(migration, "utf8"));
});

after(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`
    select set_config('test.reject_history', 'no', false);
    truncate contact_queue, company_talent_requests, talent_progress,
      company_messages, company_intro_candidates, talent_opportunity_tag,
      talent_opportunity_recommendation, company_roles, talent_users;
  `);
  // Every Role is an isolated in-memory fixture, marked before insertion.
  await db.query(
    "insert into company_roles(role_id,company_workspace_id,information) values($1,$2,$3)",
    [
      roleId,
      workspaceId,
      {
        testOnly: true,
        testFixture: "company-contact-delivery-progress",
        testTalentIds: [talentId],
      },
    ]
  );
  await db.query("insert into talent_users(user_id,email) values($1,$2)", [
    talentId,
    "candidate@example.test",
  ]);
  await db.query(
    "insert into talent_opportunity_recommendation(id,role_id,talent_id,feedback,saved_stage) values($1,$2,$3,'like','closed')",
    [recommendationId, roleId, talentId]
  );
  await db.query(
    "insert into talent_opportunity_tag(opportunity_id,talent_id,tag) values($1,$2,'내부:아카이브')",
    [roleId, talentId]
  );
  await db.query(
    "insert into company_messages(id,company_workspace_id,company_user_id,role) values(101,$1,$2,'user')",
    [workspaceId, actorId]
  );
});

async function contactable(
  ids = [workspaceId, roleId, talentId, recommendationId]
) {
  return (
    await db.query<{ allowed: boolean }>(
      "select company_talent_pair_is_contactable_v1($1,$2,$3,$4) as allowed",
      ids
    )
  ).rows[0].allowed;
}

async function sendContact() {
  return (
    await db.query<{ result: { requestId: string; idempotent: boolean } }>(
      "select send_company_talent_contact_v2($1,$2,$3,$4,$5,101,$6,$7,$8,'request') as result",
      [
        requestId,
        workspaceId,
        roleId,
        talentId,
        recommendationId,
        "Would you like to resume?",
        "Could we resume this Role?\nPlease share any conditions.",
        "Ask whether the candidate would like to resume this Role.",
      ]
    )
  ).rows[0].result;
}

async function progress() {
  return (
    await db.query<any>("select * from talent_progress order by created_at,id")
  ).rows;
}

test("an archived, closed candidate with no prior handoff can receive an authorized contact", async () => {
  assert.equal(await contactable(), true);
  const result = await sendContact();
  assert.equal(result.requestId, requestId);
  assert.equal(result.idempotent, false);
  const target = await db.query<{ active: boolean }>(
    "select company_talent_request_target_is_active_v1($1) as active",
    [requestId]
  );
  assert.equal(target.rows[0].active, true);
  const recommendation = await db.query<any>(
    "select saved_stage from talent_opportunity_recommendation where id=$1",
    [recommendationId]
  );
  assert.equal(recommendation.rows[0].saved_stage, "closed");
  const events = await progress();
  assert.equal(events.length, 1);
  assert.equal(events[0].metadata.eventType, "candidate_contact_scheduled");
  assert.equal(events[0].company_user_id, actorId);
  assert.equal(events[0].open_to_talent, false);
});

test("feedback, pipeline changes, and Intro decisions do not gate contact creation or dispatch", async () => {
  await sendContact();
  await db.exec(`
    update talent_opportunity_recommendation set feedback='dislike',saved_stage='closed';
    update talent_opportunity_tag set tag='내부:거절';
  `);
  for (const status of ["ready", "closed", "declined"]) {
    await db.exec("delete from company_intro_candidates");
    await db.query(
      "insert into company_intro_candidates(recommendation_id,status) values($1,$2)",
      [recommendationId, status]
    );
    assert.equal(await contactable(), true);
    assert.equal(
      (
        await db.query<{ active: boolean }>(
          "select company_talent_request_target_is_active_v1($1) as active",
          [requestId]
        )
      ).rows[0].active,
      true
    );
  }
});

test("target ownership, account deletion, role availability, and fixture isolation remain enforced", async () => {
  for (let i = 0; i < 4; i++) {
    const ids = [workspaceId, roleId, talentId, recommendationId];
    ids[i] = otherId;
    assert.equal(await contactable(ids), false);
  }
  await db.exec("update talent_users set deleted_at=now()");
  assert.equal(await contactable(), false);
  await db.exec("update talent_users set deleted_at=null,email=' '");
  assert.equal(await contactable(), false);
  await db.exec("update talent_users set email='candidate@example.test'");
  for (const status of ["ended", "deleted"]) {
    await db.query("update company_roles set status=$1", [status]);
    assert.equal(await contactable(), false);
  }
  await db.exec("update company_roles set status='active',is_expired=true");
  assert.equal(await contactable(), false);
  await db.exec(
    "update company_roles set is_expired=false,information=information-'testTalentIds'"
  );
  assert.equal(await contactable(), false);
  await assert.rejects(sendContact, /target_not_active/);
  assert.equal((await progress()).length, 0);
});

test("source-message retries keep one request and one scheduled record", async () => {
  await sendContact();
  assert.equal((await sendContact()).idempotent, true);
  assert.equal((await progress()).length, 1);
  assert.equal(
    (
      await db.query<{ count: number }>(
        "select count(*)::int as count from contact_queue"
      )
    ).rows[0].count,
    1
  );
});

test("actual delivery records the frozen message, recipient, time and provider once in both feeds", async () => {
  await sendContact();
  await db.query(
    "update contact_queue set status='processing',resend_email_id=$1,payload=payload||$2::jsonb where company_talent_request_id=$3",
    [
      "provider-accepted",
      {
        runtimeDelivery: {
          subject: "Frozen subject",
          to: "candidate@example.test",
        },
        runtimeCopy: { body: "Frozen approved body\nwith conditions." },
      },
      requestId,
    ]
  );
  assert.equal((await progress()).length, 1);
  await db.query(
    "update contact_queue set status='sent',sent_at=$1 where company_talent_request_id=$2",
    ["2026-10-14T12:00:00Z", requestId]
  );
  await db.query(
    "update contact_queue set status='sent' where company_talent_request_id=$1",
    [requestId]
  );
  const events = await progress();
  assert.equal(events.length, 2);
  const sent = events.find(
    (row) => row.metadata.eventType === "candidate_contact_sent"
  );
  assert.ok(sent);
  assert.equal(sent.text, "Frozen approved body\nwith conditions.");
  assert.equal(sent.metadata.subject, "Frozen subject");
  assert.equal(sent.metadata.toEmail, "candidate@example.test");
  assert.equal(sent.metadata.resendEmailId, "provider-accepted");
  assert.equal(
    Date.parse(sent.metadata.sentAt),
    Date.parse("2026-10-14T12:00:00Z")
  );
  assert.equal(sent.open_to_talent, true);
  assert.equal(sent.open_to_company, true);
});

test("legacy Python delivery and direct sent inserts use the same record", async () => {
  await sendContact();
  await db.query(
    "update contact_queue set status='sent',sent_at=now(),resend_email_id=$1,payload=payload||$2::jsonb where company_talent_request_id=$3",
    [
      "python-provider",
      {
        delivery: {
          chatText: "Actual Python message",
          subject: "Python subject",
          to: "candidate@example.test",
        },
      },
      requestId,
    ]
  );
  await db.exec("delete from contact_queue");
  await db.query(
    "insert into contact_queue(user_id,type,status,role_id,recommendation_id,company_talent_request_id,sent_at,resend_email_id) values($1,'company_request_candidate_delivery','sent',$2,$3,$4,now(),'python-provider')",
    [talentId, roleId, recommendationId, requestId]
  );
  const sent = (await progress()).filter(
    (row) => row.metadata.eventType === "candidate_contact_sent"
  );
  assert.equal(sent.length, 1);
});

test("legacy company-bound request responses preserve their existing progress event", async () => {
  await sendContact();
  await db.query(
    "insert into contact_queue(user_id,type,status,role_id,recommendation_id,company_talent_request_id,sent_at,payload) values($1,'company_request_company_delivery','sent',$2,$3,$4,now(),$5)",
    [
      talentId,
      roleId,
      recommendationId,
      requestId,
      { delivery: { body: "Candidate-approved reply" } },
    ]
  );
  const reply = (await progress()).find(
    (event) => event.metadata.eventType === "candidate_response_received"
  );
  assert.ok(reply);
  assert.equal(reply.text, "Candidate-approved reply");
  assert.equal(reply.company_user_id, null);
  assert.equal(reply.open_to_company, true);
});

test("failures, retries and cancellations stay reviewable without claiming a send", async () => {
  await sendContact();
  await db.query(
    "update contact_queue set status='failed',last_error=$1,attempts=1 where company_talent_request_id=$2",
    ["synthetic_send_error", requestId]
  );
  await db.query(
    "update contact_queue set status='failed',last_error=$1,attempts=2 where company_talent_request_id=$2",
    ["synthetic_retry_error", requestId]
  );
  await db.query(
    "update contact_queue set status='cancelled',cancelled_at=now() where company_talent_request_id=$1",
    [requestId]
  );
  const events = await progress();
  assert.equal(events.length, 3);
  assert.ok(
    events.every((event) => !event.open_to_talent && !event.open_to_company)
  );
  const failed = events.find(
    (event) => event.metadata.eventType === "candidate_contact_failed"
  );
  assert.equal(failed.metadata.lastError, "synthetic_retry_error");
  assert.equal(failed.metadata.attempts, 2);
  assert.ok(events.every((event) => !event.metadata.sentAt));
});

test("a history failure cannot silently finalize a delivery and retry preserves its provider checkpoint", async () => {
  await sendContact();
  await db.query(
    "update contact_queue set status='processing',resend_email_id='accepted-once' where company_talent_request_id=$1",
    [requestId]
  );
  await db.exec("select set_config('test.reject_history','yes',false)");
  await assert.rejects(
    () =>
      db.query(
        "update contact_queue set status='sent',sent_at=now() where company_talent_request_id=$1",
        [requestId]
      ),
    /synthetic_history_write_failure/
  );
  const current = await db.query<any>(
    "select status,resend_email_id from contact_queue"
  );
  assert.equal(current.rows[0].status, "processing");
  assert.equal(current.rows[0].resend_email_id, "accepted-once");
  await db.exec("select set_config('test.reject_history','no',false)");
  await db.query(
    "update contact_queue set status='sent',sent_at=now() where company_talent_request_id=$1",
    [requestId]
  );
  assert.equal(
    (await progress()).filter(
      (event) => event.metadata.eventType === "candidate_contact_sent"
    ).length,
    1
  );
});

test("operational helpers remain unavailable to public clients", async () => {
  const result = await db.query<{ allowed: boolean }>(
    "select has_function_privilege('anon','company_talent_pair_is_contactable_v1(uuid,uuid,uuid,uuid)','execute') as allowed"
  );
  assert.equal(result.rows[0].allowed, false);
});
