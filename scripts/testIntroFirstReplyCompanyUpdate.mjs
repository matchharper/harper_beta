// Isolated PostgreSQL verification of the real trigger and company update RPC.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const migration = readFileSync(new URL('../supabase/migrations/20261015123136_intro_first_reply_company_update.sql', import.meta.url), 'utf8');
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table company_roles(role_id uuid primary key,company_workspace_id uuid);
    create table company_user_workspace(id bigserial,company_user_id uuid,company_workspace_id uuid,authority text);
    create table company_conversations(id uuid default gen_random_uuid(),company_workspace_id uuid,role_id uuid,metadata jsonb,unique(company_workspace_id,role_id));
    create table company_messages(id bigserial,company_workspace_id uuid,conversation_id uuid,role_id uuid,company_user_id uuid,role text,content text,message_type text,status text,metadata jsonb);
    create table company_agent_web_action_jobs(id uuid primary key,company_workspace_id uuid,conversation_id uuid,role_id uuid,actor_user_id uuid,anchor_message_id bigint,action_name text,action_context jsonb,idempotency_key text unique,status text,queue_dispatch_status text,last_error text);
    create table talent_users(user_id uuid primary key,name text);
    create table career_email_messages(id uuid primary key,talent_id uuid,direction text,mail_type text,status text,from_email text,to_email text,occurred_at timestamptz default now(),metadata jsonb);
    create table org_intro_email_threads(id uuid primary key,outbound_message_id uuid,talent_id uuid,company_workspace_id uuid,role_id uuid,recommendation_id uuid,participant_emails text[],status text);
  `);
  const enqueue = readFileSync(new URL('../supabase/migrations/20261013111553_preserve_presented_candidates_and_intro_decisions.sql', import.meta.url), 'utf8').split('-- Existing company introductions')[0];
  await db.exec(enqueue);
  async function fixture() {
    const f = { thread: uuid(), outbound: uuid(), talent: uuid(), workspace: uuid(), role: uuid(), recommendation: uuid() };
    await db.query(`insert into company_roles values($1,$2)`,[f.role,f.workspace]);
    await db.query(`insert into company_user_workspace(company_user_id,company_workspace_id,authority) values($1,$2,'owner')`,[uuid(),f.workspace]);
    await db.query(`insert into talent_users values($1,'Fixture candidate')`,[f.talent]);
    await db.query(`insert into career_email_messages(id,talent_id,direction,status,to_email) values($1,$2,'outbound','sent','candidate@example.test')`,[f.outbound,f.talent]);
    await db.query(`insert into org_intro_email_threads values($1,$2,$3,$4,$5,$6,array['company@example.test','candidate@example.test'],'active')`,Object.values(f));
    return f;
  }
  async function reply(f, sender='candidate@example.test', key='orgIntroThreadId', id=uuid()) {
    await db.query(`insert into career_email_messages(id,talent_id,direction,mail_type,status,from_email,metadata)
      values($1,$2,'inbound','org_intro_reply','received',$3,$4) on conflict(id) do nothing`,
      [id,f.talent,sender,JSON.stringify({source:'org_intro_capture',[key]:f.thread})]);
    return id;
  }
  const jobs = async f => (await db.query(`select * from company_agent_web_action_jobs where company_workspace_id=$1`,[f.workspace])).rows;
  const historical = await fixture();
  await reply(historical);
  await db.exec(migration);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261015123928_intro_reply_nudge_facts.sql', import.meta.url), 'utf8'));
  await reply(historical,'candidate@example.test','threadId');
  assert.equal((await jobs(historical)).length,0,'historical first reply is not replayed');
  for (const key of ['orgIntroThreadId','threadId']) {
    const f=await fixture();
    await reply(f,'company@example.test',key);
    await reply(f,'outsider@example.test',key);
    assert.equal((await jobs(f)).length,0,'company and non-candidate replies do not notify');
    const id=await reply(f,' CANDIDATE@example.test ',key);
    await reply(f,'candidate@example.test',key,id);
    await reply(f,'candidate@example.test',key);
    const [job,...rest]=await jobs(f);
    assert.equal(rest.length,0);
    assert.equal(job.role_id,f.role);
    assert.equal(job.action_name,'company_update');
    assert.equal(job.last_error,'company_update_runtime_required');
    assert.equal(job.action_context.facts.emailMessageId,id);
    assert.equal(job.action_context.facts.talentId,f.talent);
    assert.equal(job.action_context.facts.companyMessageAlreadyDelivered,false);
    assert.equal(job.action_context.facts.companyMailboxDeliveryConfirmed,false);
    assert.equal(job.action_context.facts.replyBodyProvided,false);
    assert.equal(job.action_context.facts.candidateName,'Fixture candidate');
    assert.ok(!('body' in job.action_context.facts));
  }
  const closed=await fixture();
  await db.query(`update org_intro_email_threads set status='closed' where id=$1`,[closed.thread]);
  await reply(closed);
  assert.equal((await jobs(closed)).length,0);
  const broken=await fixture(), retryId=uuid();
  await db.query(`delete from company_roles where role_id=$1`,[broken.role]);
  await assert.rejects(reply(broken,undefined,undefined,retryId),/company_update_role_mismatch/);
  assert.equal((await db.query(`select id from career_email_messages where id=$1`,[retryId])).rows.length,0,'capture rolls back with enqueue failure');
  await db.query(`insert into company_roles values($1,$2)`,[broken.role,broken.workspace]);
  await reply(broken,undefined,undefined,retryId);
  assert.equal((await jobs(broken)).length,1,'retry preserves the first notification');
  assert.equal((await db.query(`select has_function_privilege('authenticated','public.enqueue_intro_first_reply_company_update_v1()','execute') as allowed`)).rows[0].allowed,false);
  console.log('PASS: both capture runtimes; first reply only; duplicate/retry; historical and company replies; role routing; atomic recovery; restricted execution');
} finally { await db.close(); }
