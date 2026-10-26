// Isolated PostgreSQL: real closing and reopening rules, synthetic Role, no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const fn = (sql, name) => sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))[0];
const db = new PGlite();
const rows = async (sql) => (await db.query(sql)).rows;
const role = '00000000-0000-4000-8000-000000000002';
const talent = (n) => `00000000-0000-4000-8000-0000000001${n}`;
const status = async () => Object.fromEntries((await rows(`select id::text, status || ':' || coalesce(close_reason, '') as s from company_intro_candidates order by id`)).map((r) => [r.id.slice(-2), r.s]));
const setRole = (value) => db.exec(`update company_roles set status = '${value}' where role_id = '${role}'`);
const intro = (id, n, state, extra = '') => db.exec(`insert into company_intro_candidates(id,company_workspace_id,role_id,talent_id,status${extra ? ',' + extra.split('=')[0] : ''}) values('00000000-0000-4000-8000-0000000000${id}','00000000-0000-4000-8000-000000000001','${role}','${talent(n)}','${state}'${extra ? ',' + extra.split('=')[1] : ''})`);
try {
await db.exec(`
create role anon; create role authenticated;
create table company_workspace(company_workspace_id uuid primary key,company_name text,published_name text);
create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text,status text,is_expired boolean,expires_at timestamptz,information jsonb);
create table company_internal_roles(role_id uuid primary key,role_status_changed_at timestamptz);
create table talent_users(user_id uuid primary key,deleted_at timestamptz);
create table talent_setting(user_id uuid primary key,blocked_companies text[]);
create table company_intro_candidates(id uuid primary key,company_workspace_id uuid,role_id uuid,talent_id uuid,recommendation_id uuid,status text,close_reason text,revision int default 1,created_at timestamptz default clock_timestamp(),updated_at timestamptz default now(),talent_decision_at timestamptz,requested_at timestamptz,candidate_sent_at timestamptz);
create unique index company_intro_candidates_active_pair_idx on company_intro_candidates(role_id,talent_id) where status in ('ready','awaiting_talent','connecting');
create table talent_opportunity_recommendation(id uuid primary key,opportunity_type text,saved_stage text,dismissed_at timestamptz,updated_at timestamptz);
`);
await db.exec(fn(migration('20260918015954_relax_company_intro_constraints_and_fixture_guards.sql'), 'company_intro_role_allows_talent_v1'));
await db.exec(fn(migration('20260918022746_company_intro_acceptance_handoff.sql'), 'close_company_intro_on_role_change_v1'));
await db.exec(fn(migration('20261016103717_reconcile_manual_company_context_runtime.sql'), 'track_company_role_status_and_enqueue_context_v1'));
await db.exec(`
create trigger company_role_close_company_intro_on_change after update of company_workspace_id, source_type, status, is_expired, expires_at, information on company_roles for each row execute function close_company_intro_on_role_change_v1();
create trigger company_roles_track_status_and_enqueue_context_v1 after update of status on company_roles for each row execute function track_company_role_status_and_enqueue_context_v1();
`);
await db.exec(migration('20261023000100_reopen_company_intro_on_role_resume.sql'));
await db.exec(migration('20261023000200_reopen_company_intro_only_this_ending.sql'));
await db.exec(`
insert into company_workspace values('00000000-0000-4000-8000-000000000001','Synthetic Co',null);
insert into company_roles values('${role}','00000000-0000-4000-8000-000000000001','internal','active',false,null,'{"testOnly":true,"testTalentIds":["${talent('01')}","${talent('02')}","${talent('03')}","${talent('04')}","${talent('05')}","${talent('06')}"]}');
insert into company_internal_roles values('${role}',now() - interval '1 day');
insert into talent_users select ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, null from generate_series(1, 6) n;
insert into talent_setting select user_id, '{}' from talent_users;
`);
await intro(11, '01', 'ready');
await intro(12, '02', 'awaiting_talent', 'candidate_sent_at=now()');
await intro(13, '03', 'passed');

// Pausing closes nothing.
await setRole('paused');
await setRole('active');
assert.deepEqual(await status(), { 11: 'ready:', 12: 'awaiting_talent:', 13: 'passed:' });

// Ending closes open proposals, exactly as before.
await setRole('ended');
assert.deepEqual(await status(), { 11: 'closed:role_closed', 12: 'closed:role_closed', 13: 'passed:' });

// Resuming reopens only the proposal the candidate never saw.
await setRole('active');
assert.deepEqual(await status(), { 11: 'ready:', 12: 'closed:role_closed', 13: 'passed:' });
assert.equal((await rows(`select revision from company_intro_candidates where id::text like '%11'`))[0].revision, 3);

// Resuming into pause works too; a newer proposal for the same person keeps the old one closed.
await setRole('ended');
await intro(14, '01', 'ready');
await setRole('paused');
assert.deepEqual(await status(), { 11: 'closed:role_closed', 12: 'closed:role_closed', 13: 'passed:', 14: 'ready:' });

// A newer proposal the person already declined also keeps the old one closed.
await db.exec(`update company_intro_candidates set status = 'closed', close_reason = 'talent_declined', talent_decision_at = now() where id::text like '%14'`);
await setRole('active');
await db.exec(`update company_intro_candidates set status = 'ready', close_reason = null where id::text like '%11'`);
await setRole('ended');
await setRole('active');
assert.equal((await status())[11], 'closed:role_closed');

// Requested, decided or recommended proposals stay closed.
await intro(21, '04', 'ready', 'requested_at=now()');
await intro(22, '05', 'ready', 'recommendation_id=gen_random_uuid()');
await intro(23, '06', 'ready', 'talent_decision_at=now()');
await setRole('ended');
await setRole('active');
assert.deepEqual([(await status())[21], (await status())[22], (await status())[23]], ['closed:role_closed', 'closed:role_closed', 'closed:role_closed']);

// Only what this ending closed comes back: a proposal closed before the Role last left active stays closed.
await intro(31, '04', 'closed', "close_reason=(select 'role_closed')");
await db.exec(`update company_intro_candidates set updated_at = now() - interval '2 days' where id::text like '%31'`);
await setRole('ended');
await setRole('active');
assert.equal((await status())[31], 'closed:role_closed');

// A person who was deleted or blocked the company stays closed; the others come back.
await db.exec(`delete from company_intro_candidates where id::text similar to '%(21|22|23|31)'`);
await intro(41, '04', 'ready');
await intro(42, '05', 'ready');
await intro(43, '06', 'ready');
await setRole('ended');
await db.exec(`update talent_users set deleted_at = now() where user_id = '${talent('04')}'`);
await db.exec(`update talent_setting set blocked_companies = '{" synthetic co "}' where user_id = '${talent('05')}'`);
await setRole('active');
assert.deepEqual([(await status())[41], (await status())[42], (await status())[43]], ['closed:role_closed', 'closed:role_closed', 'ready:']);

// A proposal from another workspace stays closed.
await setRole('ended');
await db.exec(`update company_intro_candidates set company_workspace_id = gen_random_uuid() where id::text like '%43'`);
await setRole('active');
assert.equal((await status())[43], 'closed:role_closed');

// An open proposal that appears at the same moment is skipped; the Role still turns on.
await db.exec(`update company_intro_candidates set company_workspace_id = '00000000-0000-4000-8000-000000000001', status = 'ready', close_reason = null where id::text like '%43'`);
await setRole('active');
await setRole('ended');
await db.exec(`create function insert_competitor() returns trigger language plpgsql as $$ begin
  if old.status = 'ended' then insert into company_intro_candidates(id,company_workspace_id,role_id,talent_id,status,created_at) values('00000000-0000-4000-8000-000000000044',new.company_workspace_id,new.role_id,'${talent('06')}','ready',now() - interval '10 days'); end if;
  return new; end $$;
create trigger company_role_a_competitor before update of status on company_roles for each row execute function insert_competitor();`);
await setRole('active');
assert.deepEqual([(await status())[43], (await status())[44]], ['closed:role_closed', 'ready:']);
assert.equal((await rows(`select status from company_roles`))[0].status, 'active');
await db.exec(`drop trigger company_role_a_competitor on company_roles`);

// Deleted Roles and talents outside a test-only Role's list stay closed.
await db.exec(`delete from company_intro_candidates where id::text similar to '%(41|42|43|44)'`);
await setRole('deleted');
await setRole('active');
assert.equal((await status())[11], 'closed:role_closed');
await setRole('ended');
await db.exec(`update company_roles set information = '{"testOnly":true,"testTalentIds":[]}', status = 'active' where role_id = '${role}'`);
assert.equal((await status())[11], 'closed:role_closed');
console.log('role resume reopens intro: ok');
} finally { await db.close(); }
