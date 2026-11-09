import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const user = "00000000-0000-4000-8000-000000000001", conversation = "00000000-0000-4000-8000-000000000002";
const run = "00000000-0000-4000-8000-000000000003", child = "00000000-0000-4000-8000-000000000004";
async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table talent_users(user_id uuid primary key);
    create table talent_setting(user_id uuid primary key,is_onboarding_done boolean,updated_at timestamptz);
    create table talent_conversations(id uuid primary key,user_id uuid);
    create table talent_messages(id bigserial primary key,user_id uuid,conversation_id uuid,role text,message_type text,content text,payload jsonb);
    create table talent_agent_runtime(conversation_id uuid primary key,user_id uuid,state jsonb);
    create table opportunity_discovery_run(id uuid primary key default gen_random_uuid(),talent_id uuid,conversation_id uuid,status text,trigger text,run_mode text,dedupe_key text,target_recommendation_count integer,lease_token text,lease_heartbeat_at timestamptz,created_at timestamptz default now(),updated_at timestamptz,completed_at timestamptz,trigger_payload jsonb default '{}',error_message text,coverage jsonb default '{}');
    create table talent_opportunity_delivery(id uuid primary key default gen_random_uuid(),talent_id uuid,discovery_run_id uuid,channel text,status text,payload jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now(),sent_at timestamptz,error_message text);
    create table career_email_messages(id uuid primary key,talent_id uuid,talent_message_id bigint,direction text,mail_type text,status text,from_email text,to_email text,subject text,body_text text,occurred_at timestamptz,metadata jsonb);
    create table external_recommendation_runs(id uuid primary key,talent_id uuid,status text);
    create table talent_progress(metadata jsonb);
    create table company_talent_followups(id uuid,status text,delivery_run_id uuid,updated_at timestamptz);
    create table meeting_schedules(id uuid primary key,talent_id uuid,version bigint);
    create function record_company_followup_event_v1(uuid,text,jsonb) returns void language sql as $$select$$;
  `);
  await db.exec(await readFile("supabase/migrations/20261029215555_career_background_agent_delivery.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20261102084400_career_meeting_delivery_admission.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20261108120000_career_onboarding_direct_continuation.sql", "utf8"));
  await db.query("insert into talent_users values($1)", [user]);
  await db.query("insert into talent_conversations values($1,$2)", [conversation,user]);
  await db.query("insert into talent_messages(user_id,conversation_id,role,content) values($1,$2,'user','원래 요청')",[user,conversation]);
  await db.query("insert into opportunity_discovery_run(id,talent_id,conversation_id,status,trigger,lease_token,trigger_payload) values($1,$2,$3,'running','career_schedule','worker-lease','{\"runContract\":\"career_agent_v1\"}')",[run,user,conversation]);
  return db;
}
async function accepted(db: PGlite) {
  return (await db.query<any>("select accept_career_agent_run($1,'worker-lease',$2) r",[run,conversation])).rows[0].r;
}
async function claim(db:PGlite,reply:string) {
  await db.query("insert into talent_agent_runtime values($1,$2,$3) on conflict(conversation_id) do update set state=excluded.state",[conversation,user,{completedSequence:5,handbooks:[{id:"resume",remainingReplies:2}],activeReply:{replyId:reply,claimId:"agent-claim",expiresAt:new Date(Date.now()+60000).toISOString()},checkpoints:{other:{replyId:"other"}}}]);
}

test("an appointment changed after preflight blocks provider admission", async () => {
  const db = await database();
  try {
    const { delivery } = await prepared(db);
    await db.query("insert into meeting_schedules values($1,$2,1)", [child, user]);
    await db.query("update talent_opportunity_delivery set payload=payload||$2 where id=$1", [delivery.id, {meetingScheduleVersions:{[child]:1}}]);
    await db.query("select claim_career_agent_email($1,'sender')", [delivery.id]);
    await db.query("update meeting_schedules set version=2 where id=$1", [child]);
    const result = (await db.query<any>("select begin_career_agent_email_attempt($1,'sender') allowed", [delivery.id])).rows[0];
    assert.equal(result.allowed, false);
    const row = (await db.query<any>("select status,payload from talent_opportunity_delivery where id=$1", [delivery.id])).rows[0];
    assert.equal(row.status, 'context_changed');
    assert.equal(row.payload.firstProviderAttemptAt, undefined);
  } finally { await db.close(); }
});

test("worker handoff is owned, idempotent and preserves a real message cursor",async()=>{
  const db=await database();try {
    await assert.rejects(()=>db.query("select accept_career_agent_run($1,'wrong',$2)",[run,conversation]),/Worker lease lost/);
    const receipt=await accepted(db);assert.equal(receipt.status,"handed_off");assert.equal(receipt.lease_token,null);
    assert.equal(receipt.trigger_payload.agentInvocation.sourceMessageCursor,1);
    assert.equal((await accepted(db)).trigger_payload.agentInvocation.replyId,`background:${run}`);
    assert.equal((await db.query<any>("select count(*) count from talent_messages")).rows[0].count,1);
  }finally{await db.close();}
});

test("no-send completion clears only its checkpoint and never consumes chat handbook leases",async()=>{
  const db=await database();try {
    const receipt=await accepted(db),reply=receipt.trigger_payload.agentInvocation.replyId;await claim(db,reply);
    assert.equal((await db.query<any>("select finish_career_background_reply($1,$2,$3,'agent-claim',$4) done",[user,conversation,reply,run])).rows[0].done,true);
    const state=(await db.query<any>("select state from talent_agent_runtime")).rows[0].state;
    assert.equal(state.completedSequence,5);assert.equal(state.handbooks[0].remainingReplies,2);assert.ok(state.checkpoints.other);
    assert.equal((await db.query<any>("select coverage from opportunity_discovery_run where id=$1",[run])).rows[0].coverage.agentOutcome,"no_send");
  }finally{await db.close();}
});

test("sealed outbox retries preserve exact content, serialize sends and record history once",async()=>{
  const db=await database();try {
    const receipt=await accepted(db),reply=receipt.trigger_payload.agentInvocation.replyId;await claim(db,reply);
    const payload={emailPayload:{to:"test@example.invalid",from:"Harper <test@example.invalid>",subject:"원래 제목",text:"원래 본문",replyTo:"reply@example.invalid"},bodyMarkdown:"원래 본문"};
    const reserve=async(body:any)=>(await db.query<any>("select reserve_career_agent_email($1,$2,$3,$4,'agent-claim',$5) r",[user,conversation,run,reply,body])).rows[0].r;
    const first=await reserve(payload),duplicate=await reserve({...payload,bodyMarkdown:"다른 본문"});
    assert.equal(duplicate.id,first.id);assert.equal(duplicate.payload.bodyMarkdown,"원래 본문");
    assert.equal((await db.query<any>("select claim_career_agent_email($1,'sender-a') r",[first.id])).rows[0].r.status,"sending");
    assert.equal((await db.query<any>("select claim_career_agent_email($1,'sender-b') r",[first.id])).rows[0].r,null);
    await db.query("update talent_opportunity_delivery set payload=payload||'{\"resendEmailId\":\"provider-receipt\"}' where id=$1",[first.id]);
    await db.query("select finish_career_agent_email($1)",[first.id]);await db.query("select finish_career_agent_email($1)",[first.id]);
    assert.equal((await db.query<any>("select count(*) count from career_email_messages")).rows[0].count,1);
    assert.equal((await db.query<any>("select count(*) count from talent_messages where role='assistant'")).rows[0].count,1);
    assert.equal((await db.query<any>("select payload from talent_opportunity_delivery")).rows[0].payload.emailPayload.subject,"원래 제목");
  }finally{await db.close();}
});

test("waiting checkpoints are recovered only after the child is terminal, including background and email",async()=>{
  const db=await database();try {
    await db.query("insert into external_recommendation_runs values($1,$2,'queued')",[child,user]);
    const checkpoint={replyId:"waiting",checkpointId:"saved",waitFor:[{kind:"external_evaluation",id:child}],continuation:{channel:"background",backgroundRunId:run}};
    await db.query("insert into talent_agent_runtime values($1,$2,$3)",[conversation,user,{checkpoints:{waiting:checkpoint}}]);
    assert.equal((await db.query("select * from claim_career_agent_checkpoint_recovery()")).rows.length,0);
    await db.query("update external_recommendation_runs set status='partial' where id=$1",[child]);
    const recovered=(await db.query<any>("select * from claim_career_agent_checkpoint_recovery()")).rows;
    assert.equal(recovered.length,1);assert.deepEqual(recovered[0].checkpoint,checkpoint);
    assert.equal((await db.query("select * from claim_career_agent_checkpoint_recovery()")).rows.length,0);
  }finally{await db.close();}
});

test("onboarding completion and its single invocation are committed together",async()=>{
  const db=await database();try {
    const first=(await db.query<any>("select enqueue_career_onboarding_continuation($1,$2,'{}') r",[user,conversation])).rows[0].r;
    const retry=(await db.query<any>("select enqueue_career_onboarding_continuation($1,$2,'{}') r",[user,conversation])).rows[0].r;
    assert.equal(first.id,retry.id);assert.equal(first.trigger_payload.runContract,"career_agent_v1");
    assert.equal(first.status, "handed_off");
    assert.equal(first.lease_token, null);
    assert.equal(first.trigger_payload.agentInvocation.replyId, `background:${first.id}`);
    assert.equal(first.trigger_payload.agentInvocation.sourceMessageCursor, 1);
    const children = (await db.query<any>("select * from opportunity_discovery_run where trigger='onboarding_internal_evaluation'")).rows;
    assert.equal(children.length, 1);
    assert.equal(children[0].trigger_payload.onboardingRunId, first.id);
    await assert.rejects(() => db.query("select enqueue_career_onboarding_continuation($1,$2,'{}')", [child,conversation]), /Conversation unavailable/);
    await claim(db, first.trigger_payload.agentInvocation.replyId);
    assert.equal((await db.query<any>("select finish_career_background_reply($1,$2,$3,'agent-claim',$4) done", [user,conversation,first.trigger_payload.agentInvocation.replyId,first.id])).rows[0].done, true);

    assert.equal((await db.query<any>("select is_onboarding_done from talent_setting")).rows[0].is_onboarding_done,true);
  }finally{await db.close();}
});

test("changed-context email resumes its parent and only explicit retry reuses the sealed body",async()=>{
  const db=await database();try {
    const receipt=await accepted(db),reply=receipt.trigger_payload.agentInvocation.replyId;await claim(db,reply);
    const payload={emailPayload:{to:"test@example.invalid",subject:"원래 제목",text:"원래 본문",idempotencyKey:"fixed"},bodyMarkdown:"원래 본문",sourceMessageCursor:1};
    const mail=(await db.query<any>("select reserve_career_agent_email($1,$2,$3,$4,'agent-claim',$5) r",[user,conversation,run,reply,payload])).rows[0].r;
    const checkpoint={waitFor:[{kind:"email_delivery",id:mail.id}]};
    assert.equal((await db.query<any>("select career_checkpoint_work_ready($1,$2) ready",[user,checkpoint])).rows[0].ready,false);
    await db.query("update talent_opportunity_delivery set status='context_changed' where id=$1",[mail.id]);
    assert.equal((await db.query<any>("select career_checkpoint_work_ready($1,$2) ready",[user,checkpoint])).rows[0].ready,true);
    const control=async(action:string)=>(await db.query<any>("select control_career_agent_email($1,$2,$3,$4,'agent-claim',$5,44) r",[user,conversation,run,reply,action])).rows[0].r;
    assert.equal((await control('read')).status,'context_changed');
    const retry=await control('retry');assert.equal(retry.status,'retry');assert.equal(retry.payload.sourceMessageCursor,44);assert.equal(retry.payload.bodyMarkdown,'원래 본문');
    assert.equal(retry.payload.emailPayload.idempotencyKey,'fixed');
    await db.query("select claim_career_agent_email($1,'sender')",[mail.id]);
    const cancel=await control('cancel');assert.equal(cancel.status,'sending');assert.equal(cancel.payload.cancelRequested,true);
    await db.query("update talent_opportunity_delivery set payload=jsonb_set(payload,'{claimExpiresAt}',to_jsonb(now()-interval '1 minute')) where id=$1",[mail.id]);
    assert.equal((await db.query<any>("select claim_career_agent_email($1,'next-sender') r",[mail.id])).rows[0].r.status,'cancelled');
  }finally{await db.close();}
});

test("source cancellation retires only its exact background checkpoint and cannot be completed again",async()=>{
  const db=await database();try {
    const receipt=await accepted(db),reply=receipt.trigger_payload.agentInvocation.replyId;await claim(db,reply);
    await db.query("update talent_agent_runtime set state=jsonb_set(state,array['checkpoints',$1],$2)",[reply,{replyId:reply,checkpointId:"old"}]);
    await db.query("select cancel_career_background_run($1,'Source cancelled')",[run]);
    const state=(await db.query<any>("select state from talent_agent_runtime")).rows[0].state;
    assert.ok(state.checkpoints.other);assert.equal(state.checkpoints[reply],undefined);assert.equal(state.activeReply,null);assert.equal(state.completedSequence,5);
    await db.query("select finish_career_background_reply($1,$2,$3,'agent-claim',$4)",[user,conversation,reply,run]);
    assert.equal((await db.query<any>("select status from opportunity_discovery_run where id=$1",[run])).rows[0].status,'cancelled');
  }finally{await db.close();}
});

async function prepared(db: PGlite) {
  const receipt = await accepted(db), reply = receipt.trigger_payload.agentInvocation.replyId;
  await claim(db, reply);
  const payload = { emailPayload: { to: 'test@example.invalid', subject: '원래 제목', text: '원래 본문', idempotencyKey: `career-agent/${run}` }, bodyMarkdown: '원래 본문', sourceMessageCursor: 1 };
  const delivery = (await db.query<any>("select reserve_career_agent_email($1,$2,$3,$4,'agent-claim',$5) r", [user, conversation, run, reply, payload])).rows[0].r;
  return { reply, delivery };
}

test('preflight claims do not start the provider window and old actual attempts become unknown without resending', async () => {
  const db = await database(); try {
    const { delivery } = await prepared(db);
    const first = (await db.query<any>("select claim_career_agent_email($1,'sender-a') r", [delivery.id])).rows[0].r;
    assert.equal(first.payload.firstProviderAttemptAt, undefined);
    await db.query("update talent_opportunity_delivery set created_at=now()-interval '2 days',payload=jsonb_set(payload,'{claimExpiresAt}',to_jsonb(now()-interval '1 minute')) where id=$1", [delivery.id]);
    const second = (await db.query<any>("select claim_career_agent_email($1,'sender-b') r", [delivery.id])).rows[0].r;
    assert.equal(second.status, 'sending'); assert.equal(second.payload.firstProviderAttemptAt, undefined);
    assert.equal((await db.query<any>("select begin_career_agent_email_attempt($1,'sender-a') allowed", [delivery.id])).rows[0].allowed, false);
    assert.equal((await db.query<any>("select begin_career_agent_email_attempt($1,'sender-b') allowed", [delivery.id])).rows[0].allowed, true);
    await db.query("update talent_opportunity_delivery set status='retry',payload=payload||jsonb_build_object('firstProviderAttemptAt',now()-interval '25 hours') where id=$1", [delivery.id]);
    assert.equal((await db.query<any>("select claim_career_agent_email($1,'sender-c') r", [delivery.id])).rows[0].r.status, 'delivery_unknown');
  } finally { await db.close(); }
});

test('an irreversible receipt survives cancellation and stale sender ownership without changing the sealed content', async () => {
  const db = await database(); try {
    const { reply, delivery } = await prepared(db);
    await db.query("select claim_career_agent_email($1,'old-sender')", [delivery.id]);
    await db.query("select begin_career_agent_email_attempt($1,'old-sender')", [delivery.id]);
    await db.query("select control_career_agent_email($1,$2,$3,$4,'agent-claim','cancel',1)", [user, conversation, run, reply]);
    await db.query("update talent_opportunity_delivery set status='cancelled',payload=payload||'{\"claimId\":\"new-sender\"}' where id=$1", [delivery.id]);
    await assert.rejects(db.query("select record_career_agent_email_receipt($1,'wrong-key','provider-id')", [delivery.id]), /Sealed delivery unavailable/);
    const recorded = (await db.query<any>('select record_career_agent_email_receipt($1,$2,$3) r', [delivery.id, `career-agent/${run}`, 'provider-id'])).rows[0].r;
    assert.equal(recorded.status, 'sent'); assert.equal(recorded.payload.cancelRequested, true);
    assert.equal(recorded.payload.claimId, 'new-sender'); assert.equal(recorded.payload.bodyMarkdown, '원래 본문');
    await db.query('select finish_career_agent_email($1)', [delivery.id]);
    await db.query('select record_career_agent_email_receipt($1,$2,$3)', [delivery.id, `career-agent/${run}`, 'provider-id']);
    await db.query('select finish_career_agent_email($1)', [delivery.id]);
    assert.equal((await db.query<any>('select count(*) count from career_email_messages')).rows[0].count, 1);
    await assert.rejects(db.query('select record_career_agent_email_receipt($1,$2,$3)', [delivery.id, `career-agent/${run}`, 'different-provider-id']), /Provider receipt conflict/);
    const current = (await db.query<any>('select sent_at from talent_opportunity_delivery where id=$1', [delivery.id])).rows[0];
    assert.equal(new Date(current.sent_at).toISOString(), new Date(recorded.sent_at).toISOString());
  } finally { await db.close(); }
});

test('send claims serialize one candidate across runs while allowing another candidate', async () => {
  const db = await database(); try {
    const { delivery } = await prepared(db);
    const sibling = (await db.query<any>("insert into talent_opportunity_delivery(talent_id,discovery_run_id,channel,status,payload) values($1,$2,'email','queued','{\"runContract\":\"career_agent_v1\"}') returning id", [user, child])).rows[0].id;
    const stranger = (await db.query<any>("insert into talent_opportunity_delivery(talent_id,discovery_run_id,channel,status,payload) values($1,gen_random_uuid(),'email','queued','{\"runContract\":\"career_agent_v1\"}') returning id", [child])).rows[0].id;
    assert.equal((await db.query<any>("select claim_career_agent_email($1,'first') r", [delivery.id])).rows[0].r.status, 'sending');
    assert.equal((await db.query<any>("select claim_career_agent_email($1,'sibling') r", [sibling])).rows[0].r, null);
    assert.equal((await db.query<any>("select claim_career_agent_email($1,'stranger') r", [stranger])).rows[0].r.status, 'sending');
    await db.query("update talent_opportunity_delivery set payload=jsonb_set(payload,'{claimExpiresAt}',to_jsonb(now()-interval '1 minute')) where id=$1", [delivery.id]);
    assert.equal((await db.query<any>("select claim_career_agent_email($1,'sibling') r", [sibling])).rows[0].r.status, 'sending');
    assert.equal((await db.query<any>("select begin_career_agent_email_attempt($1,'first') allowed", [delivery.id])).rows[0].allowed, false);
  } finally { await db.close(); }
});

test('foreign identities, wrong claims, and expired reply leases cannot reserve or control email', async () => {
  const db = await database(); try {
    const { reply } = await prepared(db);
    const reserve = (u: string, c: string, r: string, activeClaim: string) => db.query('select reserve_career_agent_email($1,$2,$3,$4,$5,$6)', [u, c, r, reply, activeClaim, {}]);
    await assert.rejects(reserve(child, conversation, run, 'agent-claim'), /invocation unavailable/);
    await assert.rejects(reserve(user, child, run, 'agent-claim'), /invocation unavailable/);
    await assert.rejects(reserve(user, conversation, child, 'agent-claim'), /invocation unavailable/);
    await assert.rejects(reserve(user, conversation, run, 'wrong-claim'), /lease lost/);
    await db.query("update talent_agent_runtime set state=jsonb_set(state,'{activeReply,expiresAt}',to_jsonb(now()-interval '1 minute'))");
    await assert.rejects(reserve(user, conversation, run, 'agent-claim'), /lease lost/);
    await assert.rejects(db.query("select control_career_agent_email($1,$2,$3,$4,'agent-claim','cancel',1)", [user, conversation, run, reply]), /lease lost/);
    assert.equal((await db.query<any>("select finish_career_background_reply($1,$2,$3,'agent-claim',$4) done", [user, conversation, reply, run])).rows[0].done, false);
    assert.equal((await db.query<any>('select status from opportunity_discovery_run where id=$1', [run])).rows[0].status, 'handed_off');
    const privileges = (await db.query<any>("select has_function_privilege('authenticated','record_career_agent_email_receipt(uuid,text,text)','execute') receipt,has_function_privilege('anon','begin_career_agent_email_attempt(uuid,text)','execute') attempt")).rows[0];
    assert.equal(privileges.receipt, false); assert.equal(privileges.attempt, false);
  } finally { await db.close(); }
});

test('completion preserves unrelated legacy checkpoints and reports a cancelled receipt as cancelled', async () => {
  const db = await database(); try {
    const { reply, delivery } = await prepared(db);
    await db.query("update talent_agent_runtime set state=state||'{\"checkpoint\":{\"replyId\":\"another-reply\",\"saved\":true}}'");
    await db.query("select control_career_agent_email($1,$2,$3,$4,'agent-claim','cancel',1)", [user, conversation, run, reply]);
    assert.equal((await db.query<any>('select status from talent_opportunity_delivery where id=$1', [delivery.id])).rows[0].status, 'cancelled');
    await db.query("select finish_career_background_reply($1,$2,$3,'agent-claim',$4)", [user, conversation, reply, run]);
    const runtime = (await db.query<any>('select state from talent_agent_runtime')).rows[0].state;
    assert.equal(runtime.checkpoint.replyId, 'another-reply'); assert.ok(runtime.checkpoints.other);
    assert.equal((await db.query<any>('select coverage from opportunity_discovery_run where id=$1', [run])).rows[0].coverage.agentOutcome, 'cancelled');
  } finally { await db.close(); }
});

test('a message committed after preflight still prevents provider admission without starting its retry window', async () => {
  const db = await database(); try {
    const { delivery } = await prepared(db);
    await db.query("select claim_career_agent_email($1,'sender')", [delivery.id]);
    await db.query("insert into talent_messages(user_id,conversation_id,role,content) values($1,$2,'user','오늘은 보내지 마')", [user, conversation]);
    assert.equal((await db.query<any>("select begin_career_agent_email_attempt($1,'sender') allowed", [delivery.id])).rows[0].allowed, false);
    const current = (await db.query<any>('select status,payload from talent_opportunity_delivery where id=$1', [delivery.id])).rows[0];
    assert.equal(current.status, 'context_changed'); assert.equal(current.payload.firstProviderAttemptAt, undefined);
    assert.equal(current.payload.emailPayload.text, '원래 본문');
  } finally { await db.close(); }
});

test('audit failure rolls back secondary history but preserves the separately committed provider receipt', async () => {
  const db = await database(); try {
    const { delivery } = await prepared(db);
    await db.query("update opportunity_discovery_run set trigger_payload=trigger_payload||jsonb_build_object('companyRequestFollowups',jsonb_build_array(jsonb_build_object('followupId',$1::text))) where id=$2", [child, run]);
    await db.query("insert into company_talent_followups(id,status,delivery_run_id) values($1,'pending',$2)", [child, run]);
    await db.exec("create or replace function record_company_followup_event_v1(uuid,text,jsonb) returns void language plpgsql as $$begin raise exception 'Audit unavailable'; end$$");
    await db.query('select record_career_agent_email_receipt($1,$2,$3)', [delivery.id, `career-agent/${run}`, 'committed-provider-id']);
    await assert.rejects(db.query('select finish_career_agent_email($1)', [delivery.id]), /Audit unavailable/);
    const saved = (await db.query<any>('select status,payload from talent_opportunity_delivery where id=$1', [delivery.id])).rows[0];
    assert.equal(saved.status, 'sent'); assert.equal(saved.payload.resendEmailId, 'committed-provider-id');
    assert.equal((await db.query<any>('select count(*) count from career_email_messages')).rows[0].count, 0);
    await db.exec("create or replace function record_company_followup_event_v1(uuid,text,jsonb) returns void language sql as $$insert into public.talent_progress(metadata) values($3||jsonb_build_object('followupId',$1,'eventType',$2))$$");
    await db.query('select finish_career_agent_email($1)', [delivery.id]);
    await db.query('select finish_career_agent_email($1)', [delivery.id]);
    assert.equal((await db.query<any>('select count(*) count from career_email_messages')).rows[0].count, 1);
    assert.equal((await db.query<any>('select count(*) count from talent_progress')).rows[0].count, 1);
    assert.equal((await db.query<any>('select status from company_talent_followups where id=$1', [child])).rows[0].status, 'delivered');
  } finally { await db.close(); }
});


test("DB-first rollout preserves deployed Worker admission and never reowns an existing run", async () => {
  const db = await database();
  try {
    const before = (await db.query<any>("select pg_get_functiondef('enqueue_career_onboarding_invocation(uuid,uuid,jsonb)'::regprocedure) definition")).rows[0].definition;
    await db.exec(await readFile("supabase/migrations/20261108120000_career_onboarding_direct_continuation.sql", "utf8"));
    const after = (await db.query<any>("select pg_get_functiondef('enqueue_career_onboarding_invocation(uuid,uuid,jsonb)'::regprocedure) definition")).rows[0].definition;
    assert.equal(after, before);
    const legacy = (await db.query<any>("select enqueue_career_onboarding_invocation($1,$2,'{}') r", [user,conversation])).rows[0].r;
    assert.equal(legacy.status, "queued");
    const retry = (await db.query<any>("select enqueue_career_onboarding_continuation($1,$2,'{}') r", [user,conversation])).rows[0].r;
    assert.equal(retry.id, legacy.id);
    assert.equal(retry.status, "queued");
    assert.equal((await db.query<any>("select count(*)::int n from opportunity_discovery_run where trigger='conversation_completed'")).rows[0].n, 1);
    for (const role of ["anon", "authenticated"]) {
      const permission = (await db.query<any>("select has_function_privilege($1,'enqueue_career_onboarding_continuation(uuid,uuid,jsonb)','EXECUTE') allowed", [role])).rows[0];
      assert.equal(permission.allowed, false);
    }
    assert.equal((await db.query<any>("select has_function_privilege('service_role','enqueue_career_onboarding_continuation(uuid,uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed, true);
  } finally { await db.close(); }
});
