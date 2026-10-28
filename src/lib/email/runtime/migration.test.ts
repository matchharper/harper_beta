import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const talent = "00000000-0000-4000-8000-000000000001";
const conversation = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const otherJob = "00000000-0000-4000-8000-000000000004";
const schema = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE talent_conversations(id uuid PRIMARY KEY,user_id uuid,stage text,updated_at timestamptz DEFAULT now());
CREATE TABLE talent_messages(id bigserial PRIMARY KEY,conversation_id uuid,user_id uuid,role text,content text,message_type text,payload jsonb DEFAULT '{}');
CREATE TABLE career_email_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),talent_id uuid,talent_message_id bigint,inbound_event_id uuid,reply_job_id uuid,direction text,mail_type text,status text,from_email text,to_email text,subject text,body_text text,occurred_at timestamptz,metadata jsonb);
CREATE UNIQUE INDEX career_email_message_source ON career_email_messages(talent_message_id) WHERE talent_message_id IS NOT NULL;
CREATE TABLE email_reply_jobs(id uuid PRIMARY KEY,inbound_event_id uuid,talent_id uuid,conversation_id uuid,user_message_id bigint,assistant_message_id bigint,status text DEFAULT 'queued',attempts integer DEFAULT 0,locked_at timestamptz,locked_by text,last_error text,skip_reason text,resend_email_id text,processed_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),kind text DEFAULT 'reply',metadata jsonb DEFAULT '{}');
CREATE TABLE contact_queue(id uuid PRIMARY KEY,user_id uuid,scheduled_at timestamptz DEFAULT now(),type text,status text DEFAULT 'queued',attempts integer DEFAULT 0,locked_at timestamptz,locked_by text,last_error text,sent_at timestamptz,cancelled_at timestamptz,resend_email_id text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),payload jsonb DEFAULT '{}',role_id uuid,recommendation_id uuid,company_talent_request_id uuid,company_talent_relay_id uuid);
CREATE TABLE career_email_onboarding_leads(id uuid PRIMARY KEY,local_id text,status text DEFAULT 'active',step text DEFAULT 'profile_review_pending',calendar_cta_sent_at timestamptz,conversation_id uuid,talent_id uuid,profile_received_at timestamptz DEFAULT now(),profile_ingested_at timestamptz,review_email_resend_id text,reply_alias text,metadata jsonb DEFAULT '{}',review_attempts integer DEFAULT 0,review_locked_at timestamptz,review_locked_by text,last_error text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE career_email_onboarding_events(id uuid DEFAULT gen_random_uuid(),lead_id uuid,local_id text,normalized_email_hash text,event_type text NOT NULL,metadata jsonb NOT NULL DEFAULT '{}');
CREATE TABLE org_intro_email_threads(id uuid PRIMARY KEY,talent_id uuid,capture_address text,participant_emails text[] NOT NULL,status text DEFAULT 'active',message_count integer NOT NULL DEFAULT 0,last_message_at timestamptz,updated_at timestamptz);
CREATE TABLE company_talent_requests(id uuid PRIMARY KEY,talent_id uuid,workflow_status text,expires_at timestamptz);
CREATE TABLE meeting_schedule_rounds(id uuid PRIMARY KEY,delivery_queue_id uuid,status text,updated_at timestamptz);
`;
before(async () => {
  db = new PGlite();
  await db.exec(schema);
  await db.exec(
    await readFile(
      new URL(
        "../../../../supabase/migrations/20261013035308_email_vercel_runtime.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
});
after(async () => {
  await db?.close();
});
test("default runtime migration moves unclaimed work and preserves active owners and delivery receipts", async () => {
  const migrated = new PGlite();
  try {
    await migrated.exec(schema);
    await migrated.exec(await readFile(new URL("../../../../supabase/migrations/20261013035308_email_vercel_runtime.sql", import.meta.url), "utf8"));
    await migrated.query(`INSERT INTO email_reply_jobs(id,status,locked_by,locked_at,resend_email_id)
      VALUES($1,'processing','old-owner',now(),'existing-receipt'),($2,'queued',null,null,null)`, [jobId, otherJob]);
    await migrated.query(`INSERT INTO contact_queue(id,status,locked_by,locked_at,scheduled_at)
      VALUES($1,'processing','old-owner',now(),now()),($2,'queued',null,null,now()+interval '1 day')`, [jobId, otherJob]);
    await migrated.query(`INSERT INTO career_email_onboarding_leads(id,conversation_id,talent_id,review_locked_by,review_locked_at)
      VALUES($1,$3,$4,'old-owner',now()),($2,$3,$4,null,null)`, [jobId, otherJob, conversation, talent]);
    await migrated.exec(await readFile(new URL("../../../../supabase/migrations/20261027062947_email_runtime_default.sql", import.meta.url), "utf8"));

    for (const table of ["email_reply_jobs", "contact_queue", "career_email_onboarding_leads"]) {
      const existing = (await migrated.query<any>(`SELECT * FROM ${table} ORDER BY id`)).rows;
      assert.equal(existing.find(r => r.id === jobId).worker_target, "legacy");
      assert.equal(existing.find(r => r.id === otherJob).worker_target, "vercel_queue");
      const created = (await migrated.query<any>(`INSERT INTO ${table}(id) VALUES($1) RETURNING worker_target`, [talent])).rows[0];
      assert.equal(created.worker_target, "vercel_queue");
    }
    const active = (await migrated.query<any>("SELECT status,locked_by,resend_email_id FROM email_reply_jobs WHERE id=$1", [jobId])).rows[0];
    assert.deepEqual(active, { status: "processing", locked_by: "old-owner", resend_email_id: "existing-receipt" });
    const contact = (await migrated.query<any>("SELECT scheduled_at > now() AS future,locked_by FROM contact_queue WHERE id=$1", [otherJob])).rows[0];
    assert.equal(contact.future, true);
    const review = (await migrated.query<any>("SELECT review_locked_by FROM career_email_onboarding_leads WHERE id=$1", [jobId])).rows[0];
    assert.equal(review.review_locked_by, "old-owner");
    for (const fn of ["claim_email_reply_jobs", "claim_contact_queue_jobs", "claim_career_email_onboarding_reviews"])
      assert.deepEqual((await migrated.query(`SELECT * FROM ${fn}('old-worker')`)).rows, []);
  } finally { await migrated.close(); }
});
beforeEach(async () => {
  await db.exec(
    "TRUNCATE career_email_onboarding_events,org_intro_email_threads,email_reply_jobs,contact_queue,career_email_onboarding_leads,talent_messages,talent_conversations,career_email_messages,company_talent_requests,meeting_schedule_rounds RESTART IDENTITY"
  );
  await db.query<any>(
    "INSERT INTO talent_conversations(id,user_id) VALUES($1,$2)",
    [conversation, talent]
  );
});
async function claim(kind = "reply", id = jobId, owner = "first") {
  const result = await db.query<{ result: any }>(
    "SELECT claim_email_runtime_job_v1($1,$2,$3) AS result",
    [kind, id, owner]
  );
  return result.rows[0].result;
}
async function queued(id = jobId) {
  await db.query<any>(
    "INSERT INTO email_reply_jobs(id,worker_target) VALUES($1,'vercel_queue')",
    [id]
  );
}
test("rollout adopts queued work while preserving every live legacy lease and future contact", async () => {
  await db.query<any>(
    "INSERT INTO email_reply_jobs(id,status,locked_at,locked_by) VALUES($1,'processing',now(),'legacy-active'),($2,'queued',null,null)",
    [jobId, otherJob]
  );
  await db.query<any>(
    "INSERT INTO contact_queue(id,scheduled_at) VALUES($1,now()+interval '1 day')",
    [jobId]
  );
  const result = await db.query<{ jobs: any[] }>(
    "SELECT dispatch_email_runtime_jobs_v1() AS jobs"
  );
  assert.deepEqual(
    result.rows[0].jobs.map((j) => j.jobId),
    [otherJob]
  );
  const current = await db.query<any>(
    "SELECT * FROM email_reply_jobs WHERE id=$1",
    [jobId]
  );
  assert.equal(current.rows[0].locked_by, "legacy-active");
  assert.equal(current.rows[0].worker_target, "legacy");
  const legacy = await db.query<any>(
    "SELECT * FROM claim_email_reply_jobs($1)",
    ["legacy"]
  );
  assert.equal(legacy.rows.length, 0);
});
test("two Queue deliveries share one job owner and replay of a sent job is a no-op", async () => {
  await queued();
  assert.equal((await claim()).state, "claimed");
  assert.equal((await claim("reply", jobId, "second")).state, "busy");
  await db.query<any>("UPDATE email_reply_jobs SET status='sent' WHERE id=$1", [
    jobId,
  ]);
  assert.equal((await claim()).state, "terminal");
  const count = await db.query<any>(
    "SELECT attempts FROM email_reply_jobs WHERE id=$1",
    [jobId]
  );
  assert.equal(count.rows[0].attempts, 1);
});
test("atomic message checkpoint reuses messages and verifies candidate and conversation ownership", async () => {
  await queued();
  await claim();
  const persist = async (role: string) =>
    db.query<any>(
      "SELECT persist_email_runtime_message_v1($1,$2,$3,$4,$5,$6) AS message",
      [jobId, "first", talent, conversation, role, "content"]
    );
  const a = await persist("user"),
    b = await persist("user");
  assert.equal(a.rows[0].message.id, b.rows[0].message.id);
  await persist("assistant");
  await persist("assistant");
  assert.equal(
    (await db.query<any>("SELECT count(*) AS count FROM talent_messages"))
      .rows[0].count,
    2
  );
  await assert.rejects(
    () =>
      db.query<any>(
        "SELECT persist_email_runtime_message_v1($1,$2,$3,$4,$5,$6)",
        [jobId, "wrong", talent, conversation, "assistant", "other"]
      ),
    /lease_lost/
  );
  await assert.rejects(
    () =>
      db.query<any>(
        "SELECT persist_email_runtime_message_v1($1,$2,$3,$4,$5,$6)",
        [jobId, "first", otherJob, conversation, "user", "other"]
      ),
    /conversation_not_owned/
  );
});
test("another active email in the conversation blocks a write without inserting a duplicate", async () => {
  await queued();
  await claim();
  await db.query<any>(
    "UPDATE email_reply_jobs SET talent_id=$1,conversation_id=$2 WHERE id=$3",
    [talent, conversation, jobId]
  );
  await queued(otherJob);
  await claim("reply", otherJob, "second");
  await assert.rejects(
    () =>
      db.query<any>(
        "SELECT persist_email_runtime_message_v1($1,$2,$3,$4,$5,$6)",
        [otherJob, "second", talent, conversation, "user", "other"]
      ),
    /conversation_busy/
  );
  assert.equal(
    (await db.query<any>("SELECT count(*) AS count FROM talent_messages"))
      .rows[0].count,
    0
  );
});
test("provider checkpoint precedes finalization and finalization is atomic and idempotent", async () => {
  await db.query<any>(
    "INSERT INTO company_talent_requests(id,talent_id,workflow_status) VALUES($1,$2,'queued')",
    [otherJob, talent]
  );
  await db.query<any>(
    "INSERT INTO contact_queue(id,user_id,type,company_talent_request_id,worker_target,status,locked_by) VALUES($1,$2,'company_request_candidate_delivery',$3,'vercel_queue','processing','first')",
    [jobId, talent, otherJob]
  );
  const delivery = {
    from: "hello@example.com",
    to: "talent@example.com",
    subject: "Subject",
    replyTo: "reply@example.com",
    text: "Body",
  };
  const copy = {
    conversationId: conversation,
    body: "Body",
    mailType: "company_talent_request",
    metadata: { companyTalentRequestId: otherJob },
  };
  const finish = () =>
    db.query<any>("SELECT finalize_email_contact_delivery_v1($1,$2,$3,$4,$5)", [
      jobId,
      "first",
      "provider-id",
      delivery,
      copy,
    ]);
  await assert.rejects(finish, /not_checkpointed/);
  await db.query<any>(
    "UPDATE contact_queue SET resend_email_id=$1 WHERE id=$2",
    ["provider-id", jobId]
  );
  await finish();
  await finish();
  assert.equal(
    (await db.query<any>("SELECT count(*) AS count FROM talent_messages"))
      .rows[0].count,
    1
  );
  assert.equal(
    (await db.query<any>("SELECT count(*) AS count FROM career_email_messages"))
      .rows[0].count,
    1
  );
  assert.equal(
    (await db.query<any>("SELECT workflow_status FROM company_talent_requests"))
      .rows[0].workflow_status,
    "awaiting_talent"
  );
});
test("audit replay preserves the existing source message identity from the legacy worker", async () => {
  await db.query<any>(
    "INSERT INTO talent_messages(id,conversation_id,user_id,role) VALUES(1,$1,$2,'assistant')",
    [conversation, talent]
  );
  await db.query<any>(
    "INSERT INTO career_email_messages(id,talent_id,talent_message_id,status) VALUES($1,$2,1,'sent')",
    [otherJob, talent]
  );
  const row = {
    id: jobId,
    talent_id: talent,
    talent_message_id: 1,
    direction: "outbound",
    mail_type: "auto_reply",
    status: "sent",
    body_text: "Updated body",
    metadata: { resendEmailId: "provider" },
  };
  await db.query<any>("SELECT record_email_runtime_audit_v1($1)", [row]);
  const result = await db.query<any>(
    "SELECT id,body_text FROM career_email_messages"
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, otherJob);
  assert.equal(result.rows[0].body_text, "Updated body");
});
test("global capacity does not consume an attempt or mark waiting work failed", async () => {
  for (let n = 0; n < 4; n++) {
    const id = `00000000-0000-4000-8000-${String(n + 10).padStart(12, "0")}`;
    await queued(id);
    await claim("reply", id, `owner${n}`);
  }
  await queued();
  assert.equal((await claim()).state, "capacity");
  assert.equal(
    (
      await db.query<any>("SELECT attempts FROM email_reply_jobs WHERE id=$1", [
        jobId,
      ])
    ).rows[0].attempts,
    0
  );
});
test("internal runtime mutation RPCs are inaccessible to public and signed-in client roles", async () => {
  for (const role of ["anon", "authenticated"]) {
    const result = await db.query<any>(
      "SELECT has_function_privilege($1,'public.claim_email_runtime_job_v1(text,uuid,text,integer,integer)','EXECUTE') AS allowed",
      [role]
    );
    assert.equal(result.rows[0].allowed, false);
  }
});

test("onboarding review completion records one message and resumes the original success/failure steps", async () => {
  for (const ok of [true, false]) {
    await db.exec(
      "TRUNCATE career_email_onboarding_events,career_email_onboarding_leads,talent_messages,career_email_messages RESTART IDENTITY"
    );
    const metadata = {
      reviewProviderId: "provider",
      reviewDelivery: {
        from: "hello@example.com",
        to: "talent@example.com",
        subject: "Review",
      },
      reviewBody: "Saved reply",
      profileIngested: ok,
    };
    await db.query<any>(
      "INSERT INTO career_email_onboarding_leads(id,talent_id,conversation_id,worker_target,review_locked_by,metadata) VALUES($1,$2,$3,'vercel_queue','first',$4)",
      [jobId, talent, conversation, metadata]
    );
    await db.query<any>(
      "SELECT finalize_email_onboarding_review_v1($1,$2,$3)",
      [jobId, "first", "provider"]
    );
    const lead: any = (
      await db.query<any>("SELECT * FROM career_email_onboarding_leads")
    ).rows[0];
    assert.equal(lead.step, ok ? "calendar_cta_sent" : "awaiting_profile");
    assert.equal(Boolean(lead.calendar_cta_sent_at), ok);
    assert.equal(lead.review_locked_by, null);
    assert.equal(
      (await db.query<any>("SELECT count(*) AS count FROM talent_messages"))
        .rows[0].count,
      1
    );
    const mail: any = (
      await db.query<any>("SELECT * FROM career_email_messages")
    ).rows[0];
    assert.equal(
      mail.mail_type,
      ok ? "onboarding_review" : "onboarding_profile_ingestion_failed"
    );
    assert.equal(mail.status, "sent");
    const event = (
      await db.query<any>(
        "SELECT event_type FROM career_email_onboarding_events"
      )
    ).rows[0];
    assert.equal(
      event.event_type,
      ok ? "calendar_cta_sent" : "profile_ingestion_failed"
    );
  }
});

test("intro capture saves the audit, advances its count, and acknowledges the job atomically without a chat message", async () => {
  await queued();
  await claim();
  await db.query<any>(
    "INSERT INTO org_intro_email_threads(id,talent_id,capture_address,participant_emails) VALUES($1,$2,'intro@example.com',ARRAY['member@example.com'])",
    [otherJob, talent]
  );
  const row = {
    id: jobId,
    talent_id: talent,
    from_email: "intruder@example.com",
    to_email: "intro@example.com",
    body_text: "Hello",
    mail_type: "org_intro_reply",
    direction: "inbound",
    status: "received",
    occurred_at: "2026-10-12T12:00:00Z",
  };
  const capture = () =>
    db.query<any>("SELECT record_email_intro_capture_v1($1,$2,$3,$4)", [
      jobId,
      "first",
      otherJob,
      row,
    ]);
  await assert.rejects(capture, /not_participant/);
  assert.equal(
    (await db.query<any>("SELECT count(*) AS count FROM career_email_messages"))
      .rows[0].count,
    0
  );
  row.from_email = "member@example.com";
  await capture();
  await capture();
  assert.equal(
    (await db.query<any>("SELECT message_count FROM org_intro_email_threads"))
      .rows[0].message_count,
    1
  );
  assert.equal(
    (await db.query<any>("SELECT count(*) AS count FROM career_email_messages"))
      .rows[0].count,
    1
  );
  assert.equal(
    (await db.query<any>("SELECT count(*) AS count FROM talent_messages"))
      .rows[0].count,
    0
  );
  assert.equal(
    (await db.query<any>("SELECT status FROM email_reply_jobs")).rows[0].status,
    "skipped"
  );
  await queued(otherJob);
  await claim("reply", otherJob, "second");
  const older = { ...row, id: otherJob, occurred_at: "2026-10-11T12:00:00Z" };
  await db.query<any>("SELECT record_email_intro_capture_v1($1,$2,$3,$4)", [
    otherJob,
    "second",
    otherJob,
    older,
  ]);
  const thread: any = (
    await db.query<any>("SELECT * FROM org_intro_email_threads")
  ).rows[0];
  assert.equal(thread.message_count, 2);
  assert.equal(
    new Date(thread.last_message_at).toISOString(),
    "2026-10-12T12:00:00.000Z"
  );
});

test("a bound conversation cannot be claimed while a legacy reply is still running", async () => {
  await queued();
  await db.query<any>(
    "UPDATE email_reply_jobs SET conversation_id=$1 WHERE id=$2",
    [conversation, jobId]
  );
  await db.query<any>(
    "INSERT INTO email_reply_jobs(id,conversation_id,status,locked_at,locked_by) VALUES($1,$2,'processing',now()-interval '1 hour','legacy')",
    [otherJob, conversation]
  );
  assert.equal((await claim()).state, "busy");
  assert.equal(
    (
      await db.query<any>("SELECT attempts FROM email_reply_jobs WHERE id=$1", [
        jobId,
      ])
    ).rows[0].attempts,
    0
  );
});

test("confirmed sends remain recoverable after the attempt budget without attempting a new delivery", async () => {
  await queued();
  await db.query<any>(
    "UPDATE email_reply_jobs SET attempts=3,resend_email_id='provider' WHERE id=$1",
    [jobId]
  );
  const result = await claim();
  assert.equal(result.state, "claimed");
  assert.equal(result.job.attempts, 3);
});

test("review and reply claims serialize the same conversation", async () => {
  await db.query<any>(
    "INSERT INTO career_email_onboarding_leads(id,talent_id,conversation_id,worker_target) VALUES($1,$2,$3,'vercel_queue')",
    [otherJob, talent, conversation]
  );
  await claim("onboarding_review", otherJob, "review-owner");
  await queued();
  await db.query<any>(
    "UPDATE email_reply_jobs SET conversation_id=$1 WHERE id=$2",
    [conversation, jobId]
  );
  assert.equal((await claim()).state, "busy");
});

test("meeting finalization keeps canonical round metadata and does not add a talent chat message", async () => {
  await db.query<any>(
    "INSERT INTO meeting_schedule_rounds(id,delivery_queue_id,status) VALUES($1,$2,'queued')",
    [otherJob, jobId]
  );
  await db.query<any>(
    "INSERT INTO contact_queue(id,user_id,type,worker_target,status,locked_by,resend_email_id,payload) VALUES($1,$2,'meeting_schedule_candidate_invitation','vercel_queue','processing','first','provider',$3)",
    [jobId, talent, { body: "Invitation", meetingScheduleRoundId: otherJob }]
  );
  const delivery = {
    from: "hello@example.com",
    to: "candidate@example.com",
    subject: "Invite",
    text: "Invitation",
  };
  const copy = {
    conversationId: conversation,
    mailType: "meeting_schedule_candidate_invitation",
    body: "Invitation",
    metadata: { meetingScheduleRoundId: otherJob },
  };
  await db.query<any>(
    "SELECT finalize_email_contact_delivery_v1($1,$2,$3,$4,$5)",
    [jobId, "first", "provider", delivery, copy]
  );
  assert.equal(
    (await db.query<any>("SELECT status FROM meeting_schedule_rounds")).rows[0]
      .status,
    "sent"
  );
  assert.equal(
    (await db.query<any>("SELECT count(*) AS count FROM talent_messages"))
      .rows[0].count,
    0
  );
  assert.equal(
    (await db.query<any>("SELECT payload->>'body' AS body FROM contact_queue"))
      .rows[0].body,
    "[redacted after delivery]"
  );
  const mail = (
    await db.query<any>("SELECT mail_type,metadata FROM career_email_messages")
  ).rows[0];
  assert.equal(mail.mail_type, "meeting_schedule_candidate_invitation");
  assert.equal(mail.metadata.meetingScheduleRoundId, otherJob);
});
