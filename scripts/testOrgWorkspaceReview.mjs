// Isolated PostgreSQL. No production credentials, LLM calls, or Slack delivery.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const user = "00000000-0000-4000-8000-000000000001";
const workspace = "00000000-0000-4000-8000-000000000002";
const legacy = "00000000-0000-4000-8000-000000000003";
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    grant usage on schema public,private to authenticated,service_role;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean);
    create table public.company_workspace(company_workspace_id uuid primary key default gen_random_uuid(),
      updated_at timestamptz default now(),company_name text,signup_state jsonb,signup_domain text,homepage_url text,
      billing_model text,billing_started_at timestamptz,billing_free_anchor_at timestamptz);
    create table public.company_roles(role_id uuid primary key default gen_random_uuid(),company_workspace_id uuid,
      information jsonb);
    create table public.company_user_workspace(company_workspace_id uuid,company_user_id uuid,authority text,role text,created_at timestamptz default now());
    create table public.company_users(user_id uuid primary key,email text,role text,is_authenticated boolean,onboarding_completed_at timestamptz);
    create table public.company_workspace_invitations(company_workspace_id uuid,email text,accepted_at timestamptz,created_at timestamptz);
    create table public.company_data(company_workspace_id uuid,source_payload jsonb,searched_at timestamptz);
    alter table public.company_workspace enable row level security;
    alter table public.company_roles enable row level security;
    create policy fixture_workspace on public.company_workspace for all to authenticated using(true) with check(true);
    create policy fixture_roles on public.company_roles for all to authenticated using(true) with check(true);
    grant select,insert,update on public.company_workspace,public.company_roles to authenticated;
    grant all on all tables in schema public to service_role;
    grant usage on schema auth to service_role;
    insert into public.company_workspace(company_workspace_id,company_name) values('${legacy}','Existing company');
    insert into auth.users values('${user}','owner@jobs.agency.example',now(),false);
  `);
  const signupMigration = readFileSync("supabase/migrations/20261012095337_allow_multiple_company_organizations.sql", "utf8");
  await db.exec(signupMigration.match(/create or replace function public\.workspace_signup_begin_v1[\s\S]*?end; \$\$;/)[0]);
  const additionalMigration = readFileSync("supabase/migrations/20261012090244_organization_add.sql", "utf8");
  await db.exec(additionalMigration.match(/create or replace function public\.workspace_create_additional_v1[\s\S]*?end; \$\$;/)[0]);
  // Replay the canonical latest additional-organization patch without unrelated signup-update setup.
  const patchStart = signupMigration.indexOf("  select pg_get_functiondef('public.workspace_create_additional_v1");
  await db.exec("do $migration$ declare definition text; start_at integer; next_at integer; begin\n" + signupMigration.slice(patchStart));
  await db.exec(readFileSync("supabase/migrations/20261020024534_org_workspace_review.sql", "utf8"));
  assert.equal(await scalar("select to_regclass('public.company_workspace_review_domains')"), null, "no domain registry table");
  assert.equal(await scalar("select to_regprocedure('workspace_signup_begin_v1(uuid,text,boolean)')"), null, "older callers cannot skip server review");
  assert.equal(await scalar("select has_function_privilege('authenticated','workspace_signup_begin_v1(text,text,uuid,text,boolean)','execute')"), false);
  assert.equal(await scalar("select has_function_privilege('authenticated','workspace_create_additional_v1(text,text,uuid,uuid,text,text,uuid,boolean)','execute')"), false);
  await db.exec(`insert into company_workspace(company_workspace_id,company_name,signup_domain,signup_state,review_domain,signup_notification)
    values('${workspace}','Unrelated editable company name','unrelated.example','{"createdBy":"${user}"}',
      'agency.example','{"email":"owner@jobs.agency.example"}');`);
  assert.equal(await scalar("select is_reviewing from company_workspace where company_workspace_id=$1", [workspace]), true);
  assert.equal(await scalar("select review_domain from company_workspace where company_workspace_id=$1", [workspace]), "agency.example");
  assert.equal(await scalar("select signup_state->>'plan' from company_workspace where company_workspace_id=$1", [workspace]), "free");
  assert.equal(await scalar("select is_reviewing from company_workspace where company_workspace_id=$1", [legacy]), false);
  await assert.rejects(db.exec(`insert into company_roles(company_workspace_id,information)
    values('${workspace}','{"testOnly":true,"testFixture":"org-review-boundary"}')`), /org_workspace_under_review/);
  await db.exec("set role authenticated");
  assert.equal(await scalar("select count(*)::int from company_workspace where company_workspace_id=$1", [workspace]), 0);
  assert.equal(await scalar("select count(*)::int from company_workspace where company_workspace_id=$1", [legacy]), 1);
  await assert.rejects(db.exec(`update company_workspace set is_reviewing=true where company_workspace_id='${legacy}'`), /org_review_server_only/);
  await assert.rejects(db.query("select claim_workspace_signup_notification_v1($1)", [workspace]), /permission denied/);
  await db.exec("reset role");
  const claims = await Promise.all([
    scalar("select claim_workspace_signup_notification_v1($1)", [workspace]),
    scalar("select claim_workspace_signup_notification_v1($1)", [workspace]),
  ]);
  assert.equal(claims.filter(Boolean).length, 1, "only one sender can claim the signup");
  await db.exec(`update company_workspace set is_reviewing=false where company_workspace_id='${workspace}';
    update company_workspace set company_name='Renamed' where company_workspace_id='${workspace}';`);
  assert.equal(await scalar("select is_reviewing from company_workspace where company_workspace_id=$1", [workspace]), false, "manual release survives later saves");
  assert.equal(await scalar("select claim_workspace_signup_notification_v1($1)", [workspace]), null, "release and ordinary saves do not resend");
  await db.exec("set role authenticated");
  assert.equal(await scalar("select count(*)::int from company_workspace where company_workspace_id=$1", [workspace]), 1);
  await db.exec("reset role");
  for (const email of ["owner@notagency.example", "owner@agency.example.attacker.test", "owner@ordinary.example"]) {
    await db.query("update auth.users set email=$1 where id=$2", [email,user]);
    assert.equal(await scalar(`insert into company_workspace(company_name,signup_state,signup_notification)
      values('Fixture',jsonb_build_object('createdBy',$1::text),jsonb_build_object('email',$2::text)) returning is_reviewing`, [user,email]), false);
  }
  await db.query("update auth.users set email='OWNER@AGENCY.EXAMPLE' where id=$1", [user]);
  assert.equal(await scalar(`insert into company_workspace(company_name,signup_state,review_domain,signup_notification)
    values('Fixture',jsonb_build_object('createdBy',$1::text),'agency.example','{"email":"owner@agency.example"}') returning is_reviewing`, [user]), true);
  await db.exec("set role service_role");
  const created = await scalar("select workspace_signup_begin_v1('owner@agency.example','agency.example',$1,'agency.example',true)", [user]);
  assert.equal(created.status, "created");
  assert.equal(await scalar("select is_reviewing from company_workspace where company_workspace_id=$1", [created.workspaceId]), true);
  const again = await scalar("select workspace_signup_begin_v1('owner@agency.example','agency.example',$1,'agency.example',true)", [user]);
  assert.equal(again.status, "member");
  assert.equal(again.workspaceId, created.workspaceId, "signup retry reuses the original workspace and notification");
  const additional = await scalar(`select workspace_create_additional_v1(
    'owner@agency.example','agency.example',$1,$2,'unrelated.example','https://unrelated.example',
    '00000000-0000-4000-8000-000000000004',true)`, [user,legacy]);
  assert.equal(additional.status, "created");
  assert.equal(await scalar("select review_domain from company_workspace where company_workspace_id=$1", [additional.workspaceId]), "agency.example", "additional org follows email, not editable homepage");
  await assert.rejects(scalar(`insert into company_workspace(company_name,signup_state)
    values('Missing decision',jsonb_build_object('createdBy',$1::text)) returning is_reviewing`, [user]), /signup_review_email_changed/);
  await assert.rejects(scalar(`insert into company_workspace(company_name,signup_state,signup_notification)
    values('Stale decision',jsonb_build_object('createdBy',$1::text),'{"email":"old@agency.example"}') returning is_reviewing`, [user]), /signup_review_email_changed/);
  await db.exec("reset role");
  const ordinaryUser = "00000000-0000-4000-8000-000000000005";
  await db.query("insert into auth.users values($1,'owner@ordinary.example',now(),false)", [ordinaryUser]);
  const ordinary = await scalar("select workspace_signup_begin_v1('owner@ordinary.example',null,$1,'ordinary.example',true)", [ordinaryUser]);
  assert.equal(ordinary.status, "created");
  assert.equal(await scalar("select is_reviewing from company_workspace where company_workspace_id=$1", [ordinary.workspaceId]), false);
  assert.equal(await scalar("select signup_notification->>'status' from company_workspace where company_workspace_id=$1", [ordinary.workspaceId]), "pending");
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [user]);
  await assert.rejects(scalar(`insert into company_workspace(company_name,signup_state,review_domain,signup_notification)
    values('Fixture',jsonb_build_object('createdBy',$1::text),'agency.example','{"email":"owner@agency.example"}') returning is_reviewing`, [user]), /signup_work_email_required/);
  console.log("PASS: atomic server decision, verified email binding, legacy preservation, RLS, role isolation, signup retry, additional org, notification claim, manual release; no domain table.");
} finally {
  await db.close();
}
