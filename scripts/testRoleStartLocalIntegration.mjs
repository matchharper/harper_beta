// Real role-start writers + local history trigger in an isolated PostgreSQL.
// Synthetic test-only Role; no production connection, model call or delivery.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
const brief = require('../src/lib/org/roleStart/brief.ts');
const presentation = require('../src/lib/companyFirstSearch/presentation.ts');
const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const db = new PGlite();
const sql = async (strings, ...values) => (await db.query(strings.reduce((s, part, i) => s + (i ? `$${i}` : '') + part, ''), values)).rows;
sql.json = JSON.stringify;
sql.begin = async (fn) => {
  await db.exec('begin');
  try { const value = await fn(sql); await db.exec('commit'); return value; }
  catch (error) { await db.exec('rollback'); throw error; }
};
const after = [];
function load(file, imports) {
  const output = ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${output}\n})`, { console, Date, crypto: globalThis.crypto }, { filename: file })((name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const roleId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const workspaceId = '00000000-0000-4000-8000-000000000003';
const talentId = '00000000-0000-4000-8000-000000000004';
const original = brief.normalizeRoleStartBrief({ summary: '기존 요약', hardConditions: [], criteria: [{ id: 'cr_one', name: '경험', criteria: '기존 경험' }] });
const updated = brief.normalizeRoleStartBrief({ ...original, summary: '수정된 요약', criteria: [{ ...original.criteria[0], criteria: '새 기준' }] });
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table company_workspace(company_workspace_id uuid primary key);
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,name text,request text,information jsonb,updated_at timestamptz);
    create table company_internal_roles(role_id uuid primary key,request text,criteria jsonb,updated_at timestamptz);
    create table company_users(user_id uuid primary key,name text);
    create table company_agent_web_action_jobs(id uuid primary key);
    create table company_role_start_sessions(role_id uuid primary key,brief jsonb);
    create table company_role_brief_versions(role_id uuid,version int,brief jsonb,change_source text,change_summary text,created_by uuid,primary key(role_id,version));
    create table company_role_candidate_evaluations(id uuid primary key,role_id uuid,talent_id uuid,run_id uuid,stage text,evaluation jsonb);
  `);
  await db.query('insert into company_workspace values($1)', [workspaceId]);
  await db.query('insert into company_users values($1,$2)', [userId, '테스트 팀원']);
  await db.query('insert into company_roles(role_id,company_workspace_id,name,information) values($1,$2,$3,$4)', [roleId, workspaceId, '격리 테스트 역할', JSON.stringify({ testOnly: true, testFixture: 'role-start-local-merge' })]);
  await db.query('insert into company_internal_roles(role_id,request,criteria) values($1,$2,$3)', [roleId, '기존 본문', JSON.stringify(original.criteria)]);
  await db.query('insert into company_role_start_sessions values($1,$2)', [roleId, JSON.stringify(updated)]);
  await db.query('insert into company_role_candidate_evaluations values(gen_random_uuid(),$1,$2,gen_random_uuid(),$3,$4)', [roleId, talentId, 'review', '{"original":true}']);
  const ledger = (await db.query('select * from company_role_candidate_evaluations')).rows;
  const historySql = source('supabase/migrations/20261022094500_company_hiring_brief_history.sql');
  await db.exec(historySql.split('-- A Hiring Brief is free text.')[0]);
  await db.exec(historySql.match(/create trigger company_hiring_brief_history_capture[\s\S]*?;/)[0]);
  await db.exec(source('supabase/migrations/20261023000500_role_candidate_evaluation_overlay.sql'));
  const session = load('src/lib/org/roleStart/session.ts', {
    'server-only': {}, 'next/server': { after: (fn) => after.push(fn) }, './brief': brief,
    './db': { roleStartSql: () => sql }, './ownership': {},
  });
  assert.equal(await session.saveBriefVersion({ roleId, brief: updated, changeSource: 'filter_panel', changeSummary: '팀원 수정', userId, writeRole: true, historySource: 'website', requestReview: true }), 1);
  const [history] = (await db.query('select * from company_role_hiring_brief_history')).rows;
  assert.equal(history.actor_user_id, userId);
  assert.equal(history.actor_label, '테스트 팀원');
  assert.equal(history.source, 'website');
  assert.equal(history.request_review, true);
  assert.equal(history.summary_status, 'pending');
  assert.equal(history.before_snapshot.request, '기존 본문');
  assert.equal(history.after_snapshot.request, brief.renderBriefMarkdown(updated));
  assert.equal(history.after_snapshot.criteria[0].criteria, '새 기준');
  assert.equal(after.length, 1, 'History summary dispatch is scheduled after commit');
  await session.saveBriefVersion({ roleId, brief: updated, changeSource: 'filter_panel', changeSummary: null, userId, writeRole: true, historySource: 'website', requestReview: true });
  assert.equal((await db.query('select * from company_role_hiring_brief_history')).rows.length, 1, 'No-op save creates no history');
  assert.equal(after.length, 1);
  const third = brief.normalizeRoleStartBrief({ ...updated, criteria: [{ ...updated.criteria[0], criteria: '배경 수정' }] });
  await db.query('update company_role_start_sessions set brief=$1 where role_id=$2', [JSON.stringify(third), roleId]);
  await session.saveBriefVersion({ roleId, brief: third, changeSource: 'background', changeSummary: null, userId: null, writeRole: 'criteria', requestReview: true });
  const [background] = (await db.query("select * from company_role_hiring_brief_history where source='background'")).rows;
  assert.equal(background.actor_user_id, null);
  assert.equal(background.request_review, false);
  assert.equal(background.after_snapshot.request, history.after_snapshot.request, 'Criteria-only edit preserves authored text');

  await db.query('update company_role_start_sessions set criterion_evaluations=$1 where role_id=$2', [JSON.stringify({ other: { briefVersion: 1, evaluations: [{ name: 'preserved' }] } }), roleId]);
  let judge = async () => ({ verdict: { criteria: [{ name: '경험', fitness: 'good', evidence: '새 기준 근거' }] }, usage: {} });
  const rubric = load('src/lib/org/roleStart/rubricUpdate.ts', {
    'server-only': {}, '@/lib/org/server': {}, '@/lib/org/agent/roleCreationState': {},
    '@/lib/org/roleCriteria': {}, '@/lib/server/candidateAccess': {}, './brief': brief,
    '@/lib/companyFirstSearch/presentation': presentation, './db': { roleStartSql: () => sql },
    './fastPath': {}, './llm': {}, './profiles': { loadRoleStartProfiles: async () => new Map([[talentId, {}]]) },
    './prompts': {}, './questions': {}, './session': { ...session, appendRoleStartUsage: async () => {}, mergeRoleStartTimings: async () => {} },
    './service': {}, './verdicts': { writeVerdict: (args) => judge(args) }, './view': {},
  });
  const regrade = () => rubric.regradeAfterRegistration({ roleId, before: original, after: updated, people: [{ talentId, evaluations: [{ name: '경험', fitness: 'excellent', content: '이전 근거' }] }] });
  assert.equal(await regrade(), 1);
  const cache = async () => (await db.query('select criterion_evaluations from company_role_start_sessions where role_id=$1', [roleId])).rows[0].criterion_evaluations;
  assert.equal((await cache())[talentId].evaluations[0].content, '새 기준 근거');
  assert.deepEqual((await cache()).other, { briefVersion: 1, evaluations: [{ name: 'preserved' }] });
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  judge = () => { started(); return new Promise(resolve => { release = resolve; }); };
  const pending = regrade();
  await entered;
  await db.query("update company_role_start_sessions set criterion_evaluations=jsonb_set(criterion_evaluations,array[$1::text],$2::jsonb) where role_id=$3", [talentId, JSON.stringify({ briefVersion: 4, evaluations: [{ name: '새 변경 보존' }] }), roleId]);
  release({ verdict: { criteria: [{ name: '경험', fitness: 'bad', evidence: '지연된 결과' }] }, usage: {} });
  await pending;
  assert.deepEqual((await cache())[talentId], { briefVersion: 4, evaluations: [{ name: '새 변경 보존' }] }, 'Stale grade cannot overwrite a newer Brief');
  assert.deepEqual((await db.query('select * from company_role_candidate_evaluations')).rows, ledger, 'Durable search ledger is unchanged');
  console.log('role start local integration: history author/review/dispatch, no-op, criteria-only edits, grade cache and stale-result protection: ok');
} finally { await db.close(); }
