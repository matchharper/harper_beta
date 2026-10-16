// Isolated PostgreSQL: actual event producer and durable enqueue RPC, no external effects.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,name text);
    create table company_user_workspace(id bigserial,company_user_id uuid,company_workspace_id uuid,authority text);
    create table company_conversations(id uuid default gen_random_uuid(),company_workspace_id uuid,role_id uuid,metadata jsonb,unique(company_workspace_id,role_id));
    create table company_messages(id bigserial,company_workspace_id uuid,conversation_id uuid,role_id uuid,company_user_id uuid,role text,content text,message_type text,status text,metadata jsonb);
    create table company_agent_web_action_jobs(id uuid primary key,company_workspace_id uuid,conversation_id uuid,role_id uuid,actor_user_id uuid,anchor_message_id bigint,action_name text,action_context jsonb,idempotency_key text unique,status text,queue_dispatch_status text,last_error text);
    create table talent_users(user_id uuid primary key,name text);
    create table talent_progress(id bigserial,talent_id uuid,role_id uuid,recommendation_id uuid,kind text,text text,metadata jsonb,open_to_company boolean,open_to_talent boolean,created_at timestamptz default now());
    create table company_intro_candidates(id uuid primary key,company_workspace_id uuid,role_id uuid,talent_id uuid,recommendation_id uuid,status text,close_reason text,talent_decision_at timestamptz,requested_at timestamptz,candidate_sent_at timestamptz,connected_at timestamptz);
  `);
  const prior = readFileSync(new URL('../supabase/migrations/20261013111553_preserve_presented_candidates_and_intro_decisions.sql', import.meta.url), 'utf8');
  await db.exec(prior.split('-- Existing company introductions')[0]);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261015125604_company_intro_connection_update.sql', import.meta.url), 'utf8'));
  await db.exec(`create trigger company_intro_decision_progress after update of status,close_reason,talent_decision_at on company_intro_candidates for each row execute function record_company_intro_decision_progress_v1()`);
  async function fixture() {
    const f={intro:uuid(),workspace:uuid(),role:uuid(),talent:uuid(),recommendation:uuid()};
    await db.query(`insert into company_roles values($1,$2,'Backend Engineer')`,[f.role,f.workspace]);
    await db.query(`insert into company_user_workspace(company_user_id,company_workspace_id,authority) values($1,$2,'owner')`,[uuid(),f.workspace]);
    await db.query(`insert into talent_users values($1,'Daniel Park')`,[f.talent]);
    await db.query(`insert into company_intro_candidates(id,company_workspace_id,role_id,talent_id,recommendation_id,status,requested_at,candidate_sent_at) values($1,$2,$3,$4,$5,'awaiting_talent','2026-09-22T01:00Z','2026-09-22T02:00Z')`,Object.values(f));
    return f;
  }
  const jobs=async f=>(await db.query(`select * from company_agent_web_action_jobs where company_workspace_id=$1`,[f.workspace])).rows;
  const accept=async f=>db.query(`update company_intro_candidates set status='connecting',talent_decision_at='2026-09-24T03:00Z' where id=$1`,[f.intro]);
  const connect=async f=>db.query(`update company_intro_candidates set status='connected',connected_at='2026-09-24T03:01Z' where id=$1`,[f.intro]);
  const f=await fixture(); await accept(f);
  assert.equal((await jobs(f)).length,0,'acceptance waits for connection before the company announcement');
  assert.equal((await db.query(`select * from talent_progress where talent_id=$1`,[f.talent])).rows.length,1,'acceptance history is immediate');
  await db.query(`insert into talent_progress(talent_id,role_id,recommendation_id,kind,metadata) values($1,$2,$3,'org_stage_change',$4)`,[f.talent,f.role,f.recommendation,JSON.stringify({workspaceId:f.workspace,introEmailMessageId:'email-receipt'})]);
  await connect(f); await connect(f);
  const [job,...rest]=await jobs(f); assert.equal(rest.length,0);
  assert.equal(job.action_context.facts.introductionEmailSent,true);
  assert.equal(new Date(job.action_context.facts.candidateReceivedIntroAt).toISOString(),'2026-09-22T02:00:00.000Z');
  assert.equal(new Date(job.action_context.facts.connectedAt).toISOString(),'2026-09-24T03:01:00.000Z');
  assert.equal(job.action_context.facts.roleId,f.role);
  assert.equal(job.action_context.facts.recommendationId,f.recommendation);
  assert.equal(job.last_error,'company_update_runtime_required');
  const noReceipt=await fixture(); await accept(noReceipt); await connect(noReceipt);
  assert.equal((await jobs(noReceipt))[0].action_context.facts.introductionEmailSent,false,'connection status alone is not an email receipt');
  const declined=await fixture();
  await db.query(`update company_intro_candidates set status='closed',close_reason='talent_declined',talent_decision_at=now() where id=$1`,[declined.intro]);
  assert.equal((await jobs(declined))[0].action_context.facts.candidateDecision,'declined');
  assert.equal((await db.query(`select has_function_privilege('authenticated','public.record_company_intro_decision_progress_v1()','execute') as allowed`)).rows[0].allowed,false);
  console.log('PASS: acceptance history; completion-only event; email receipt; exact identity/timing; duplicate completion; decline preserved; restricted execution');
} finally { await db.close(); }
