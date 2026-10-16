import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const user = "00000000-0000-4000-8000-000000000001";
const workspace = "00000000-0000-4000-8000-000000000002";
const conversation = "00000000-0000-4000-8000-000000000003";
const alias = "00000000-0000-4000-8000-000000000004";
const job = "00000000-0000-4000-8000-000000000005";
const other = "00000000-0000-4000-8000-000000000006";

test("company email migration enforces audience, runtime ownership, source identity and serialization", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE company_users(user_id uuid PRIMARY KEY);
      CREATE TABLE company_workspace(company_workspace_id uuid PRIMARY KEY);
      CREATE TABLE company_user_workspace(company_user_id uuid,company_workspace_id uuid);
      CREATE TABLE company_conversations(id uuid PRIMARY KEY,company_workspace_id uuid,role_id uuid,last_message_id bigint,last_message_at timestamptz,updated_at timestamptz);
      CREATE TABLE company_messages(id bigserial PRIMARY KEY,company_workspace_id uuid,conversation_id uuid,company_user_id uuid,role text,content text,message_type text,status text,metadata jsonb,created_at timestamptz DEFAULT now());
      CREATE TABLE email_reply_aliases(id uuid PRIMARY KEY,talent_id uuid NOT NULL,conversation_id uuid,company_talent_request_id uuid,token_hash text,expires_at timestamptz);
      CREATE TABLE email_reply_jobs(id uuid PRIMARY KEY,status text,locked_by text,locked_at timestamptz,worker_target text DEFAULT 'legacy',metadata jsonb DEFAULT '{}',inbound_event_id uuid,updated_at timestamptz);
    `);
    await db.exec(await readFile(new URL("../../../../supabase/migrations/20261015120000_company_email_replies.sql", import.meta.url), "utf8"));
    await db.exec(`
      INSERT INTO company_users VALUES('${user}');
      INSERT INTO company_workspace VALUES('${workspace}');
      INSERT INTO company_user_workspace VALUES('${user}','${workspace}');
      INSERT INTO company_conversations(id,company_workspace_id) VALUES('${conversation}','${workspace}');
      INSERT INTO email_reply_aliases(id,company_user_id,company_workspace_id,company_conversation_id) VALUES('${alias}','${user}','${workspace}','${conversation}');
      INSERT INTO email_reply_jobs(id,status,locked_by,locked_at,metadata) VALUES('${job}','processing','owner',now(),'{"companyEmail":true}');
    `);
    const source = async (jobId = job, owner = "owner") => (await db.query<any>(
      "select persist_company_email_source_v1($1,$2,$3,$4) as message", [jobId, owner, alias, "Please review our role"])).rows[0].message;
    assert.equal((await db.query<any>("select worker_target from email_reply_jobs")).rows[0].worker_target, "vercel_queue");
    await assert.rejects(source(job, "wrong"), /email_runtime_lease_lost/);
    const first = await source();
    assert.equal((await source()).id, first.id);
    assert.equal(first.company_user_id, user);
    await assert.rejects(db.exec(`UPDATE email_reply_aliases SET talent_id='${user}' WHERE id='${alias}'`), /email_reply_alias_owner/);
    await db.exec(`INSERT INTO email_reply_jobs(id,status,locked_by,locked_at,metadata) VALUES('${other}','processing','owner',now(),'{"companyEmail":true}')`);
    await assert.rejects(source(other), /company_email_conversation_busy/);
    await db.exec(`UPDATE email_reply_jobs SET status='sent' WHERE id='${job}'`);
    assert.notEqual((await source(other)).id, first.id);
    await db.exec(`INSERT INTO company_messages(role,metadata) VALUES('assistant','{"emailReplyJobId":"${job}"}')`);
    await assert.rejects(db.exec(`INSERT INTO company_messages(role,metadata) VALUES('assistant','{"emailReplyJobId":"${job}"}')`), /company_message_email_reply_identity/);
    await db.exec("DELETE FROM company_user_workspace");
    await assert.rejects(source(other), /company_email_membership_revoked/);
    await db.exec("SET ROLE authenticated");
    await assert.rejects(source(other), /permission denied/);
  } finally { await db.close(); }
});
