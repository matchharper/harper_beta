import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const w=id(1), other=id(2), owner=id(10), admin=id(11), viewer=id(12), outsider=id(13);
const r1=id(21), r2=id(22), r3=id(23), ra=id(24), rb=id(25);
const contactColumns = "source_id uuid,kind text,talent_id uuid,talent_name text,talent_email text,role_id uuid,role_name text,company_user_id uuid,company_user_name text,company_user_email text,created_at timestamptz,sent_at timestamptz,updated_at timestamptz,activity_at timestamptz,workflow_status text,delivery_status text,relay_status text,expects_document boolean,expires_at timestamptz,relay_sent_at timestamptz,has_response boolean,response_received_at timestamptz,confirmed_start_at timestamptz";
try {
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table company_workspace(company_workspace_id uuid primary key);
create table company_users(user_id uuid primary key);
create table company_user_workspace(id uuid primary key default gen_random_uuid(),company_workspace_id uuid references company_workspace,company_user_id uuid references company_users,authority text not null,updated_at timestamptz default now());
alter table company_user_workspace enable row level security;
create policy company_user_workspace_select_member on company_user_workspace for select to authenticated using(exists(select 1 from company_user_workspace viewer where viewer.company_workspace_id=company_user_workspace.company_workspace_id and viewer.company_user_id=auth.uid()));
create table company_workspace_invitations(id uuid primary key default gen_random_uuid(),company_workspace_id uuid references company_workspace,email text,updated_at timestamptz default now());
create table company_roles(role_id uuid primary key,company_workspace_id uuid references company_workspace,name text,source_type text,status text,is_expired boolean,summary jsonb,type text[],information jsonb not null,updated_at timestamptz default now());
create table company_internal_roles(role_id uuid primary key references company_roles on delete cascade,request text,criteria jsonb not null default '[]',updated_at timestamptz default now());
alter table company_internal_roles enable row level security;
-- Match the production parent trigger: create the extension before the team RPC's upsert.
create function seed_internal_extension() returns trigger language plpgsql as $$begin
  if new.source_type='internal' then insert into public.company_internal_roles(role_id,request) values(new.role_id,'Preserved Brief'); end if;
  return new;
end$$;
create trigger seed_internal_extension after insert on company_roles for each row execute function seed_internal_extension();
alter table company_roles enable row level security;
create policy base_role_access on company_roles to authenticated using(true) with check(true);
create table company_conversations(id uuid primary key default gen_random_uuid(),company_workspace_id uuid references company_workspace,role_id uuid references company_roles);
create unique index company_conversations_workspace_scope_uidx on company_conversations(company_workspace_id) where role_id is null;
create table test_contact_index(${contactColumns});
create function list_company_contact_index_v2(p_company_workspace_id uuid,p_kind text default null,p_talent_id uuid default null,p_role_id uuid default null,p_query text default null,p_date_basis text default 'updated',p_after timestamptz default null,p_before timestamptz default null,p_offset integer default 0,p_limit integer default 20)
returns table(${contactColumns}) language sql stable set search_path=public,pg_temp as $$select c.* from test_contact_index c join company_roles r on r.role_id=c.role_id
  where r.company_workspace_id=p_company_workspace_id and (p_role_id is null or c.role_id=p_role_id) order by c.activity_at desc,c.source_id desc offset p_offset limit p_limit$$;
grant usage on schema public,auth to authenticated,service_role;
grant select,insert,update on all tables in schema public to authenticated;
grant all on all tables in schema public,auth to service_role;
insert into company_workspace values('${w}'),('${other}');
insert into auth.users values('${owner}','owner@example.test'),('${admin}','admin@example.test'),('${viewer}','viewer@example.test'),('${outsider}','outside@example.test');
insert into company_users select id from auth.users;
insert into company_user_workspace(company_workspace_id,company_user_id,authority) values('${w}','${owner}','owner'),('${w}','${admin}','admin'),('${w}','${viewer}','viewer'),('${other}','${outsider}','admin');
insert into company_roles(role_id,company_workspace_id,name,source_type,status,information) values
  ('${r1}','${w}','Role A','internal','paused','{"testOnly":true,"testFixture":"org-team-access"}'),
  ('${r2}','${w}','Role B','internal','paused','{"testOnly":true,"testFixture":"org-team-access"}'),
  ('${r3}','${other}','Other company Role','internal','paused','{"testOnly":true,"testFixture":"org-team-access"}');
`);
await db.exec(readFileSync(new URL("../supabase/migrations/20261012130529_organization_team_role_access.sql",import.meta.url),"utf8"));
await db.exec(readFileSync(new URL("../supabase/migrations/20261013023544_organization_multiple_team_memberships.sql",import.meta.url),"utf8"));
await db.exec("revoke all on auth.users from service_role; set role service_role;");
const scalar=async(sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
const fail=async(sql,params,code)=>assert.rejects(db.query(sql,params),error=>error.message===code);
const teamA=await scalar("select manage_company_team_v1($1,$2,'create',null,'Engineering',$3,$4)",[w,owner,[admin],[r1]]);
const teamB=await scalar("select manage_company_team_v1($1,$2,'create',null,'Design',$3,$4)",[w,owner,[viewer],[r2]]);
const beforeInternal=(await db.query("select * from company_internal_roles order by role_id")).rows;
const beforeAssignments=(await db.query("select role_id,team_id from company_roles order by role_id")).rows;
await db.exec("reset role;");
await db.exec("begin;"+readFileSync(new URL("../supabase/migrations/20261013155033_move_role_team_to_internal_roles.sql",import.meta.url),"utf8")+"commit;");
assert.equal(await scalar("select count(*) from information_schema.columns where table_schema='public' and table_name='company_roles' and column_name='team_id'"),0);
assert.deepEqual((await db.query("select role_id,team_id from company_internal_roles order by role_id")).rows,beforeAssignments);
assert.deepEqual((await db.query("select role_id,request,criteria,updated_at from company_internal_roles order by role_id")).rows,beforeInternal);
await db.exec("set role service_role;");

await assert.rejects(db.query("select manage_company_team_v1($1,$2,'create',null,' engineering ')",[w,owner]),error=>error.code==='23505');
assert.deepEqual((await db.query("select access_scope,team_id from company_user_workspace where company_user_id=$1",[admin])).rows,[{access_scope:"team",team_id:teamA}]);
await fail("select manage_company_team_v1($1,$2,'create',null,'Not authorized')",[w,admin],"org_team_owner_required");
await fail("select manage_company_team_v1($1,$2,'update',$3,'Engineering',$4,$5)",[w,owner,teamA,[outsider],[r1]],"org_team_invalid_member");
await fail("select manage_company_team_v1($1,$2,'update',$3,'Engineering',$4,$5)",[w,owner,teamA,[admin],[r3]],"org_team_invalid_role");
await fail("update company_internal_roles set team_id=$1 where role_id=$2",[teamA,r3],"org_team_workspace_mismatch");
await scalar("select create_company_team_role_v1($1,$2,$3,'New A',$4)",[w,admin,ra,{testOnly:true,testFixture:"org-team-access"}]);
assert.equal(await scalar("select team_id from company_internal_roles where role_id=$1",[ra]),teamA);
assert.equal(await scalar("select request from company_internal_roles where role_id=$1",[ra]),"Preserved Brief");
await fail("update company_roles set company_workspace_id=$1 where role_id=$2",[other,r1],"org_team_workspace_mismatch");
await fail("update company_roles set source_type='external' where role_id=$1",[r1],"org_team_workspace_mismatch");
await assert.rejects(db.query("delete from company_workspace_teams where id=$1",[teamA]),error=>error.code==='23001' || error.code==='23503');
await fail("select create_company_team_role_v1($1,$2,$3,'Viewer cannot create',$4)",[w,viewer,rb,{testOnly:true,testFixture:"org-team-access"}],"org_team_role_forbidden");
await db.query("select set_company_member_team_v1($1,$2,$3,'team',null)",[w,owner,admin]);
await fail("select create_company_team_role_v1($1,$2,$3,'No assigned team',$4)",[w,admin,rb,{testOnly:true,testFixture:"org-team-access"}],"org_team_role_forbidden");
assert.equal(await scalar("select access_scope from company_user_workspace where company_user_id=$1",[admin]),"team");
await db.query("select set_company_member_team_v1($1,$2,$3,'team',$4)",[w,owner,admin,teamA]);
await fail("select set_company_member_team_v1($1,$2,$3,'team',$4)",[w,owner,owner,teamA],"org_team_owner_all_access");
await fail("select manage_company_team_v1($1,$2,'delete',$3)",[w,owner,teamA],"org_team_has_roles");

// Actual RLS, with authenticated identities, prevents direct API access to sibling Roles.
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false);`);
assert.deepEqual((await db.query("select role_id from company_roles order by role_id")).rows.map(r=>r.role_id),[r1,ra]);
await assert.rejects(db.query("update company_user_workspace set access_scope='organization' where company_user_id=$1",[admin]),error=>error.code==='42501');
await assert.rejects(db.query("update company_roles set name='Unauthorized direct write' where role_id=$1",[r1]),error=>error.code==='42501');
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
assert.equal((await db.query("select role_id from company_roles")).rows.length,3);
await db.exec("reset role;");

// Contact paging/summary count only the actor's permitted Roles, even with sibling records first.
await db.query(`insert into test_contact_index(source_id,kind,talent_id,talent_name,role_id,created_at,sent_at,updated_at,activity_at,workflow_status,has_response)
  values($1,'contact',$2,'Candidate A',$3,now(),now(),now(),now(),'sent',false),
  ($4,'contact',$2,'Candidate B',$5,now(),now(),now(),now()+interval '1 second','sent',false)`,[id(31),id(40),r1,id(32),r2]);
const contacts=(await db.query("select * from list_company_team_contact_index_v1($1,$2)",[w,admin])).rows;
assert.equal(contacts.length,1); assert.equal(contacts[0].role_id,r1);
const summary=await scalar("select summarize_company_team_contacts_v1($1,$2,now()-interval '7 days',now()+interval '2 seconds')",[w,admin]);
assert.equal(summary.all_sent_count,1);

// Multi-Team membership is additive; removing one preserves the other and its default.
await db.query("select manage_company_team_v1($1,$2,'update',$3,'Design',$4,$5)",[w,owner,teamB,[admin,viewer],[r2]]);
assert.equal(await scalar("select count(*) from company_workspace_team_members tm join company_user_workspace m on m.id=tm.membership_id where m.company_user_id=$1",[admin]),2);
assert.equal(await scalar("select team_id from company_user_workspace where company_user_id=$1",[admin]),teamA);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false);`);
assert.deepEqual((await db.query("select role_id from company_roles order by role_id")).rows.map(r=>r.role_id),[r1,r2,ra]);
await assert.rejects(db.query("delete from company_workspace_team_members"),error=>error.code==='42501');
await db.exec("reset role;");
assert.equal((await db.query("select * from list_company_team_contact_index_v1($1,$2)",[w,admin])).rows.length,2);
await db.query("select set_company_member_teams_v2($1,$2,$3,'team',$4)",[w,owner,admin,[teamA,teamB]]);
await db.query("select manage_company_team_v1($1,$2,'update',$3,'Engineering',$4,$5)",[w,owner,teamA,[],[r1,ra]]);
assert.equal(await scalar("select team_id from company_user_workspace where company_user_id=$1",[admin]),teamB);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false);`);
assert.deepEqual((await db.query("select role_id from company_roles order by role_id")).rows.map(r=>r.role_id),[r2]);
await db.exec("reset role;");
await fail("select set_company_member_teams_v2($1,$2,$3,'team',$4)",[w,viewer,admin,[teamA]],"org_team_owner_required");
await db.query("select set_company_member_teams_v2($1,$2,$3,'organization','{}')",[w,owner,admin]);
assert.equal(await scalar("select count(*) from company_workspace_team_members tm join company_user_workspace m on m.id=tm.membership_id where m.company_user_id=$1",[admin]),0);
await db.query("select set_company_member_teams_v2($1,$2,$3,'team',$4)",[w,owner,admin,[teamA,teamB]]);
await db.query("insert into company_conversations(company_workspace_id,team_scope) values($1,$2)",[w,[teamA,teamB].sort()]);
await db.query("insert into company_conversations(company_workspace_id,team_id,team_scope) values($1,$2,$3)",[w,teamA,[teamA]]);
assert.equal(await scalar("select count(*) from company_conversations where company_workspace_id=$1",[w]),2);

// Deleting a group preserves restricted membership and its historical conversation.
await db.query("insert into company_conversations(company_workspace_id,team_id,team_scope) values($1,$2,$3)",[w,teamB,[teamB]]);
await db.query("select manage_company_team_v1($1,$2,'update',$3,'Design',$4,$5)",[w,owner,teamB,[viewer],[]]);
await db.query("select manage_company_team_v1($1,$2,'delete',$3)",[w,owner,teamB]);
assert.equal(await scalar("select count(*) from company_conversations where team_id=$1",[teamB]),1);
assert.deepEqual((await db.query("select access_scope,team_id from company_user_workspace where company_user_id=$1",[viewer])).rows,[{access_scope:"team",team_id:null}]);
assert.equal(await scalar("select count(*) from company_roles where (information->>'testOnly') is distinct from 'true'"),0);
await fail("update company_internal_roles set team_id=$1 where role_id=$2",[teamB,r2],"org_team_workspace_mismatch");
await db.close();
console.log("Organization team SQL: tenant boundaries, Owner control, automatic assignment, revocation, RLS, contacts and history passed.");

} catch (error) { console.error({message:error.message,code:error.code,where:error.where}); await db.close(); process.exitCode=1; }
