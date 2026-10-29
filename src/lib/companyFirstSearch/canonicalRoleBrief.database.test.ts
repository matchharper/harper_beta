import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const workspace="00000000-0000-4000-8000-000000000001";
const role="00000000-0000-4000-8000-000000000002";
const actor="00000000-0000-4000-8000-000000000003";
const activation="00000000-0000-4000-8000-000000000004";
const other="00000000-0000-4000-8000-000000000005";

test("canonical brief migration: enqueue, absent briefs, writes and source transitions without the legacy column", async () => {
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table company_workspace(company_workspace_id uuid primary key,company_db_id bigint,updated_at timestamptz);
      create table company_db(id bigint primary key,employee_count_range jsonb);
      create table company_data(company_workspace_id uuid primary key);
      create table company_memories(id uuid,company_workspace_id uuid,role_id uuid);
      create table company_events(workspace_id uuid,content text,source text,created_at timestamptz);
      create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text default 'internal',
        status text default 'active',is_expired boolean default false,expires_at timestamptz,information jsonb default '{}',
        request text,name text,description text,location_text text,work_mode text,type text[],opportunity_search_tsv tsvector,updated_at timestamptz);
      create table company_internal_roles(role_id uuid primary key,request text,criteria jsonb default '[]',
        is_company_first_search boolean default false,intro_search_date text[],intro_search_time integer,
        email_notifications_enabled boolean,updated_at timestamptz,team_id uuid);
      create table company_user_workspace(company_workspace_id uuid,company_user_id uuid,authority text,
        id uuid,access_scope text,team_id uuid);
      create table company_workspace_teams(id uuid,company_workspace_id uuid,deleted_at timestamptz);
      create table company_workspace_team_members(membership_id uuid,team_id uuid);
      create table company_agent_web_action_jobs(id uuid primary key default gen_random_uuid(),
        idempotency_key text unique,company_workspace_id uuid,role_id uuid,actor_user_id uuid,
        action_name text,action_context jsonb,status text default 'processing');
      create table company_first_search_runs(id uuid primary key default gen_random_uuid(),company_workspace_id uuid,
        role_id uuid,scheduled_slot timestamptz,trigger_reason text,contract_version text,status text,
        created_at timestamptz default now(),request_options jsonb,source_snapshot jsonb,
        scheduled_role_ids uuid[],requested_role_ids uuid[]);
      create table company_slack_channels(id uuid,company_workspace_id uuid,is_enabled boolean);
      create table company_role_notification_channels(channel_id uuid,role_id uuid);
      create function role_matching_slot_type_v1(uuid,timestamptz) returns text language sql as $$select 'paid'::text$$;
      create function company_matching_activation_is_valid_v1(uuid,uuid,uuid) returns boolean language sql as $$
        select exists(select 1 from company_first_search_runs where id=$1 and company_workspace_id=$2 and role_id=$3)$$;
      create function company_scheduled_matching_key_v1(uuid,uuid,timestamptz) returns text language sql as $$select $2::text||':'||$3::text$$;
      create function company_role_candidate_email_enabled_v1(uuid) returns boolean language sql as $$select false$$;
      create function company_role_email_recipients_v1(uuid) returns setof text language sql as $$select 'unused'::text where false$$;
      create function company_role_search_brief_snapshot_v1(uuid) returns jsonb language sql as $$
        select jsonb_build_object('request',request) from company_internal_roles where role_id=$1$$;
      create function validate_company_data_change_value_v1(text,jsonb,text) returns void language sql as $$select$$;
      create function enqueue_company_agent_web_action_v1(uuid,uuid,uuid,uuid,text,jsonb,text)
        returns table(job_id uuid,created boolean) language sql as $$
        insert into company_agent_web_action_jobs(company_workspace_id,role_id,actor_user_id,action_name,action_context,idempotency_key)
        values($1,$3,$4,$5,$6,$7) returning id,true$$;
      insert into company_workspace values('${workspace}',null,now());
      insert into company_user_workspace(company_workspace_id,company_user_id,authority) values('${workspace}','${actor}','owner');
      insert into company_roles(role_id,company_workspace_id,request,name) values('${role}','${workspace}',null,'Engineer');
      insert into company_internal_roles(role_id,request) values('${role}','Canonical hiring brief');
      insert into company_first_search_runs(id,company_workspace_id,role_id,scheduled_slot,trigger_reason,status)
        values('${activation}','${workspace}','${role}',now(),'role_activated','running');
    `);
    await db.exec(await readFile(new URL("./fixtures/legacyRoleRequestFunctions.sql",import.meta.url),"utf8"));
    await db.exec(await readFile(new URL("./fixtures/canonicalRoleDataReader.sql",import.meta.url),"utf8"));
    await db.exec(`create trigger company_roles_legacy_request_to_internal after insert or update of request,source_type
      on company_roles for each row execute function sync_legacy_company_role_request_to_internal_v1();
      create trigger company_roles_guard_internal_legacy_request before update of request
      on company_roles for each row execute function guard_internal_company_role_legacy_request_v1();`);
    await db.exec(await readFile(new URL("../../../supabase/migrations/20261028070450_canonical_role_brief_scheduled_matching.sql",import.meta.url),"utf8"));
    const enqueue=async ()=>(await db.query<{receipt:Record<string,any>}>(
      `select enqueue_company_scheduled_matching_v1($1,$2,now(),$3,$4,$4) receipt`,
      [workspace,role,actor,activation])).rows[0].receipt;
    const child=async (jobId:string,callId:string)=>(await db.query<{receipt:Record<string,any>}>(
      `select enqueue_scheduled_matching_search_v1($1,$2,jsonb_build_object('roleId',$3::text)) receipt`,
      [jobId,callId,role])).rows[0].receipt;
    const change=async (key:string,expected:unknown,value:unknown)=>(await db.query<{receipt:Record<string,any>}>(
      `select apply_company_data_changes_internal_v1($1,$2::jsonb,'website','Saved role',false) receipt`,
      [workspace,JSON.stringify([{key,role_id:role,expected,value}])])).rows[0].receipt;

    // Reproduces production: legacy NULL, populated canonical brief.
    const first=await enqueue();
    assert.equal(first.status,"queued");
    assert.equal((await enqueue()).jobId,first.jobId);
    assert.equal((await enqueue()).status,"already_queued");
    assert.equal((await child(first.jobId,"initial")).status,"queued");

    // Old writes must never overwrite the canonical text again.
    await db.exec(`update company_roles set request='stale legacy text' where role_id='${role}'`);
    assert.equal((await db.query<{request:string}>(`select request from company_internal_roles`)).rows[0].request,"Canonical hiring brief");
    await db.exec(`update company_roles set name=name where role_id='${role}'`);
    assert.equal((await db.query<{matched:boolean}>(`select opportunity_search_tsv @@ plainto_tsquery('simple','stale legacy text') matched from company_roles`)).rows[0].matched,false);
    assert.equal((await db.query<{matched:boolean}>(`select opportunity_search_tsv @@ plainto_tsquery('simple','Canonical hiring brief') matched from company_roles`)).rows[0].matched,true);

    // Stronger than string matching: every remaining path executes with the column absent.
    await db.exec(`alter table company_roles drop column request`);
    await db.exec(`delete from company_first_search_runs where trigger_reason='scheduled'; delete from company_agent_web_action_jobs;`);
    assert.equal((await enqueue()).status,"queued");
    await db.exec(`delete from company_agent_web_action_jobs`);
    for (const brief of [null,"","   "]) {
      await db.query(`update company_internal_roles set request=$1 where role_id=$2`,[brief,role]);
      assert.deepEqual(await enqueue(),{status:"skipped",reason:"hiring_brief_missing"});
    }
    await db.exec(`delete from company_internal_roles where role_id='${role}'`);
    assert.deepEqual(await enqueue(),{status:"skipped",reason:"hiring_brief_missing"});
    assert.equal((await db.query<{count:number}>(`select count(*)::int count from company_agent_web_action_jobs`)).rows[0].count,0);

    // First save repairs an absent extension; subsequent saves update only the canonical brief.
    assert.equal((await change("role_request",null,"First saved brief")).status,"updated");
    assert.equal((await change("role_request","First saved brief","Updated brief")).status,"updated");
    assert.equal((await db.query<{request:string}>(`select request from company_internal_roles`)).rows[0].request,"Updated brief");
    assert.equal((await db.query<{matched:boolean}>(`select opportunity_search_tsv @@ plainto_tsquery('simple','Updated brief') matched from company_roles`)).rows[0].matched,true);
    const root=await enqueue();
    await db.exec(`update company_internal_roles set request=null where role_id='${role}'`);
    assert.deepEqual(await child(root.jobId,"after-clear"),{status:"skipped",reason:"hiring_brief_missing"});
    await db.exec(`delete from company_internal_roles where role_id='${role}'`);
    assert.deepEqual(await child(root.jobId,"after-delete"),{status:"skipped",reason:"hiring_brief_missing"});

    // Source transitions create/remove an empty internal extension; no legacy fallback exists.
    assert.equal((await change("role_source_type","internal","external")).status,"updated");
    assert.equal((await change("role_source_type","external","internal")).status,"updated");
    assert.equal((await db.query<{request:string|null}>(`select request from company_internal_roles`)).rows[0].request,null);
    await change("role_request",null,"Restored canonical brief");
    await db.exec(`delete from company_agent_web_action_jobs`);

    // Missing content never bypasses actor ownership or test-only isolation.
    await assert.rejects(db.query(`select enqueue_company_scheduled_matching_v1($1,$2,now(),$3,$4,$4)`,
      [workspace,role,other,activation]),/scheduled_actor_forbidden/);
    await db.exec(`insert into company_user_workspace(company_workspace_id,company_user_id,authority,access_scope)
      values('${workspace}','${other}','admin','team'); delete from company_internal_roles where role_id='${role}'`);
    await assert.rejects(db.query(`select enqueue_company_scheduled_matching_v1($1,$2,now(),$3,$4,$4)`,
      [workspace,role,other,activation]),/scheduled_actor_forbidden/);
    assert.deepEqual(await enqueue(),{status:"skipped",reason:"hiring_brief_missing"});
    await db.exec(`update company_roles set information='{"testOnly":true}' where role_id='${role}'`);
    await assert.rejects(enqueue(),/scheduled_role_unavailable/);
    const acl=await db.query<{allowed:boolean}>(`select has_function_privilege('anon',
      'enqueue_company_scheduled_matching_v1(uuid,uuid,timestamptz,uuid,uuid,uuid)','execute') allowed`);
    assert.equal(acl.rows[0].allowed,false);
  } finally {await db.close();}
});
