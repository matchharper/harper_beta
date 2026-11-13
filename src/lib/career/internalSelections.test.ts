import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { readInternalProposalContext, readPendingInternalProposals } from "./internalSelections";
const UNKNOWN_ROLE_FIX = "supabase/migrations/20261110014000_career_save_unknown_role.sql";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
 create table talent_users(user_id uuid primary key,deleted_at timestamptz);
 create table talent_setting(user_id uuid primary key,blocked_companies text[],is_onboarding_done boolean,updated_at timestamptz);
 create table talent_conversations(id uuid primary key,user_id uuid);
 create table company_workspace(company_workspace_id uuid primary key,company_name text,external_roles_enabled boolean);
 create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text,status text,is_expired boolean,expires_at timestamptz,information jsonb,name text);
 create table talent_opportunity_recommendation(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,kind text,opportunity_type text,rank integer,fit_summary text,fit_reasons jsonb,tradeoffs jsonb,evidence jsonb,feedback text,saved_stage text,shared_material_id uuid,created_at timestamptz default now());
 create table external_recommendation_runs(id uuid primary key default gen_random_uuid(),talent_id uuid,variant text,status text,lease_token uuid,lease_expires_at timestamptz,attempts int default 0,created_at timestamptz default now());
 create table opportunity_discovery_run(id uuid primary key default gen_random_uuid(),talent_id uuid,conversation_id uuid,trigger text,run_mode text,status text,dedupe_key text unique,trigger_payload jsonb,lease_token uuid,lease_heartbeat_at timestamptz,error_message text,completed_at timestamptz);
 create table talent_profiles(id uuid primary key,talent_id uuid);
 create table talent_profile_revisions(profile_id uuid,revision bigint);
 create table talent_role_materials(id uuid primary key,profile_id uuid,profile_revision bigint);
 create table company_role_candidate_evaluations(id uuid primary key,talent_id uuid,role_id uuid);
 create table company_intro_candidates(talent_id uuid,role_id uuid,recommendation_id uuid);
 create function publish_evaluated_internal_role_v1(uuid,uuid,uuid[],uuid,text) returns jsonb language sql as 'select null::jsonb';
 create view talent_effective_opportunity_recommendations_v1 as select * from talent_opportunity_recommendation;`);
  const historyMigration = await readFile(
    new URL(
      "../../../supabase/migrations/20260928045449_company_first_score_reuse_and_recommendation_history.sql",
      import.meta.url
    ),
    "utf8"
  );
  const currentFunctionStart = historyMigration.indexOf(
    "create or replace function public.current_talent_recommendation_id_v1"
  );
  await db.exec(
    historyMigration.slice(
      currentFunctionStart,
      historyMigration.indexOf(
        "revoke all on function public.current_talent_recommendation_id_v1",
        currentFunctionStart
      )
    )
  );
  await db.exec(
    await readFile(
      new URL(
        "../../../supabase/migrations/20261029183004_career_matching_workspaces.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  await db.exec("create function public.read_career_internal_role_v1(p_talent uuid,p_role uuid) returns jsonb language sql as 'select jsonb_build_object(''roleId'',$2)';");
  await db.exec(await readFile("supabase/migrations/20261104062544_career_internal_opportunity_publication.sql", "utf8"));
  await db.query("insert into talent_users values($1,null)", [id(1)]);
  await db.query("insert into company_workspace values($1,$2,true)", [
    id(2),
    "Synthetic",
  ]);
  await db.query(
    "insert into company_roles values($1,$2,'external','active',false,null,'{}','Engineer')",
    [id(3), id(2)]
  );
  await db.exec(`
    alter table talent_setting add column get_internal_recommendation boolean default true,add column profile_visibility text default 'exceptional_only';
    alter table company_workspace add column published_name text,add column company_description text;
    alter table company_roles add column description text,add column location_text text,add column work_mode text,add column salary_range text,add column source_provider text;
    alter table talent_opportunity_recommendation add column processed_stage text;
    alter table opportunity_discovery_run add column created_at timestamptz default now(),add column target_recommendation_count integer;
    alter table company_intro_candidates add column company_workspace_id uuid,add column status text;
    create table company_internal_roles(role_id uuid primary key,is_promote boolean default false,is_anonymous boolean default false,is_company_first_search boolean default true,intro_search_date text[]);
    create table official_jobs(id uuid default gen_random_uuid(),role_id uuid,is_published boolean,updated_at timestamptz default now(),role_title text,role_description_markdown text,company_name text,company_description_markdown text,location text,compensation text,slug text);
    create table company_first_search_runs(id uuid primary key,company_workspace_id uuid,role_id uuid,status text,source_cutoff timestamptz);
    create table talent_opportunity_matching_review(id uuid primary key default gen_random_uuid(),talent_id uuid,opportunity_id uuid,run_id uuid,decision text,closed_at timestamptz,recommendation_id uuid,discovery_run_id uuid,not_before timestamptz default now(),reviewed_at timestamptz default now());
    create table career_daily_sources(id uuid primary key default gen_random_uuid(),talent_id uuid,source_kind text,source_id text,run_id uuid,finished_at timestamptz,cancelled_at timestamptz);
    create table talent_opportunity_tag(id uuid,talent_id uuid,opportunity_id uuid,tag text,created_at timestamptz,updated_at timestamptz);
    create table company_slack_channels(id uuid,company_workspace_id uuid,is_enabled boolean);
    create table company_role_notification_channels(role_id uuid,channel_id uuid);
    alter table talent_users add column created_at timestamptz default now();
    create function accepted_role_pair_is_available_v1(uuid) returns boolean language sql as 'select false';
    create function role_matching_slot_type_v1(uuid,timestamptz) returns text language sql as $$select 'free'::text$$;
    create function company_matching_activation_is_valid_v1(uuid,uuid,uuid) returns boolean language sql as 'select false';
    create function company_role_candidate_email_enabled_v1(uuid) returns boolean language sql as 'select false';
    create function company_role_email_recipients_v1(uuid) returns setof text language sql as 'select null::text where false';
  `);
  await db.exec(await readFile('supabase/migrations/20261106075023_career_selected_internal_opportunities.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261105220100_career_internal_role_role_facts.sql','utf8'));
  await db.exec(await readFile(UNKNOWN_ROLE_FIX,'utf8'));
  await db.exec(await readFile('supabase/migrations/20261113062038_career_internal_role_canonical_context.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261113062929_career_internal_selection_public_sources.sql','utf8'));
  await db.query("insert into talent_setting(user_id) values($1)",[id(1)]);
  await db.query("update company_roles set source_type='internal',name='Engineer',description='Public work description' where role_id=$1",[id(3)]);
  await db.query("insert into company_internal_roles(role_id) values($1)",[id(3)]);
  await db.query("insert into company_first_search_runs(id,company_workspace_id,role_id) values($1,$2,$3)",[id(4),id(2),id(3)]);
  return db;
}

async function one(db: PGlite, sql: string, args: any[] = []) { return (await db.query<any>(sql,args)).rows[0]; }
async function selected(db: PGlite) {
  await db.query("insert into talent_opportunity_matching_review(id,talent_id,opportunity_id,run_id,decision) values($1,$2,$3,$4,'candidate_first')",[id(5),id(1),id(3),id(4)]);
  await db.query("insert into career_daily_sources(id,talent_id,source_kind,source_id) values($1,$2,'talent_selection',$3)",[id(6),id(1),id(5)]);
}
async function publish(db: PGlite, operation: string, backgroundRunId?: string) {
  const { revision } = await one(db,"select career_opportunity_list_revision($1) revision",[id(1)]);
  return one(db,"select write_career_opportunities($1,$2,$3) result",[id(1),operation,{action:'add',expectedRevision:revision,backgroundRunId,items:[{roleId:id(3),explanation:'Relevant ownership opportunity'}]}]);
}
function reader(db: PGlite) { return { rpc: async (_name: string, p: any) => {
  try { return {data:(await db.query("select * from read_career_internal_selections_v1($1,$2,$3,$4,$5)",[p.p_talent,p.p_offset,p.p_limit,p.p_companies,p.p_posting_url])).rows,error:null}; }
  catch(error) { return {data:null,error}; }
}} as any; }

test('proposal lookup resolves every public ad to its selected Role and retains anonymous source scope', async () => {
  const db = await database();
  try {
    await selected(db);
    await db.query(`insert into official_jobs(id,role_id,is_published,slug,role_title,company_name,role_description_markdown,updated_at)
      values ($1,$2,true,'older-ad','Public title A','Public company A','API work','2026-11-01'),
             ($3,$2,true,'newer-ad','Public title B','Public company B','Model work','2026-11-02')`, [id(20),id(3),id(21)]);
    for (const url of ['https://matchharper.com/jobs/older-ad','https://matchharper.com/jobs/newer-ad',`https://matchharper.com/jobs/${id(20)}`]) {
      const page = await readPendingInternalProposals({admin:reader(db),userId:id(1),postingUrl:url});
      assert.equal(page.total,1);
      assert.equal(page.proposals[0].title,'Engineer');
      assert.equal(page.proposals[0].company,'Synthetic');
    }
    await db.query('update company_internal_roles set is_anonymous=true where role_id=$1',[id(3)]);
    const page = await readPendingInternalProposals({admin:reader(db),userId:id(1),companyNames:['Public company A']});
    assert.equal(page.total,1);
    assert.equal(page.proposals[0].company,'Company');
    assert.ok(page.proposals[0].title.startsWith('Public advertisements: '));
    assert.ok(page.proposals[0].title.includes('Public title A'));
    assert.ok(page.proposals[0].title.includes('Public title B'));
    assert.doesNotMatch(JSON.stringify(page),/Synthetic|Public work description/);
    await db.query('update official_jobs set role_id=null where id=$1',[id(20)]);
    assert.equal((await readPendingInternalProposals({admin:reader(db),userId:id(1),postingUrl:'https://matchharper.com/jobs/older-ad'})).total,0);
  } finally { await db.close(); }
});

test('only existing owned company-side selections expose private Roles; reads never select or publish', async()=>{
  const db=await database(); try {
    await assert.rejects(db.query("select read_career_internal_role_v1($1,$2)",[id(1),id(3)]),/unavailable/);
    assert.equal((await readPendingInternalProposals({admin:reader(db),userId:id(1)})).total,0);
    await selected(db);
    const text=await readInternalProposalContext({admin:reader(db),userId:id(1)});
    assert.match(text,/Synthetic · Engineer/); assert.match(text,/not yet published: 1/);
    assert.doesNotMatch(text,/T\d{2}:|candidate_first|run_id|companyMemory/);
    assert.equal((await readPendingInternalProposals({admin:reader(db),userId:id(9)})).total,0);
    assert.equal((await readPendingInternalProposals({admin:reader(db),userId:id(1),companyNames:['unrelated']})).total,0);
    assert.equal((await one(db,'select count(*)::int n from talent_opportunity_recommendation')).n,0);
    await db.exec("update talent_opportunity_matching_review set decision='company_first'");
    assert.equal((await readPendingInternalProposals({admin:reader(db),userId:id(1)})).total,0);
    await db.exec("update talent_opportunity_matching_review set decision='candidate_first'; update talent_setting set blocked_companies=array['Synthetic']");
    assert.equal((await readPendingInternalProposals({admin:reader(db),userId:id(1)})).total,0);
  } finally {await db.close();}
});

test('publication consumes the same selection; retries and later daily work cannot create another recommendation',async()=>{
  const db=await database(); try {
    // Public readability does not authorize a new proactive recommendation.
    await db.exec("update company_internal_roles set is_promote=true");
    await db.query("insert into official_jobs(role_id,is_published,slug) values($1,true,'synthetic-engineer')",[id(3)]);
    assert.ok((await one(db,'select read_career_internal_role_v1($1,$2) facts',[id(1),id(3)])).facts);
    await assert.rejects(publish(db,'unselected'),/Selected internal proposal unavailable/);
    await selected(db);
    // Older selections for the same pair must not revive an extra daily update.
    await db.query("insert into talent_opportunity_matching_review(id,talent_id,opportunity_id,run_id,decision,reviewed_at) values($1,$2,$3,$4,'candidate_first',now()-interval '1 day')",[id(11),id(1),id(3),id(4)]);
    await db.query("insert into career_daily_sources(talent_id,source_kind,source_id) values($1,'talent_selection',$2)",[id(1),id(11)]);
    const before=await one(db,'select company_scheduled_accepted_inventory_v1($1,$2) facts',[id(2),id(3)]);
    assert.equal(before.facts.selectedUnpublished,1);
    await publish(db,'foreground'); await publish(db,'another-turn');
    assert.equal((await one(db,'select count(*)::int n from talent_opportunity_recommendation')).n,1);
    assert.equal((await one(db,'select count(*)::int n from talent_opportunity_matching_review where recommendation_id is not null')).n,2);
    assert.equal((await one(db,'select count(*)::int n from career_daily_sources where cancelled_at is not null')).n,2);
    assert.equal((await readPendingInternalProposals({admin:reader(db),userId:id(1)})).total,0);
    const after=await one(db,'select company_scheduled_accepted_inventory_v1($1,$2) facts',[id(2),id(3)]);
    assert.equal(after.facts.selectedUnpublished,0); assert.equal(after.facts.publishedAwaitingCandidate,1);
    assert.equal((await one(db,'select feedback from talent_opportunity_recommendation')).feedback,null);
  } finally {await db.close();}
});

test('an active daily sender owns publication; its receipt remains usable while foreground cannot race it',async()=>{
  const db=await database(); try {
    await selected(db);
    await db.query("insert into opportunity_discovery_run(id,talent_id,status,trigger_payload) values($1,$2,'handed_off','{\"runContract\":\"career_agent_v1\"}')",[id(7),id(1)]);
    await db.query('update career_daily_sources set run_id=$1',[id(7)]);
    await assert.rejects(publish(db,'foreground-race'),/already being prepared/);
    await assert.rejects(publish(db,'wrong-owner',id(8)),/invocation unavailable/);
    await publish(db,'daily-owner',id(7));
    assert.equal((await one(db,'select cancelled_at from career_daily_sources')).cancelled_at,null);
    assert.equal((await one(db,'select count(*)::int n from talent_opportunity_recommendation')).n,1);
  } finally {await db.close();}
});

test('expired, withdrawn, disabled, future and test-only selections cannot enter the new reader',async()=>{
  const db=await database(); try {
    await selected(db);
    for(const [change,restore] of [
      ["update company_roles set is_expired=true","update company_roles set is_expired=false"],
      ["update talent_opportunity_matching_review set closed_at=now()","update talent_opportunity_matching_review set closed_at=null"],
      ["update talent_opportunity_matching_review set not_before=now()+interval '1 day'","update talent_opportunity_matching_review set not_before=now()"],
      ["update talent_setting set get_internal_recommendation=false","update talent_setting set get_internal_recommendation=true"],
      ["update talent_setting set profile_visibility='dont_share'","update talent_setting set profile_visibility='exceptional_only'"],
      ["update company_roles set information='{\"testOnly\":true}'","update company_roles set information='{}'"],
    ]) { await db.exec(change); assert.equal((await readPendingInternalProposals({admin:reader(db),userId:id(1)})).total,0); await db.exec(restore); }
    assert.equal((await one(db,"select has_function_privilege('authenticated','read_career_internal_selections_v1(uuid,integer,integer,text[],text)','execute') ok")).ok,false);
  } finally {await db.close();}
});

test('an unknown Role id is refused by name instead of a database error, and nothing in that save is kept',async()=>{
  const db=await database(); try {
    await selected(db);
    for (const action of ['add','replace']) {
      const { revision } = await one(db,"select career_opportunity_list_revision($1) revision",[id(1)]);
      const items=[{roleId:id(3),explanation:'Relevant ownership opportunity'},{roleId:id(999),explanation:'Mistyped Role id'}];
      await assert.rejects(one(db,"select write_career_opportunities($1,$2,$3) result",[id(1),`unknown-${action}`,{action,expectedRevision:revision,items}]),new RegExp(`Role is unavailable: ${id(999)}`));
    }
    assert.equal((await one(db,'select count(*)::int n from talent_opportunity_recommendation')).n,0);
    assert.equal((await one(db,'select count(*)::int n from talent_matching_operations')).n,0);
    assert.equal((await publish(db,'valid-only')).result.recommendationIds.length,1);
  } finally {await db.close();}
});

test('the unknown-Role fix changes only the definition it was written for and can run again',async()=>{
  const db=await database(); try {
    const fix=await readFile(UNKNOWN_ROLE_FIX,'utf8');
    const body=async()=>(await one(db,"select md5(prosrc) body from pg_proc where oid='public.write_career_opportunities(uuid,text,jsonb)'::regprocedure")).body;
    const fixed=await body();
    await db.exec(fix);
    assert.equal(await body(),fixed);
    await db.exec("alter function public.write_career_opportunities(uuid,text,jsonb) security definer");
    await assert.rejects(db.exec(fix),/적용하지 않습니다/);
    await db.exec("create or replace function public.write_career_opportunities(p_talent uuid,p_operation text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$ begin return '{}'::jsonb; end $$");
    const other=await body();
    await assert.rejects(db.exec(fix),/적용하지 않습니다/);
    assert.equal(await body(),other);
  } finally {await db.close();}
});

test('onboarding queues one independent evaluation job and one Career invocation; repeat completion cannot add jobs',async()=>{
 const db=await database();try {
   await db.query('insert into talent_conversations values($1,$2)',[id(10),id(1)]);
   const call=()=>one(db,"select enqueue_career_onboarding_invocation($1,$2,'{}') result",[id(1),id(10)]);
   const first=await call(),second=await call();assert.equal(first.result.id,second.result.id);
   const rows=(await db.query<any>('select trigger,status,trigger_payload from opportunity_discovery_run')).rows;
   assert.equal(rows.length,2);
   const warmup=rows.find(r=>r.trigger==='onboarding_internal_evaluation');assert.ok(warmup);
   assert.equal(warmup.trigger_payload.onboardingRunId,first.result.id);assert.equal(warmup.status,'queued');
   assert.equal((await one(db,'select count(*)::int n from talent_opportunity_matching_review')).n,0);
 }finally{await db.close();}
});
