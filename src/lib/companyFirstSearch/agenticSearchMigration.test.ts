import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const workspace = '00000000-0000-4000-8000-000000000001';
const role = '00000000-0000-4000-8000-000000000002';
const user = '00000000-0000-4000-8000-000000000003';
const membership = '00000000-0000-4000-8000-000000000004';
// Disposable PostgreSQL interpreter. No app client, real data, network or worker.
async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table company_workspace(company_workspace_id uuid primary key,company_name text,published_name text);
    create table company_workspace_teams(id uuid primary key,company_workspace_id uuid,deleted_at timestamptz);
    create table company_user_workspace(id uuid primary key,company_workspace_id uuid,company_user_id uuid,authority text,access_scope text,team_id uuid);
    create table company_workspace_team_members(membership_id uuid,team_id uuid);
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,name text,description text,
      location_text text,country_code text,work_mode text,type text,seniority_level text,salary_range text,
      salary_min numeric,salary_max numeric,salary_currency text,salary_period text,source_type text,status text,
      is_expired boolean,expires_at timestamptz,information jsonb);
    create table company_internal_roles(role_id uuid primary key,request text,criteria jsonb,team_id uuid);
    create table company_first_search_runs(id uuid primary key default gen_random_uuid(),company_workspace_id uuid,
      role_id uuid,scheduled_slot timestamptz,trigger_reason text,contract_version text,status text,
      requested_role_ids uuid[],scheduled_role_ids uuid[],source_cutoff timestamptz,source_snapshot jsonb,
      created_at timestamptz default now());
    create table talent_users(user_id uuid primary key,created_at timestamptz,deleted_at timestamptz);
    create table talent_setting(user_id uuid,is_onboarding_done boolean,profile_visibility text,get_internal_recommendation boolean,blocked_companies text[]);
    create table company_intro_candidates(id uuid primary key,close_reason text);
    create function role_matching_slot_type_v1(uuid,timestamptz) returns text language sql as $$select 'paid'::text$$;
  `);
  await db.exec(readFileSync('supabase/migrations/20261022041333_company_agentic_role_search.sql', 'utf8'));
  await db.query('insert into company_workspace values($1,$2,null)', [workspace,'Isolated test']);
  await db.query('insert into company_user_workspace values($1,$2,$3,$4,$5,null)', [membership,workspace,user,'owner','organization']);
  await db.query(`insert into company_roles(role_id,company_workspace_id,name,source_type,status,is_expired,information)
    values($1,$2,'Isolated role','internal','active',false,'{"testOnly":true,"testFixture":"agentic-search-machine-boundary"}')`,[role,workspace]);
  await db.query('insert into company_internal_roles values($1,$2,$3,null)',[role,'Isolated brief','[]']);
  return db;
}

test('new receipts preserve brief identity, test isolation and private RPC grants', async () => {
  const db=await database();
  try {
    const initial = (await db.query<{version:string}>('select company_role_search_brief_version_v1($1) version',[role])).rows[0].version;
    const queued = (await db.query<{result:any}>(`select enqueue_company_agentic_search_v1($1,$2,$3,'{}','isolated-new') result`,[workspace,user,role])).rows[0].result;
    assert.equal(queued.reason,'test_role');
    await db.query(`insert into company_first_search_runs(company_workspace_id,role_id,contract_version,status,request_options)
      values($1,$2,'company_agentic_role_search_v1','failed',$3)`,[workspace,role,JSON.stringify({scope:'unassessed',roleId:role,briefVersion:initial,requestId:'same-command'})]);
    await db.query('update company_roles set salary_min=100 where role_id=$1',[role]);
    const changed = (await db.query<{version:string}>('select company_role_search_brief_version_v1($1) version',[role])).rows[0].version;
    assert.notEqual(changed,initial);
    const repeated=(await db.query<{result:any}>(`select enqueue_company_agentic_search_v1($1,$2,$3,'{"scope":"unassessed"}','same-command') result`,[workspace,user,role])).rows[0].result;
    assert.equal(repeated.status,'already_completed'); assert.equal(repeated.runStatus,'failed'); assert.equal(repeated.briefVersion,initial);
    await assert.rejects(db.query(`select enqueue_company_agentic_search_v1($1,$2,$3,'{"scope":"all"}','same-command')`,[workspace,user,role]),/search_request_conflict/);
    for (const fn of ['company_role_search_inventory_v1(uuid,uuid,text)','write_company_memory_v1(uuid,uuid,text,jsonb)','enqueue_company_agentic_search_v1(uuid,uuid,uuid,jsonb,text)']) {
      const access=await db.query<{allowed:boolean}>("select has_function_privilege('anon',$1,'execute') allowed",[fn]);
      assert.equal(access.rows[0].allowed,false);
    }
  } finally { await db.close(); }
});

test('memory batch retry is idempotent and revision conflict rolls back every change',async()=>{
  const db=await database();
  try {
    const changes=JSON.stringify([{op:'add',scope:'role',roleId:role,label:'Free label',content:'Isolated fact'}]);
    const args=[workspace,user,'memory-once',changes];
    const first=(await db.query<{result:any}>('select write_company_memory_v1($1,$2,$3,$4) result',args)).rows[0].result;
    const again=(await db.query<{result:any}>('select write_company_memory_v1($1,$2,$3,$4) result',args)).rows[0].result;
    assert.deepEqual(again,first);
    const ref=first.applied[0].ref;
    await assert.rejects(db.query('select write_company_memory_v1($1,$2,$3,$4)',[workspace,user,'conflicting-batch',JSON.stringify([
      {op:'add',scope:'role',roleId:role,content:'Must roll back'}, {op:'update',ref,revision:99,content:'Must not replace'}
    ])]),/memory_revision_conflict/);
    assert.equal((await db.query<{count:number}>('select count(*)::int count from company_memory_entries')).rows[0].count,1);
    await db.query("update company_user_workspace set authority='viewer' where id=$1",[membership]);
    await assert.rejects(db.query('select write_company_memory_v1($1,$2,$3,$4)',[workspace,user,'viewer-write',changes]),/memory_workspace_forbidden/);
  } finally { await db.close(); }
});
