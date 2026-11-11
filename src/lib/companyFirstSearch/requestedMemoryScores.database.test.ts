import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { loadSnapshot, type PublicationCommand, type Query } from './publication/repository';

// Requested-search scores that read candidate Memory stop counting as current (Worker
// PR-3 option (b)). Disposable PostgreSQL interpreter; the ledger table, its later
// columns, the readable view and both function definitions come from the real
// migrations. No app client, real data, network or worker.
const migrations = 'supabase/migrations/';
const read = (name: string) => readFileSync(migrations + name, 'utf8');
const statement = (name: string, start: string, end = ';') => {
  const text = read(name), begin = text.indexOf(start);
  assert.ok(begin >= 0, `${start} in ${name}`);
  return text.slice(begin, text.indexOf(end, begin) + end.length);
};
const created = read('20261022041333_company_agentic_role_search.sql');
const ledger = created.slice(created.indexOf('create table public.company_role_candidate_evaluations'),
  created.indexOf('create index company_role_evaluations_version_idx'));
const previousDefinition = statement('20261022131500_company_search_inventory_provenance.sql',
  'create or replace function public.company_role_search_inventory_v1', '\n$$;');
const migration = read('20261111060000_requested_search_old_memory_scores.sql');
const guardMd5 = /md5\(definition\) <> '([0-9a-f]{32})'/.exec(migration)![1];
const inventoryFunction = "'public.company_role_search_inventory_v1(uuid,uuid,text)'::regprocedure";

const workspace = '00000000-0000-4000-8000-000000000001', role = '00000000-0000-4000-8000-000000000002';
const user = '00000000-0000-4000-8000-000000000003';
const talentNames = ['memory', 'pr3', 'scheduled', 'opportunity', 'preview', 'screen', 'memory_screen_only',
  'both', 'exclusion_then_memory_pass', 'never'] as const;
type Talent = typeof talentNames[number];
const talents = Object.fromEntries(talentNames.map((name, index) =>
  [name, `00000000-0000-4000-8000-1000000000${String(index).padStart(2, '0')}`])) as Record<Talent, string>;
const runs = {old: '00000000-0000-4000-8000-200000000001', pr3: '00000000-0000-4000-8000-200000000002',
  scheduled: '00000000-0000-4000-8000-200000000003', preview: '00000000-0000-4000-8000-200000000004'};
const discovery = '00000000-0000-4000-8000-300000000001';
const ids: Record<string, string> = {};

async function database() {
  const db = new PGlite();
  await db.exec(`
    create table public.company_workspace(company_workspace_id uuid primary key,company_name text,published_name text,
      company_db_id bigint,locale text);
    create table public.company_db(id bigint primary key,location text);
    create table public.company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text,status text,
      is_expired boolean,expires_at timestamptz,information jsonb,name text,description text,salary_range text,
      salary_min numeric,salary_max numeric,salary_currency text,salary_period text);
    create table public.company_internal_roles(role_id uuid primary key,request text,criteria jsonb);
    create table public.company_behavior_contexts(role_id uuid,text_context text);
    create table public.talent_users(user_id uuid primary key,deleted_at timestamptz,created_at timestamptz default now()-interval '1 day',
      name text,headline text,bio text,location text,current_location text);
    create table public.talent_setting(user_id uuid primary key,is_onboarding_done boolean default true,
      profile_visibility text default 'open_to_matches',get_internal_recommendation boolean default true,blocked_companies text[]);
    create table public.company_first_search_runs(id uuid primary key,company_workspace_id uuid,role_id uuid,
      requested_role_ids uuid[],scheduled_role_ids uuid[],contract_version text,status text,
      source_snapshot jsonb,result jsonb,source_cutoff timestamptz,request_options jsonb default '{}');
    create table public.opportunity_discovery_run(id uuid primary key,trigger text);
    create table public.talent_opportunity_recommendation(id uuid,talent_id uuid,role_id uuid,shared_material_id uuid,
      feedback text,saved_stage text,processed_stage text);
    create table public.talent_role_materials(id uuid primary key,profile_id uuid,profile_revision bigint);
    create table public.talent_opportunity_tag(talent_id uuid,opportunity_id uuid);
    create table public.company_intro_candidates(id uuid primary key,company_workspace_id uuid,role_id uuid,talent_id uuid,
      revision integer,status text,requested_at timestamptz,recommendation_id uuid,close_reason text,talent_decision_at timestamptz);
    create table public.talent_experiences(talent_id uuid,company_name text,role text,start_date date,end_date date,
      description text,created_at timestamptz);
    create table public.talent_educations(talent_id uuid,school text,degree text,field text,start_date date,end_date date,
      description text,created_at timestamptz);
    create table public.talent_extras(talent_id uuid,content jsonb);
    create table public.talent_contexts(talent_id uuid,label text,content text,revision integer,ref text,
      created_at timestamptz,updated_at timestamptz,deleted_at timestamptz,collection text);
    create function public.company_role_search_brief_version_v1(uuid) returns text language sql as $$select 'brief'::text$$;
    create function public.company_role_search_brief_snapshot_v1(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.role_matching_slot_type_v1(uuid,timestamptz) returns text language sql as $$select 'paid'::text$$;
    create function public.company_first_pair_is_available_v1(uuid,uuid) returns boolean language sql as $$select true$$;
  `);
  await db.exec(ledger);
  await db.exec(statement('20261023102919_scheduled_agentic_matching.sql', 'alter table public.company_role_candidate_evaluations'));
  await db.exec(statement('20261026051109_shared_worker_role_evaluations.sql', 'alter table public.company_role_candidate_evaluations'));
  await db.exec(statement('20261029183004_career_matching_workspaces.sql', 'alter table public.company_role_candidate_evaluations'));
  await db.exec(statement('20261103125705_internal_role_agent_introductions.sql', 'create or replace view public.company_readable_role_evaluations_v1'));
  await db.exec(previousDefinition);
  await db.query(`insert into public.company_workspace values($1,'Synthetic company',null,null,'ko')`, [workspace]);
  await db.query(`insert into public.company_roles(role_id,company_workspace_id,source_type,status,is_expired,information,name,description)
    values($1,$2,'internal','active',false,'{}','Synthetic role','')`, [role, workspace]);
  await db.query(`insert into public.company_internal_roles values($1,'Synthetic hiring brief','[]')`, [role]);
  for (const [name, id] of Object.entries(talents)) {
    await db.query('insert into public.talent_users(user_id,name,headline) values($1,$2,$3)', [id, name, 'Synthetic headline']);
    await db.query('insert into public.talent_setting(user_id) values($1)', [id]);
  }
  const contracts = {old: 'company_agentic_role_search_v1', pr3: 'company_agentic_role_search_v1',
    scheduled: 'scheduled_agentic_role_search_v1', preview: 'scheduled_matching_preview_v1'};
  for (const [key, id] of Object.entries(runs))
    await db.query(`insert into public.company_first_search_runs(id,company_workspace_id,role_id,contract_version,status)
      values($1,$2,$3,$4,'succeeded')`, [id, workspace, role, contracts[key as keyof typeof runs]]);
  await db.query(`insert into public.opportunity_discovery_run values($1,'opportunity')`, [discovery]);
  let next = 0;
  const row = async (name: string, talent: Talent, stage: number, {run = null as string | null, contract = null as string | null,
    proceed = true, minutes = 0, discoveryRun = null as string | null} = {}) => {
    ids[name] = `00000000-0000-4000-8000-4000000000${String(next++).padStart(2, '0')}`;
    await db.query(`insert into public.company_role_candidate_evaluations(id,company_workspace_id,role_id,talent_id,run_id,
      discovery_run_id,brief_version,stage,input_fingerprint,assessment,input_contract_version,evaluated_at)
      values($1,$2,$3,$4,$5,$6,'brief',$7,$8,$9,$10,timestamptz '2026-11-01 00:00+00'+make_interval(mins=>$11))`,
    [ids[name], workspace, role, talents[talent], run, discoveryRun, stage, name,
      JSON.stringify({proceedToStage2: proceed, mutualFit: 70}), contract, minutes]);
  };
  const worker = 'worker_behavior_v1';
  // Requested search before company_requested_behavior_v1: NULL contract, read candidate Memory.
  await row('memory-1', 'memory', 1, {run: runs.old});
  await row('memory-2', 'memory', 2, {run: runs.old, minutes: 1});
  await row('memory-screen', 'memory_screen_only', 1, {run: runs.old, proceed: false});
  // Requested search after the Worker change, a stage-3 explanation (NULL), scheduled search,
  // Opportunity (no company run) and the operator preview (NULL contract, other run contract).
  await row('pr3-2', 'pr3', 2, {run: runs.pr3, contract: 'company_requested_behavior_v1'});
  await row('explanation-3', 'pr3', 3, {run: runs.old, minutes: 2});
  await row('scheduled-1', 'scheduled', 1, {run: runs.scheduled, contract: worker});
  await row('scheduled-2', 'scheduled', 2, {run: runs.scheduled, contract: worker, minutes: 1});
  await row('opportunity-2', 'opportunity', 2, {contract: worker, discoveryRun: discovery});
  await row('preview-2', 'preview', 2, {run: runs.preview});
  // A Memory-era stage-one exclusion recorded after a Worker stage-two score no longer retires it.
  await row('screen-2', 'screen', 2, {run: runs.scheduled, contract: worker});
  await row('screen-memory-1', 'screen', 1, {run: runs.old, proceed: false, minutes: 5});
  // A newer Memory-era stage-two score does not replace an older current one.
  await row('both-2', 'both', 2, {run: runs.scheduled, contract: worker});
  await row('both-memory-2', 'both', 2, {run: runs.old, minutes: 3});
  // A Memory-era stage-one pass does not undo an earlier current exclusion.
  await row('exclusion-1', 'exclusion_then_memory_pass', 1, {run: runs.scheduled, contract: worker, proceed: false});
  await row('memory-pass-1', 'exclusion_then_memory_pass', 1, {run: runs.old, minutes: 5});
  return db;
}

const inventory = async (db: PGlite) => (await db.query<{value: Record<string, unknown>}>(
  'select public.company_role_search_inventory_v1($1,$2,$3) as value', [workspace, role, 'brief'])).rows[0].value;
const definitionMd5 = async (db: PGlite) =>
  (await db.query<{md5: string}>(`select md5(pg_get_functiondef(${inventoryFunction})) as md5`)).rows[0].md5;

test('unevaluated count treats requested-search scores that read candidate Memory as not evaluated', async () => {
  const db = await database();
  try {
    const before = await inventory(db);
    assert.equal(before.shareable, talentNames.length);
    // Before: only 'never' and the exclusion retired by a later Memory-era pass are unevaluated.
    assert.equal(before.unassessed, 2);
    await db.exec(migration);
    const after = await inventory(db);
    assert.equal(after.shareable, talentNames.length);
    // After: people whose only scores read candidate Memory are evaluated again; the earlier
    // current exclusion stands. Every other row type still counts.
    assert.equal(after.unassessed, 3);
    assert.equal(after.newUnassessed, 3);
    const stored = (await db.query<{count: number}>('select count(*)::int as count from public.company_role_candidate_evaluations')).rows[0].count;
    assert.equal(stored, Object.keys(ids).length);
  } finally { await db.close(); }
});

test('the migration guard accepts the copied definition and a re-run, and stops on any other definition', async () => {
  const db = await database();
  try {
    // The md5 in the guard is pg_get_functiondef of the 20261022131500 definition on this engine.
    assert.equal(await definitionMd5(db), guardMd5);
    await db.exec(migration);
    const applied = await definitionMd5(db);
    assert.notEqual(applied, guardMd5);
    await db.exec(migration);
    assert.equal(await definitionMd5(db), applied);
    const changed = previousDefinition.replace("where company_workspace_id=p_workspace and status='succeeded'",
      "where company_workspace_id=p_workspace and status in ('succeeded')");
    assert.notEqual(changed, previousDefinition);
    await db.exec(changed);
    const live = await definitionMd5(db);
    await assert.rejects(db.exec(migration), /inventory_definition_changed/);
    assert.equal(await definitionMd5(db), live);
    await db.exec('drop function public.company_role_search_inventory_v1(uuid,uuid,text)');
    await assert.rejects(db.exec(migration), /inventory_definition_changed: .* does not exist/);
  } finally { await db.close(); }
});

test('web publication uses the same current scores and refuses a source run scored with candidate Memory', async () => {
  const db = await database();
  try {
    const query: Query = async (text, params = []) => (await db.query<Record<string, any>>(text, params)).rows;
    const command = (talent: Talent[], sourceRunId?: string): PublicationCommand => ({workspaceId: workspace, userId: user, roleId: role,
      requestId: 'synthetic', kind: 'add', talentIds: talent.map(name => talents[name]), ...(sourceRunId ? {sourceRunId} : {})});
    const evaluation = async (talent: Talent) => (await loadSnapshot(query, command([talent]))).candidates[0].evaluationId;
    assert.equal(await evaluation('pr3'), ids['pr3-2']);
    assert.equal(await evaluation('preview'), ids['preview-2']);
    assert.equal(await evaluation('screen'), ids['screen-2']);
    assert.equal(await evaluation('both'), ids['both-2']);
    await assert.rejects(loadSnapshot(query, command(['memory'])), /lacks current stage-two evidence/);
    const source = async (run: string, references: string[] | null) => db.query(
      'update public.company_first_search_runs set source_snapshot=$2,result=$3 where id=$1',
      [run, JSON.stringify({roleSearchBrief: {version: 'brief'}}),
        JSON.stringify({roleSearch: references ? {evidence: {evaluationIds: references.map(name => ids[name])}} : {}})]);
    await source(runs.old, ['memory-1', 'memory-2']);
    await assert.rejects(loadSnapshot(query, command(['memory'], runs.old)), /made with candidate Memory; run a new search/);
    await source(runs.old, null);
    await assert.rejects(loadSnapshot(query, command(['memory'], runs.old)), /made with candidate Memory/);
    await source(runs.pr3, ['pr3-2']);
    assert.equal((await loadSnapshot(query, command(['pr3'], runs.pr3))).candidates[0].evaluationId, ids['pr3-2']);
    await source(runs.scheduled, ['scheduled-1', 'scheduled-2']);
    assert.equal((await loadSnapshot(query, command(['scheduled'], runs.scheduled))).candidates[0].evaluationId, ids['scheduled-2']);
  } finally { await db.close(); }
});
