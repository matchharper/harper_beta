import assert from "node:assert/strict";
import test from "node:test";
import { setupDaily as fixture, rec } from "./dailyTestSupport";
import {
  owner,
  other,
  role,
  roleTwo,
  write,
  localAdmin,
} from "./testSupport";
import {
  collectCareerProcessing,
  planCareerProcessing,
  type ProcessingCandidate,
} from "./daily";

const now = new Date("2030-01-10T09:00:00+09:00");
const collect = (db: any, time = now, limit = 100) => {
  const admin = localAdmin(db);
  const rpc = admin.rpc;
  admin.rpc = (name: string, args: Record<string, any>) =>
    rpc(name, {
      ...args,
      ...(args.p_sources ? { p_sources: `{${args.p_sources.join(",")}}` } : {}),
    });
  return collectCareerProcessing({ admin, now: time, limit });
};
const queryOne = async (db: any, sql: string) => (await db.query(sql)).rows[0];
async function closure(db: any) {
  await db.exec(
    `insert into talent_progress(talent_id,role_id,recommendation_id,kind,metadata) values('${owner}','${role}','${rec}','org_stage_change','{"stage":"process_stopped","notifyCandidateOnClosure":true}');`
  );
}
async function schedule(
  db: any,
  next: string,
  flexible = false,
  talent = owner
) {
  return write(
    db,
    {
      action: "create",
      title: "Actual delegated work",
      instruction: "Do the requested work",
      timezone: "Asia/Seoul",
      next_run_at: next,
      target_refs: { flexibleTiming: flexible },
    },
    crypto.randomUUID(),
    talent
  );
}

test("idle users including stopped make no runs; three real sources become one invocation", async () => {
  const db = await fixture();
  try {
    assert.deepEqual((await collect(db)).runIds, []);
    await closure(db);
    await db.exec(`update company_roles set status='ended' where role_id='${role}';
      insert into talent_opportunity_matching_review(talent_id,opportunity_id,decision) values('${owner}','${roleTwo}','candidate_first');`);
    const runs = await collect(db);
    assert.equal(runs.runIds.length, 1);
    const run = await queryOne(db, "select * from opportunity_discovery_run");
    assert.equal(run.trigger_payload.sourceEvents.length, 3);
    assert.equal(run.trigger_payload.dailyBatchDate, "2030-01-10");
    assert.equal((await collect(db)).runIds.length, 0);
    await db.exec(
      "update opportunity_discovery_run set status='completed'; select finish_career_source_events(id) from opportunity_discovery_run;"
    );
    assert.equal(
      (
        await queryOne(
          db,
          "select count(*)::int n from career_daily_sources where finished_at is not null"
        )
      ).n,
      3
    );
  } finally {
    await db.close();
  }
});

test("notification opt-out and reopened Role do not wake Career", async () => {
  const db = await fixture();
  try {
    await db.exec(`insert into talent_progress(talent_id,role_id,recommendation_id,kind,metadata) values('${owner}','${role}','${rec}','org_stage_change','{"stage":"process_stopped","notifyCandidateOnClosure":false}');
      update company_roles set status='ended' where role_id='${role}';
      update company_roles set status='active' where role_id='${role}';`);
    assert.equal((await collect(db)).runIds.length, 0);
  } finally {
    await db.close();
  }
});

test("fixed same-day reservation owns the batch; flexible work advances and is consumed once", async () => {
  const db = await fixture();
  try {
    await closure(db);
    const fixed = await schedule(db, "2030-01-10T14:00:00+09:00");
    const flexible = await schedule(db, "2030-01-10T18:00:00+09:00", true);
    assert.equal((await collect(db)).runIds.length, 0);
    assert.equal(
      (await collect(db, new Date("2030-01-10T14:00:00+09:00"))).runIds.length,
      1
    );
    const run = await queryOne(db, "select * from opportunity_discovery_run");
    assert.equal(run.trigger_payload.sourceEvents.length, 3);
    const rows = (await db.query("select * from talent_agent_schedules")).rows;
    assert.deepEqual(
      new Set(rows.map((s: any) => s.id)),
      new Set([fixed.id, flexible.id])
    );
    assert.ok(
      rows.every(
        (s: any) => s.last_run_id === run.id && s.status === "triggered"
      )
    );
  } finally {
    await db.close();
  }
});

test("today's actual appointment starts a review and prevents waiting until after it", async () => {
  const db = await fixture();
  try {
    await schedule(db, "2030-01-10T14:00:00+09:00");
    await db.exec(
      `insert into meeting_schedules(talent_id,status,version,confirmed_start_at,source_refs) values('${owner}','confirmed',1,'2030-01-10T11:00:00+09:00','{"calendarDate":"2030-01-10"}');`
    );
    assert.equal((await collect(db)).runIds.length, 1);
    const run = await queryOne(db, "select * from opportunity_discovery_run");
    assert.equal(run.trigger_payload.sourceEvents[0].sourceKind, "appointment");
    assert.equal(
      (await queryOne(db, "select status from talent_agent_schedules")).status,
      "active"
    );
    assert.equal(
      (await queryOne(db, `select career_daily_source_current(id,talent_id,'2030-01-10T12:00:00+09:00') valid from career_daily_sources`)).valid,
      false,
      "a timed appointment is stale after its start even when it also stores calendarDate"
    );
    await db.exec("update meeting_schedules set version=2,status='cancelled'");
    assert.equal(
      (
        await queryOne(
          db,
          `select career_daily_source_current(id,talent_id,'2030-01-10T09:00:00+09:00') valid from career_daily_sources`
        )
      ).valid,
      false
    );
  } finally {
    await db.close();
  }
});

test("past timed meetings do not wake Career; date-only appointments today do", async () => {
  const db = await fixture();
  try {
    await db.exec(`insert into meeting_schedules(talent_id,status,version,confirmed_start_at,source_refs)
      values('${owner}','confirmed',1,'2030-01-10T08:00:00+09:00','{"calendarDate":"2030-01-10"}');`);
    assert.deepEqual((await collect(db)).runIds, []);
    await db.exec(`insert into meeting_schedules(talent_id,status,version,source_refs)
      values('${owner}','confirmed',1,'{"calendarDate":"2030-01-10"}');`);
    assert.equal((await collect(db)).runIds.length, 1);
  } finally {
    await db.close();
  }
});

test("stopped external schedule stays silent, while explicit scheduled work still runs", async () => {
  const db = await fixture();
  try {
    await db.exec(`update talent_setting set is_onboarding_done=true where user_id='${other}';
      update talent_agent_schedules set status='active',next_run_at='2030-01-01' where talent_id='${other}';`);
    assert.equal((await collect(db)).runIds.length, 0);
    await schedule(db, "2030-01-10T08:00:00+09:00", false, other);
    assert.equal((await collect(db)).runIds.length, 1);
    assert.equal(
      (
        await queryOne(
          db,
          "select trigger_payload from opportunity_discovery_run"
        )
      ).trigger_payload.sourceEvents.length,
      1
    );
  } finally {
    await db.close();
  }
});

test("deferred first page cannot starve a due candidate with capacity one", async () => {
  const db = await fixture();
  try {
    await closure(db);
    await schedule(db, "2030-01-10T14:00:00+09:00");
    await schedule(db, "2030-01-10T08:00:00+09:00", false, other);
    assert.equal((await collect(db, now, 1)).runIds.length, 1);
    assert.equal(
      (await queryOne(db, "select talent_id from opportunity_discovery_run"))
        .talent_id,
      other
    );
  } finally {
    await db.close();
  }
});

test("daily window does not delay already due explicit work, or move tomorrow's work", () => {
  const c: ProcessingCandidate = {
    talentId: owner,
    sources: [
      {
        id: rec,
        available_at: now.toISOString(),
        event: { sourceKind: "process_closure" },
      },
    ],
    schedules: [],
  };
  assert.equal(
    planCareerProcessing(c, new Date("2030-01-10T08:00:00+09:00")),
    null
  );
});

test("a batched email completes only the follow-up and closure actually covered by its receipt", async () => {
  const db = await fixture();
  try {
    await closure(db);
    await db.exec(`insert into company_talent_followups(id,talent_id,due_at,source_kind,source_id) values
      ('88888888-8888-4888-8888-888888888881','${owner}','2030-01-09','contact','${rec}'),
      ('88888888-8888-4888-8888-888888888882','${owner}','2030-01-09','contact','${rec}');`);
    const [run] = (await collect(db)).runIds;
    const sources: any[] = (
      await db.query("select * from career_daily_sources order by source_id")
    ).rows;
    const followups = sources.filter(
      (s) => s.source_kind === "company_followup"
    );
    const closureSource = sources.find(
      (s) => s.source_kind === "process_closure"
    );
    const ids = [closureSource.id, followups[0].id];
    const targets = followups.map((s) => ({ followupId: s.source_id }));
    await db.query(
      "update opportunity_discovery_run set trigger_payload=trigger_payload||jsonb_build_object('companyRequestFollowups',$2::jsonb) where id=$1",
      [run, JSON.stringify(targets)]
    );
    await db.query("update company_talent_followups set delivery_run_id=$1", [
      run,
    ]);
    const delivery = (
      await db.query<any>(
        `insert into talent_opportunity_delivery(talent_id,discovery_run_id,channel,status,payload) values($1,$2,'email','sending',$3) returning id`,
        [
          owner,
          run,
          JSON.stringify({
            runContract: "career_agent_v1",
            resendEmailId: "provider-receipt",
            sourceIds: ids,
            emailPayload: {
              subject: "Updates",
              text: "One follow-up and closure",
            },
          }),
        ]
      )
    ).rows[0].id;
    await db.query("select finish_career_agent_email($1)", [delivery]);
    const {assertCareerSourceEventsCurrent}=await import('../companies/server');
    const completed=await queryOne(db,`select * from opportunity_discovery_run where id='${run}'`);
    completed.trigger_payload.sourceEvents=completed.trigger_payload.sourceEvents.filter((event:any)=>ids.includes(event.dailySourceId));
    await assertCareerSourceEventsCurrent({admin:localAdmin(db),run:completed});
    await db.query('select collect_career_daily_sources($1)',[now.toISOString()]);
    assert.equal((await queryOne(db,"select count(*)::int n from career_daily_sources where cancelled_at is not null")).n,0);
    const statuses: any[] = (
      await db.query("select status from company_talent_followups order by id")
    ).rows;
    assert.deepEqual(
      statuses.map((s) => s.status),
      ["delivered", "pending"]
    );
    assert.equal(
      (
        await queryOne(
          db,
          "select count(*)::int n from talent_progress where kind='internal_process_stopped_notified'"
        )
      ).n,
      1
    );
    assert.equal(
      (
        await queryOne(
          db,
          `select saved_stage from talent_opportunity_recommendation where id='${rec}'`
        )
      ).saved_stage,
      "closed"
    );
  } finally {
    await db.close();
  }
});

test("source cancellation requeues only surviving facts and transfers receipt ownership", async () => {
  const db = await fixture();
  try {
    await closure(db);
    await db.exec(
      `insert into talent_opportunity_matching_review(talent_id,opportunity_id,decision) values('${owner}','${roleTwo}','candidate_first');`
    );
    const [run] = (await collect(db)).runIds;
    const original = await queryOne(
      db,
      "select * from opportunity_discovery_run"
    );
    const remaining = original.trigger_payload.sourceEvents.filter(
      (e: any) => e.sourceKind === "talent_selection"
    );
    const next = (
      await db.query<any>(
        "select requeue_career_remaining_sources($1,$2,'delegated_work') id",
        [run, JSON.stringify(remaining)]
      )
    ).rows[0].id;
    assert.notEqual(next, run);
    assert.equal((await db.query<any>("select career_daily_source_current($1,$2,$3,$4) valid", [remaining[0].dailySourceId,owner,now.toISOString(),run])).rows[0].valid,false);
    assert.equal((await db.query<any>("select career_daily_source_current($1,$2,$3,$4) valid", [remaining[0].dailySourceId,owner,now.toISOString(),next])).rows[0].valid,true);
    assert.equal(
      (
        await queryOne(
          db,
          "select run_id from career_daily_sources where source_kind='talent_selection'"
        )
      ).run_id,
      next
    );
    await db.query(
      "update opportunity_discovery_run set status='completed' where id=$1",
      [next]
    );
    await db.query("select finish_career_source_events($1)", [next]);
    assert.ok(
      (
        await queryOne(
          db,
          "select finished_at from career_daily_sources where source_kind='talent_selection'"
        )
      ).finished_at
    );
    assert.equal(
      (
        await queryOne(
          db,
          "select finished_at from career_daily_sources where source_kind='process_closure'"
        )
      ).finished_at,
      null
    );
  } finally {
    await db.close();
  }
});

for (const caller of ['server', 'rpc'] as const) test(`settings resume a policy-paused external cadence while preserving an explicit ${caller} pause`, async () => {
  const db=await fixture();
  try {
    const {writeCareerSchedule}=await import('./server');
    await db.exec(`update talent_setting set is_onboarding_done=true where user_id='${other}';`);
    let s=await queryOne(db,`select * from talent_agent_schedules where talent_id='${other}'`);
    assert.equal(s.status,'paused');
    assert.equal(s.target_refs.externalPolicyPaused,true);
    await db.exec(`update talent_setting set status='active' where user_id='${other}'`);
    s=await queryOne(db,`select * from talent_agent_schedules where talent_id='${other}'`);
    assert.equal(s.status,'active');
    await db.exec(`update talent_setting set get_external_recommendation=false where user_id='${other}'`);
    s=await queryOne(db,`select * from talent_agent_schedules where talent_id='${other}'`);
    const input={action:'pause',schedule_id:s.id,expected_revision:s.revision};
    if(caller==='server') await writeCareerSchedule({admin:localAdmin(db),userId:other,requestId:'explicit-pause',input});
    else {
      // The currently deployed caller does not clear externalPolicyPaused.
      const args={p_user_id:other,p_conversation_id:null,p_request_id:'explicit-pause',p_input:input};
      const first=await localAdmin(db).rpc('write_career_schedule',args);
      assert.equal(first.error,null);
      assert.notEqual(first.data.target_refs.externalPolicyPaused,true);
      assert.equal(first.data.target_refs.externalRecommendations,true);
      const retry=await localAdmin(db).rpc('write_career_schedule',args);
      assert.deepEqual(retry,first);
    }
    await db.exec(`update talent_setting set get_external_recommendation=true where user_id='${other}'`);
    assert.equal((await queryOne(db,`select status from talent_agent_schedules where talent_id='${other}'`)).status,'paused');
  } finally {await db.close();}
});

test("a reopening followed by another closure invalidates the old source and retains the new one", async () => {
  const db=await fixture();
  try {
    await db.exec(`update company_roles set status='ended' where role_id='${role}';
      update company_roles set status='active' where role_id='${role}';
      update company_roles set status='ended' where role_id='${role}';`);
    assert.equal((await collect(db)).runIds.length,1);
    const run=await queryOne(db,'select * from opportunity_discovery_run');
    assert.equal(run.trigger_payload.sourceEvents.length,1);
    assert.equal((await queryOne(db,'select count(*)::int n from career_daily_sources where cancelled_at is not null')).n,1);
  } finally {await db.close();}
});

test("daily receipt tables and RPCs cannot be called by anonymous clients", async()=>{
  const db=await fixture();
  try {
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from career_daily_sources'),/permission denied/);
    await assert.rejects(db.query("select collect_career_daily_sources(now())"),/permission denied/);
  } finally {await db.exec('reset role');await db.close();}
});

test("the old collector cannot revive stopped discovery and shares candidate execution ownership", async () => {
  const db=await fixture();
  try {
    await db.exec(`update talent_setting set is_onboarding_done=true where user_id='${other}';
      update talent_agent_schedules set status='active',next_run_at=now()-interval '1 hour' where talent_id='${other}';`);
    let s=await queryOne(db,`select * from talent_agent_schedules where talent_id='${other}'`);
    const enqueue=()=>db.query<any>('select enqueue_career_schedule_occurrence($1,$2,$3,null) id',[s.id,s.revision,s.next_run_at]);
    assert.equal((await enqueue()).rows[0].id,null);
    await db.exec(`update talent_setting set status='active' where user_id='${other}';`);
    s=await queryOne(db,`select * from talent_agent_schedules where talent_id='${other}'`);
    const id=(await enqueue()).rows[0].id;
    assert.ok(id);
    assert.equal((await queryOne(db,`select trigger_payload->>'contactScope' scope from opportunity_discovery_run where id='${id}'`)).scope,'external_recommendations');
    const second=await schedule(db,new Date(Date.now()-3600000).toISOString(),false,other);
    const another=await db.query<any>('select enqueue_career_schedule_occurrence($1,$2,$3,null) id',[second.id,second.revision,second.next_run_at]);
    assert.equal(another.rows[0].id,null);
  } finally {await db.close();}
});

test("a previously notified process can reopen and later produce a fresh closure", async () => {
  const db=await fixture();
  try {
    await closure(db);
    const [run]=(await collect(db)).runIds;
    const d=await queryOne(db,'select * from career_daily_sources');
    await db.query(`insert into talent_messages(id,user_id,role,payload) values(1,$1,'assistant',$2)`,[owner,JSON.stringify({backgroundRunId:run,sourceIds:[d.id]})]);
    await db.query("select record_career_daily_contact($1,$2,'chat','1')",[run,JSON.stringify([d.id])]);
    await db.query("update opportunity_discovery_run set status='completed' where id=$1",[run]);
    await db.query('select finish_career_source_events($1)',[run]);
    await db.exec(`update talent_opportunity_recommendation set saved_stage='accepted',processed_stage='connected';
      insert into talent_progress(talent_id,role_id,recommendation_id,kind,metadata) values('${owner}','${role}','${rec}','org_stage_change','{"stage":"connected"}');`);
    await closure(db);
    assert.equal((await collect(db,new Date('2030-01-11T09:00:00+09:00'))).runIds.length,1);
    assert.equal((await queryOne(db,"select count(*)::int n from career_daily_sources where finished_at is null and cancelled_at is null")).n,1);
  } finally {await db.close();}
});

test("a delivery receipt cannot close a process reopened while sending", async () => {
  const db=await fixture();
  try {
    await closure(db);
    const [run]=(await collect(db)).runIds;
    const d=await queryOne(db,'select * from career_daily_sources');
    await db.query(`insert into talent_messages(id,user_id,role,payload) values(1,$1,'assistant',$2)`,[owner,JSON.stringify({backgroundRunId:run,sourceIds:[d.id]})]);
    await db.exec(`insert into talent_progress(talent_id,role_id,recommendation_id,kind,metadata) values('${owner}','${role}','${rec}','org_stage_change','{"stage":"connected"}');`);
    for(let i=0;i<2;i++) await db.query("select record_career_daily_contact($1,$2,'chat','1')",[run,JSON.stringify([d.id])]);
    assert.equal((await queryOne(db,'select saved_stage from talent_opportunity_recommendation')).saved_stage,'accepted');
    const notices=(await db.query<any>("select metadata from talent_progress where kind='internal_process_stopped_notified'")).rows;
    assert.equal(notices.length,1);
    assert.equal(notices[0].metadata.stateChangedAfterSend,true);
  } finally {await db.close();}
});

test("selection revisions preserve postponed dates and published-name blocks", async () => {
  const db=await fixture();
  try {
    await db.exec(`insert into talent_opportunity_matching_review(talent_id,opportunity_id,decision,not_before)
      values('${owner}','${roleTwo}','candidate_first','2030-01-11T09:00:00+09:00');`);
    assert.deepEqual((await collect(db)).runIds,[]);
    await db.exec("update talent_opportunity_matching_review set decision='no_action'; update talent_opportunity_matching_review set decision='candidate_first',not_before='2030-01-10T09:00:00+09:00'; update talent_opportunity_matching_review set decision='candidate_first'");
    assert.equal((await queryOne(db,"select count(*)::int n from career_daily_sources where cancelled_at is null")).n,1);
    await db.exec(`update company_workspace set published_name='Hidden Legal Name'; update talent_setting set blocked_companies=array['Hidden Legal Name'] where user_id='${owner}';`);
    assert.deepEqual((await collect(db)).runIds,[]);
    assert.equal((await queryOne(db,"select count(*)::int n from career_daily_sources where cancelled_at is null")).n,0);
  } finally {await db.close();}
});

test("the Worker stage trigger uses column-scoped privileges without elevated functions", async () => {
  const db=await fixture();
  try {
    await db.exec('grant select,insert on talent_progress to harper_worker; grant select on company_roles to harper_worker; set role harper_worker');
    await closure(db);
    assert.equal((await queryOne(db,'select count(*)::int n from career_daily_sources')).n,1);
    await assert.rejects(db.query('update talent_opportunity_recommendation set saved_stage=\'closed\''),/permission denied/);
  } finally {await db.exec('reset role');await db.close();}
});

test("cutover preserves an explicit user-authored purpose stored under the old automatic key", async () => {
 const db = await fixture(async db => {
   await db.exec(`update talent_setting set is_onboarding_done=true where user_id='${owner}'`);
   const s = await queryOne(db,`select * from talent_agent_schedules where talent_id='${owner}'`);
   await write(db,{action:'update',schedule_id:s.id,expected_revision:s.revision,instruction:'Review the application I delegated next Tuesday.',source_message_id:42,actor:'user'},'delegated-user-purpose');
 });
 try {
   const s = await queryOne(db,`select * from talent_agent_schedules where talent_id='${owner}'`);
   assert.equal(s.schedule_key,null);
   assert.equal(s.instruction,'Review the application I delegated next Tuesday.');
   assert.equal(s.status,'active');
 } finally { await db.close(); }
});

test("a user-message reference alone does not turn automatic discovery into delegated recurring work", async () => {
 const db=await fixture(async db=>{
   await db.exec(`update talent_setting set is_onboarding_done=true where user_id='${other}'`);
   const s=await queryOne(db,`select * from talent_agent_schedules where talent_id='${other}'`);
   await write(db,{action:'update',schedule_id:s.id,expected_revision:s.revision,
     instruction:'Continue general Career checks using the latest profile reply.',source_message_id:42,actor:'career_agent'},'profile-context-update',other);
 });
 try {
   const s=await queryOne(db,`select * from talent_agent_schedules where talent_id='${other}'`);
   assert.equal(s.schedule_key,'career_check_in');
   assert.equal(s.status,'paused');
   assert.match(s.instruction,/external opportunities/);
   assert.equal(s.target_refs.internalRecommendations,undefined);
 } finally {await db.close();}
});
