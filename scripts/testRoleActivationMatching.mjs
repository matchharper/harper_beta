/** Execute the actual activation/scheduled RPC migration in isolated PostgreSQL (PGlite). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text default 'internal',status text default 'draft',is_expired boolean default false,expires_at timestamptz,information jsonb default '{}',matching_kind text default 'paid');
    create table company_internal_roles(role_id uuid primary key,request text,is_company_first_search boolean default false,intro_search_date text[] default '{}',intro_search_time int default 23,slack_notifications_enabled boolean default true,email_notifications_enabled boolean default false);
    create table company_first_search_runs(id uuid primary key default gen_random_uuid(),company_workspace_id uuid,role_id uuid,scheduled_slot timestamptz,trigger_reason text,contract_version text,status text,available_at timestamptz default now(),scheduled_role_ids uuid[],request_options jsonb default '{}',source_snapshot jsonb,created_at timestamptz default now(),source_cutoff timestamptz,result jsonb default '{}');
    create unique index activation_once on company_first_search_runs(role_id,contract_version) where trigger_reason='role_activated';
    create table company_agent_web_action_jobs(id uuid primary key default gen_random_uuid(),company_workspace_id uuid,role_id uuid,conversation_id uuid,actor_user_id uuid,action_name text,action_context jsonb,idempotency_key text unique,status text default 'processing');
    create table company_user_workspace(company_workspace_id uuid,company_user_id uuid,authority text);
    create table company_slack_channels(id uuid,company_workspace_id uuid,is_enabled boolean);
    create table company_role_notification_channels(channel_id uuid,role_id uuid);
    create table talent_opportunity_recommendation(id uuid,role_id uuid);
    create table company_intro_candidates(company_workspace_id uuid,talent_id uuid,status text);
    create table talent_opportunity_tag(id uuid,opportunity_id uuid,talent_id uuid,tag text,created_at timestamptz,updated_at timestamptz);
    create table talent_users(user_id uuid,deleted_at timestamptz,created_at timestamptz);
    create table talent_setting(user_id uuid,get_internal_recommendation boolean,profile_visibility text,blocked_companies text[]);
    create table talent_opportunity_matching_review(id uuid,run_id uuid,opportunity_id uuid,talent_id uuid,discovery_run_id uuid,decision text,closed_at timestamptz,recommendation_id uuid,evaluation_ref jsonb,input_fingerprint text);
    create table opportunity_discovery_run(id uuid,talent_id uuid,trigger_payload jsonb);
    create table company_workspace(company_workspace_id uuid,company_name text,published_name text);
    create function role_matching_slot_type_v1(uuid,timestamptz) returns text language sql as $$select matching_kind from company_roles where role_id=$1$$;
    create function company_memory_scope_allowed_v1(uuid,uuid,text,uuid,uuid) returns boolean language sql as $$select exists(select 1 from company_user_workspace where company_workspace_id=$1 and company_user_id=$2 and authority in ('owner','admin'))$$;
    create function company_role_email_recipients_v1(uuid) returns table(email text) language sql as $$select 'qa@example.invalid'::text$$;
    create function accepted_role_pair_is_available_v1(uuid) returns boolean language sql as $$select false$$;
    create function company_role_search_brief_snapshot_v1(uuid) returns jsonb language sql as $$select jsonb_build_object('request',request) from company_internal_roles where role_id=$1$$;
    create function company_role_search_brief_version_v1(uuid) returns text language sql as $$select md5(company_role_search_brief_snapshot_v1($1)::text)$$;
    create function scheduled_talent_source_fingerprint_v1(uuid) returns text language sql as $$select 'talent-fingerprint'$$;
    create function scheduled_company_memory_fingerprint_v1(uuid) returns text language sql as $$select 'memory-fingerprint'$$;
    create function company_scheduled_matching_key_v1(uuid,uuid,timestamptz) returns text language sql as $$select 'scheduled:'||$1||':'||$2||':'||$3$$;
    create function enqueue_company_agent_web_action_v1(uuid,uuid,uuid,uuid,text,jsonb,text) returns table(job_id uuid,created boolean) language plpgsql as $$begin
      insert into company_agent_web_action_jobs(company_workspace_id,conversation_id,role_id,actor_user_id,action_name,action_context,idempotency_key)
      values($1,$2,$3,$4,$5,$6,$7) returning id,true into job_id,created; return next; end$$;
    create function enqueue_company_scheduled_matching_v1(uuid,uuid,timestamptz,uuid,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function company_scheduled_accepted_inventory_v1(uuid,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
  `);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261025061447_immediate_role_activation_matching.sql', import.meta.url),'utf8'));
  await db.exec(`create trigger enqueue_activated_role_matching after insert or update of status on company_roles for each row execute function enqueue_activated_role_matching_v1();
    create trigger enqueue_internal_role_matching after insert or update of request on company_internal_roles for each row execute function enqueue_activated_role_matching_v1();`);
  async function fixture({kind='paid',testOnly=false,expired=false}={}) {
    const f={role:uuid(),workspace:uuid(),actor:uuid(),conversation:uuid()};
    // All fixtures are isolated in-memory. The test-only case proves the production exclusion itself.
    await db.query(`insert into company_roles(role_id,company_workspace_id,matching_kind,information,is_expired) values($1,$2,$3,$4,$5)`,[f.role,f.workspace,kind,JSON.stringify({testOnly,testFixture:'activation-in-memory'}),expired]);
    await db.query(`insert into company_internal_roles(role_id,request) values($1,'## Hard constraints\nBuild backend services.\n## Preferred criteria\n')`,[f.role]);
    await db.query(`insert into company_user_workspace values($1,$2,'owner')`,[f.workspace,f.actor]);
    await db.query(`insert into company_slack_channels values($1,$2,true)`,[uuid(),f.workspace]);
    return f;
  }
  const runs=async f=>(await db.query(`select *,available_at<=now() as due from company_first_search_runs where role_id=$1 order by created_at`,[f.role])).rows;
  const activate=async f=>db.query(`update company_roles set status='active' where role_id=$1`,[f.role]);
  for (const kind of ['free','paid']) {
    const f=await fixture({kind});
    assert.equal((await runs(f)).length,0,'draft does not search');
    await activate(f);
    const [activation]=await runs(f);
    assert.equal(activation.due,true,'registration is immediately due despite automatic search off and no configured days');
    await activate(f);
    await db.query(`update company_internal_roles set request=request||'updated' where role_id=$1`,[f.role]);
    await db.query(`update company_roles set status='paused' where role_id=$1`,[f.role]);
    await activate(f);
    assert.equal((await runs(f)).length,1,'registration retry, Brief edit and resume do not repeat the first run');
    const enqueue=async (activationId=activation.id,roleId=f.role,slot=activation.scheduled_slot)=> (await db.query(`select enqueue_company_scheduled_matching_v1($1,$2,$3,$4,$5,$6) as receipt`,[f.workspace,roleId,slot,f.actor,f.conversation,activationId])).rows[0].receipt;
    const root=await enqueue();
    assert.equal((await enqueue()).jobId,root.jobId,'lost endpoint response reuses root');
    await assert.rejects(enqueue(uuid()),/invalid_role_activation/);
    await assert.rejects(enqueue(activation.id,uuid()),/invalid_role_activation/);
    await assert.rejects(enqueue(null,f.role,'2026-09-13T00:00:00Z'),/scheduled_slot_not_due/);
    const opts={roleId:f.role,scope:'unassessed',startStage:1,limit:5000,recommendCount:20,activationRunId:uuid()};
    const child=(await db.query(`select enqueue_scheduled_matching_search_v1($1,'initial',$2) as receipt`,[root.jobId,JSON.stringify(opts)])).rows[0].receipt;
    const retry=(await db.query(`select enqueue_scheduled_matching_search_v1($1,'initial',$2) as receipt`,[root.jobId,JSON.stringify(opts)])).rows[0].receipt;
    assert.equal(child.runId,retry.runId);
    const stored=(await db.query(`select * from company_first_search_runs where id=$1`,[child.runId])).rows[0];
    assert.equal(stored.contract_version,'scheduled_agentic_role_search_v1');
    assert.equal(stored.request_options.activationRunId,activation.id,'caller cannot replace trusted origin');
    const inventory=(await db.query(`select company_scheduled_accepted_inventory_v1($1,$2,$3) as facts`,[f.workspace,f.role,activation.id])).rows[0].facts;
    assert.ok(inventory.currentRoutes.includes('company_first'),'one-time company path ignores auto schedule');
    assert.equal(inventory.currentRoutes.includes('candidate_first'),kind==='paid','Free remains company-first only');
    const talent=uuid(),review=uuid(),delivery=uuid();
    await db.query(`insert into company_workspace values($1,'Synthetic Labs','Synthetic Labs')`,[f.workspace]);
    await db.query(`insert into talent_users values($1,null,now())`,[talent]);
    await db.query(`insert into talent_setting values($1,true,'open_to_matches','{}')`,[talent]);
    await db.query(`insert into opportunity_discovery_run values($1,$2,jsonb_build_object('manualInternalRecommendation',jsonb_build_object('matchingReviewId',$3::text)))`,[delivery,talent,review]);
    await db.query(`insert into talent_opportunity_matching_review(id,run_id,opportunity_id,talent_id,discovery_run_id,decision,evaluation_ref,input_fingerprint)
      values($1,$2,$3,$4,$5,'candidate_first',jsonb_build_object('inputContractVersion','worker_behavior_v1',
        'briefVersion',company_role_search_brief_version_v1($3),'talentSourceFingerprint','talent-fingerprint',
        'companyMemoryFingerprint','memory-fingerprint','inputFingerprint','input-fingerprint'),'input-fingerprint')`,[review,child.runId,f.role,talent,delivery]);
    const canDeliver=async()=> (await db.query(`select scheduled_candidate_delivery_is_current_v1($1,$2,$3) as allowed`,[talent,f.role,delivery])).rows[0].allowed;
    assert.equal(await canDeliver(),kind==='paid','activation survives the final candidate-delivery weekday guard; paid entitlement remains required');
    await db.query(`update talent_setting set get_internal_recommendation=false where user_id=$1`,[talent]);
    assert.equal(await canDeliver(),false,'activation cannot bypass candidate consent');
    await db.query(`update talent_setting set get_internal_recommendation=true where user_id=$1`,[talent]);
    await db.query(`update company_first_search_runs set request_options=request_options-'activationRunId' where id=$1`,[child.runId]);
    const normalDay=(await db.query(`select to_char(now() at time zone 'Asia/Seoul','Dy') in ('Mon','Wed','Fri') as due`)).rows[0].due;
    assert.equal(await canDeliver(),kind==='paid'&&normalDay,'ordinary search retains the calendar guard');
    // An ordinary root created before this migration has no activation key. Its
    // child command must retain the same shape for an in-flight tool retry.
    const ordinary=uuid();
    await db.query(`insert into company_agent_web_action_jobs(id,company_workspace_id,role_id,conversation_id,actor_user_id,action_name,action_context)
      values($1,$2,$3,$4,$5,'scheduled_matching_review',jsonb_build_object('roleId',$3::uuid::text,'scheduledSlot',now()))`,[ordinary,f.workspace,f.role,f.conversation,f.actor]);
    const normalOptions={...opts};delete normalOptions.activationRunId;
    const normalChild=(await db.query(`select enqueue_scheduled_matching_search_v1($1,'initial',$2) as receipt`,[ordinary,JSON.stringify(normalOptions)])).rows[0].receipt;
    const normalStored=(await db.query(`select request_options from company_first_search_runs where id=$1`,[normalChild.runId])).rows[0].request_options;
    assert.equal(Object.hasOwn(normalStored,'activationRunId'),false,'ordinary command remains compatible with prior migration');
    assert.equal((await db.query(`select enqueue_scheduled_matching_search_v1($1,'initial',$2) as receipt`,[ordinary,JSON.stringify(normalOptions)])).rows[0].receipt.runId,normalChild.runId);
  }
  for (const options of [{testOnly:true},{expired:true},{kind:'unavailable'}]) {
    const f=await fixture(options);await activate(f);assert.equal((await runs(f)).length,0);
  }
  for (const signature of ['enqueue_company_scheduled_matching_v1(uuid,uuid,timestamptz,uuid,uuid,uuid)','company_matching_activation_is_valid_v1(uuid,uuid,uuid)','company_scheduled_accepted_inventory_v1(uuid,uuid,uuid)']) {
    assert.equal((await db.query(`select has_function_privilege('authenticated',$1,'execute') as allowed`,[signature])).rows[0].allowed,false);
  }
  console.log('PASS: immediate activation, once-only resume/retry, non-test/active/entitlement boundaries, shared regular root/child, trusted origin, server-only RPCs');
} catch (error) { console.error(error.message, error.detail ?? "", error.where ?? "", "position", error.position ?? ""); process.exitCode=1; } finally { await db.close(); }
