import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Small isolated ledger smoke. No production data, company/candidate transports,
// or live Roles. Source facts are an explicit test adapter, not runtime branches.
test("stored company dates initialize once, anchor, change, cancel and fence delivery", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role; create role harper_worker;
      create table company_roles(role_id uuid,company_workspace_id uuid,name text,status text,is_expired boolean,expires_at timestamptz,information jsonb);
      create table talent_users(user_id uuid,name text,email text,deleted_at timestamptz);
      create table company_workspace(company_workspace_id uuid,company_name text);
      create table company_messages(id bigint,company_user_id uuid);
      create table company_intro_candidates(id uuid primary key,company_workspace_id uuid,role_id uuid,talent_id uuid,recommendation_id uuid,
        requested_by_company_user_id uuid,status text,company_appeal text,delivery_run_id uuid,candidate_sent_at timestamptz);
      create table company_talent_requests(id uuid primary key,company_workspace_id uuid,role_id uuid,talent_id uuid,recommendation_id uuid,
        source_company_message_id bigint,contact_purpose text,workflow_status text,request_context text,delivery_subject text,delivery_body text,
        expires_at timestamptz,talent_source_message_id bigint,document_id uuid);
      create table talent_setting(user_id uuid,blocked_companies text[]);
      create table meeting_schedules(id uuid primary key,company_workspace_id uuid,role_id uuid,talent_id uuid,recommendation_id uuid,
        organizer_company_user_id uuid,status text,active_round_id uuid,title text);
      create table meeting_schedule_rounds(id uuid primary key,schedule_id uuid,status text,delivery_queue_id uuid,submitted_at timestamptz,invitation_expires_at timestamptz,public_token_hash text);
      create table contact_queue(id uuid,company_talent_request_id uuid,type text,status text,sent_at timestamptz,payload jsonb);
      create table talent_opportunity_delivery(id uuid,discovery_run_id uuid,talent_id uuid,channel text,status text,sent_at timestamptz,payload jsonb,updated_at timestamptz);
      create table career_email_messages(metadata jsonb,direction text,status text,occurred_at timestamptz,subject text,body_text text);
      create table opportunity_scheduler_state(talent_id uuid primary key,next_check_at timestamptz);
      create table opportunity_discovery_run(id uuid primary key,status text);
      create table talent_progress(id uuid default gen_random_uuid(),talent_id uuid,role_id uuid,recommendation_id uuid,
        company_user_id uuid,user_id text,kind text,text text,metadata jsonb,created_at timestamptz default now(),open_to_company boolean,open_to_talent boolean);
    `);
    const sql = await readFile(new URL("../../../supabase/migrations/20261014180746_company_talent_followup_schedules.sql", import.meta.url), "utf8");
    await db.exec(sql);
    for (const kind of ["intro", "contact", "meeting"]) {
      const missing = await db.query<any>("select company_followup_source_v1($1,'00000000-0000-4000-8000-000000000000') as facts", [kind]);
      assert.equal(missing.rows[0].facts, null);
    }
    // The integration unit here is the persistent scheduling/execution boundary.
    // Real source readers retain their own availability and sharing contracts.
    await db.exec(`create table test_source_facts(kind text,id uuid,facts jsonb);
      create or replace function public.company_followup_source_v1(p_kind text,p_id uuid) returns jsonb
      language sql stable as $$ select facts from test_source_facts where kind=p_kind and id=p_id $$;`);
    const workspace = "10000000-0000-4000-8000-000000000001", talent = "10000000-0000-4000-8000-000000000002";
    const source = "10000000-0000-4000-8000-000000000003", role = "10000000-0000-4000-8000-000000000004";
    const actor = "10000000-0000-4000-8000-000000000005", run = "10000000-0000-4000-8000-000000000006";
    const facts = { workspaceId: workspace, talentId: talent, roleId: role, actorId: actor, active: true, contactable: true, contactPurpose: "request" };
    for (const kind of ["intro", "contact", "meeting"]) {
      await db.query("insert into test_source_facts values($1,$2,$3::jsonb)", [kind, source, JSON.stringify(facts)]);
      await db.query("select initialize_company_followups_v1($1,$2)", [kind, source]);
    }
    assert.equal((await db.query("select * from company_talent_followups")).rows.length, 5);
    await db.query("select initialize_company_followups_v1('intro',$1)", [source]);
    assert.equal((await db.query("select * from company_talent_followups")).rows.length, 5);
    assert.equal((await db.query("select * from company_talent_followups where due_at is not null")).rows.length, 0);
    await db.query("update test_source_facts set facts=facts||jsonb_build_object('originalSentAt',(now()-interval '30 days')::text)");
    for (const kind of ["intro", "contact", "meeting"]) await db.query("select refresh_company_followups_v1($1,$2)", [kind, source]);
    const dates = (await db.query<any>("select * from company_talent_followups where source_kind='intro' order by delay_days")).rows;
    assert.deepEqual(dates.map(f => f.delay_days), [3, 9, 18]);
    const changed = (await db.query<any>("select change_company_followup_v1($1,$2,1,'reschedule',now()-interval '1 day',$3) as value", [workspace, dates[0].id, actor])).rows[0].value;
    assert.equal(changed.revision, 2);
    await db.query("select change_company_followup_v1($1,$2,1,'cancel',null,$3)", [workspace, dates[1].id, actor]);
    await db.query("select change_company_followup_v1($1,$2,1,'cancel',null,$3)", [workspace, dates[1].id, actor]);
    assert.equal((await db.query<any>("select begin_company_followup_delivery_v1($1,$2::uuid[],$3::bigint[],$4) as allowed",
      [talent, [dates[0].id], [1], run])).rows[0].allowed, false);
    assert.equal((await db.query<any>("select begin_company_followup_delivery_v1($1,$2::uuid[],$3::bigint[],$4) as allowed",
      [talent, [dates[0].id], [2], run])).rows[0].allowed, true);
    const locked = (await db.query<any>("select change_company_followup_v1($1,$2,2,'reschedule',now(),$3) as value", [workspace, dates[0].id, actor])).rows[0].value;
    assert.equal(locked.status, "not_changeable");
    assert.ok((await db.query<any>("select count(*)::int as count from talent_progress where open_to_company=true")).rows[0].count >= 8);
    assert.equal((await db.query<any>("select count(*)::int as count from pg_constraint where conrelid='company_talent_followups'::regclass and contype='c'")).rows[0].count, 0);
    const addParams = [workspace, source, actor];
    const added = (await db.query<any>("select add_company_followup_v1($1,'contact',$2,now()+interval '5 days',$3,'same-command') as value", addParams)).rows[0].value;
    const repeated = (await db.query<any>("select add_company_followup_v1($1,'contact',$2,now()+interval '5 days',$3,'same-command') as value", addParams)).rows[0].value;
    assert.equal(added.id, repeated.id);
    assert.equal((await db.query<any>("select count(*)::int as count from talent_progress where metadata->>'followupId'=$1 and metadata->>'eventType'='scheduled'", [added.id])).rows[0].count, 1);
    await db.query("insert into meeting_schedules(id,active_round_id,status) values($1,$1,'awaiting_talent')", [source]);
    await db.query("update test_source_facts set facts=facts||'{\"active\":false}'::jsonb where kind='meeting'");
    await db.query("update meeting_schedules set status='cancelled' where id=$1", [source]);
    assert.equal((await db.query<any>("select count(*)::int as count from company_talent_followups where source_kind='meeting' and status='pending'")).rows[0].count, 0);
  } finally { await db.close(); }
});
