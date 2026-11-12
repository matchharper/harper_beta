import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../../../supabase/migrations/20261111113000_internal_hiring_notifications.sql", import.meta.url), "utf8");
const immediateMigration = readFileSync(new URL("../../../supabase/migrations/20261111120000_internal_hiring_immediate_dispatch.sql", import.meta.url), "utf8");

test("committed hiring facts capture one internal receipt per event without changing company facts", async () => {
  const db = new PGlite();
  const role = uuid(), talent = uuid(), company = uuid(), actor = uuid(), rec = uuid(), intro = uuid(), meeting = uuid();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table company_workspace(company_workspace_id uuid primary key,company_name text);
      create table company_roles(role_id uuid primary key,company_workspace_id uuid,name text,source_type text,information jsonb default '{}');
      create table talent_users(user_id uuid primary key,name text,email text);
      create table company_users(user_id uuid primary key,name text,email text);
      create table talent_progress(id uuid primary key default gen_random_uuid(),role_id uuid,talent_id uuid,company_user_id uuid,
        recommendation_id uuid,kind text,metadata jsonb default '{}',created_at timestamptz default now());
      create table company_intro_candidates(id uuid primary key,role_id uuid,talent_id uuid,recommendation_id uuid,
        requested_at timestamptz,requested_by_company_user_id uuid,candidate_sent_at timestamptz,talent_decision_at timestamptz,status text,close_reason text);
      create table career_email_messages(id uuid primary key,talent_id uuid,mail_type text,direction text,status text,metadata jsonb,occurred_at timestamptz default now());
      create table company_decision_events(id bigint generated always as identity,role_id uuid,subject_id uuid,subject_kind text,intro_candidate_id uuid,action text,actor_user_id uuid,channel text,created_at timestamptz default now());
      create table meeting_schedule_rounds(id uuid primary key,status text,submitted_at timestamptz,candidate_options jsonb);
      create table meeting_schedules(id uuid primary key,role_id uuid,talent_id uuid,organizer_company_user_id uuid,status text,
        active_round_id uuid,confirmed_start_at timestamptz,confirmed_end_at timestamptz,timezone text,version bigint default 1,source_refs jsonb default '{}',updated_at timestamptz default now());
    `);
    await db.query("insert into company_workspace values ($1,'Example VC')", [company]);
    await db.query("insert into company_roles(role_id,company_workspace_id,name,source_type) values ($1,$2,'Associate','internal')", [role, company]);
    await db.query("insert into talent_users values ($1,'Candidate','candidate@example.invalid')", [talent]);
    await db.query("insert into company_users values ($1,'Jay','jay@example.invalid')", [actor]);
    // Existing history is deliberately not replayed.
    await db.query("insert into talent_progress(role_id,talent_id,kind,metadata) values ($1,$2,'org_stage_change',$3)", [role,talent,JSON.stringify({previousStage:'pending_connection',stage:'process_stopped'})]);
    await db.exec(migration);
    // PGlite has no pg_net worker. Model its transactional HTTP queue only;
    // production's worker starts these requests after commit, not in the trigger.
    await db.exec(`create schema net;
      create table net.requests(id bigint generated always as identity,url text,body jsonb);
      create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 2000)
      returns bigint language sql as $$ insert into net.requests(url,body) values(url,body) returning id $$;
    `);
    await db.exec(immediateMigration.replace('create extension if not exists pg_net;', ''));
    const notices = async () => (await db.query<any>("select event_key,facts from internal_hiring_notifications order by created_at,id")).rows;
    assert.equal((await notices()).length,0);
    const progress = async (from:string,to:string,id=uuid()) => {
      await db.query("insert into talent_progress(id,role_id,talent_id,company_user_id,recommendation_id,kind,metadata) values ($1,$2,$3,$4,$5,'org_stage_change',$6) on conflict do nothing",
        [id,role,talent,actor,rec,JSON.stringify({previousStage:from,stage:to,notifyCandidateOnClosure:false,decisionChannel:'web'})]);
      return id;
    };
    const id=await progress('pending_connection','process_stopped');
    await progress('pending_connection','process_stopped',id);
    let ns=await notices();
    assert.equal(ns.length,1);
    assert.equal(ns[0].facts.action,'company_connection_declined');
    assert.equal(ns[0].facts.actor,'Jay');
    assert.equal(ns[0].facts.details.notifyCandidate,false);
    await progress('connected','process_stopped');
    await progress('pending_connection','connected');
    await progress('connected','connected');
    assert.equal((await notices()).length,3);
    await db.exec('begin'); await progress('pending_connection','connected'); await db.exec('rollback');
    assert.equal((await notices()).length,3,'rollback leaves no notification');
    assert.equal((await db.query<any>('select count(*)::int n from net.requests')).rows[0].n,3,'rollback and duplicate events do not dispatch');
    await db.query("insert into company_intro_candidates(id,role_id,talent_id,recommendation_id,status) values ($1,$2,$3,$4,'ready')",[intro,role,talent,rec]);
    await db.query("update company_intro_candidates set requested_at='2026-11-11T01:00Z',requested_by_company_user_id=$2,status='awaiting_talent' where id=$1",[intro,actor]);
    await db.query("update company_intro_candidates set requested_at=requested_at where id=$1",[intro]);
    assert.equal((await notices()).filter(n=>n.facts.action==='intro_requested').length,1);
    await db.query("update company_intro_candidates set candidate_sent_at='2026-11-11T01:01Z' where id=$1",[intro]);
    await db.query("update company_intro_candidates set talent_decision_at='2026-11-11T02:00Z',status='connecting' where id=$1",[intro]);
    await progress('pending_connection','connected');
    ns=await notices();
    assert.equal(ns.find(n=>n.facts.action==='candidate_intro_accepted').facts.actor,'Candidate(후보자)');
    assert.equal(ns.find(n=>n.facts.action==='intro_connected').facts.actor,'Harper 시스템');
    assert.equal(ns.find(n=>n.facts.action==='intro_connected').facts.actorEmail,null);
    await db.query("update company_intro_candidates set talent_decision_at='2026-11-11T03:00Z',status='closed',close_reason='talent_declined' where id=$1",[intro]);
    assert.equal((await notices()).filter(n=>n.facts.action==='candidate_intro_declined').length,1);
    const mail=uuid();
    await db.query("insert into career_email_messages values ($1,$2,'org_intro','outbound','queued',$3,now())",[mail,talent,JSON.stringify({roleId:role,companyUserName:'Jay'})]);
    assert.equal((await notices()).filter(n=>n.facts.action==='connection_email_sent').length,0);
    await db.query("update career_email_messages set status='sent',metadata=metadata||'{\"resendEmailId\":\"receipt\"}' where id=$1",[mail]);
    await db.query("update career_email_messages set status='sent' where id=$1",[mail]);
    assert.equal((await notices()).filter(n=>n.facts.action==='connection_email_sent').length,1);
    await db.query("insert into meeting_schedules(id,role_id,talent_id,organizer_company_user_id,status,timezone) values ($1,$2,$3,$4,'draft','Asia/Seoul')",[meeting,role,talent,actor]);
    await db.query("update meeting_schedules set status='confirmed',confirmed_start_at='2026-11-12T01:00Z',confirmed_end_at='2026-11-12T02:00Z',version=2,source_refs=$2 where id=$1",[meeting,JSON.stringify({calendarMutation:{operationKey:'confirm',actorLabel:'Candidate(후보자) — Harper 일정 조율 실행'}})]);
    await db.query("update meeting_schedules set confirmed_start_at='2026-11-12T03:00Z',version=3 where id=$1",[meeting]);
    ns=await notices();
    assert.equal(ns.find(n=>n.facts.action==='meeting_confirmed').facts.details.organizer,'Jay');
    assert.match(ns.find(n=>n.facts.action==='meeting_rescheduled').facts.actor,/변경자 미기록/,'never reuse the previous actor for another mutation');
    await db.query("update meeting_schedules set status='cancelled',version=4 where id=$1",[meeting]);
    await db.query("update meeting_schedules set status='cancelled' where id=$1",[meeting]);
    assert.equal((await notices()).filter(n=>n.facts.action==='meeting_cancelled').length,1);
    await db.query("insert into company_decision_events(role_id,subject_id,subject_kind,intro_candidate_id,action,actor_user_id,channel) values ($1,$2,'member_candidate',$3,'pass',$4,'web')",[role,talent,intro,actor]);
    assert.equal((await notices()).filter(n=>n.facts.action==='company_intro_passed').length,1);
    const booked=uuid(),round=uuid();
    await db.query("insert into meeting_schedules(id,role_id,talent_id,status,active_round_id,timezone) values ($1,$2,$3,'awaiting_talent',$4,'Asia/Seoul')",[booked,role,talent,round]);
    await db.exec('begin');
    await db.query("insert into meeting_schedule_rounds values ($1,'confirmed',now(),'[{}]')",[round]);
    await db.query("update meeting_schedules set status='confirmed',confirmed_start_at='2026-11-13T01:00Z',version=2,updated_at=now() where id=$1",[booked]);
    await db.exec('commit');
    assert.ok((await notices()).some(n=>n.facts.actor==='Candidate(후보자·예약 링크 제출)'));
    const before=(await notices()).length;
    await db.query("update company_roles set information='{\"testOnly\":true}' where role_id=$1",[role]);
    await progress('pending_connection','connected');
    assert.equal((await notices()).length,before,'test fixtures never reach internal operations Slack');
    const acl=(await db.query<any>(`select has_table_privilege('anon','internal_hiring_notifications','select') as anon,
      has_table_privilege('authenticated','internal_hiring_notifications','insert') as authenticated,
      has_function_privilege('authenticated','record_internal_hiring_notification(text,uuid,uuid,text,uuid,text,jsonb,timestamptz)','execute') as callable`)).rows[0];
    assert.deepEqual(acl,{anon:false,authenticated:false,callable:false});
    const requests=(await db.query<any>(`select n.dispatch_request_id,r.url,r.body,n.id,n.dispatch_token
      from internal_hiring_notifications n join net.requests r on r.id=n.dispatch_request_id`)).rows;
    assert.equal(requests.length,before,'each committed event immediately queues its own request');
    for(const request of requests) {
      assert.equal(request.url,'https://matchharper.com/api/internal/slack/hiring-notification');
      assert.deepEqual(request.body,{id:request.id,token:request.dispatch_token});
    }
    await db.query("update company_roles set information='{}' where role_id=$1",[role]);
    await db.exec(`create or replace function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 2000)
      returns bigint language plpgsql as $$ begin raise exception 'network queue unavailable'; end $$;`);
    const failed=await progress('pending_connection','process_stopped');
    const pending=(await db.query<any>("select sent_at,last_error from internal_hiring_notifications where event_key=$1",['progress:'+failed])).rows[0];
    assert.equal(pending.sent_at,null);
    assert.equal(pending.last_error,'immediate_dispatch_enqueue_failed','failed immediate dispatch remains available for recovery');
  } finally { await db.close(); }
});
