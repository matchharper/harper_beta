import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Harper's own schedules (G1c, D15): effect tiers, who asked, limits; a company
// member's cancellation goes into the decision record. Schedules tied to an
// introduction keep their behavior.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace, name text,
    description text, location_text text, country_code text, work_mode text, type text, seniority_level text,
    salary_range text, salary_min int, salary_max int, salary_currency text, salary_period text);
  create table company_internal_roles(role_id uuid primary key references company_roles, request text, criteria jsonb,
    team_id uuid, memory text);
  create table company_intro_candidates(id uuid primary key, company_workspace_id uuid, role_id uuid, talent_id uuid,
    status text, close_reason text, requested_by_company_user_id uuid, requested_at timestamptz, company_appeal text,
    next_stage_id uuid, revision int not null default 0, updated_at timestamptz);
  create table company_messages(id bigint generated always as identity primary key, company_workspace_id uuid, body text);
  create table company_memory_entries(id bigint generated always as identity primary key, company_workspace_id uuid,
    scope text, role_id uuid, team_id uuid, content text, deleted_at timestamptz);
  create table talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
    recommendation_id uuid, user_id text, company_user_id uuid, kind text, text text, metadata jsonb,
    created_at timestamptz default now(), open_to_talent boolean, open_to_company boolean);
  create function company_role_search_brief_snapshot_v1(p_role_id uuid) returns jsonb language sql stable set search_path = public as $$
    select jsonb_build_object('roleId', r.role_id) from company_roles r where r.role_id = p_role_id $$;
  create function company_role_search_brief_version_v1(p_role_id uuid) returns text language sql stable set search_path = public as $$
    select md5(company_role_search_brief_snapshot_v1(p_role_id)::text) $$;
  create function scheduled_company_memory_fingerprint_v1(p_role uuid) returns text language sql stable set search_path = public as $$
    select md5('') $$;
  create function pass_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_passed') $$;
  create function request_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid,
    p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_requested') $$;
  create table company_agent_schedules(id uuid primary key default gen_random_uuid(), company_workspace_id uuid not null,
    role_id uuid not null, title text not null, instruction text not null, target_refs jsonb not null default '{}',
    timezone text not null default 'Asia/Seoul', next_run_at timestamptz, recurrence text, interval_days numeric,
    status text not null default 'active', revision bigint not null default 1, directive_revision bigint not null default 1,
    source jsonb not null default '{}', operation_key text not null, last_job_id uuid,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now());
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const user = "10000000-0000-4000-8000-000000000003";

test("Harper's own schedules carry a tier and limits; cancelling one is a company decision", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`insert into company_workspace values ('${workspace}', 'Company');
      insert into company_roles(role_id, company_workspace_id, name) values ('${role}', '${workspace}', 'Engineer');`);
    for (const name of ["20261105020000_company_decision_events.sql", "20261105210000_company_agent_schedule_tiers.sql"])
      await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));

    let key = 0;
    const add = (fields: Record<string, unknown>) => {
      const row: Record<string, unknown> = {
        company_workspace_id: workspace, role_id: role, title: "Look again", instruction: "Check the new result",
        operation_key: `k${key++}`, ...fields,
      };
      const columns = Object.keys(row);
      return db.query<any>(
        `insert into company_agent_schedules(${columns.join(",")}) values (${columns.map((_, i) => `$${i + 1}`).join(",")}) returning *`,
        columns.map((column) => {
          const value = row[column];
          return value !== null && typeof value === "object" ? JSON.stringify(value) : value;
        }));
    };

    // An introduction follow-up keeps its #227 behavior: no creator or tier rules.
    await add({ target_refs: { introductionRootId: "root" }, effect_tier: 2, created_by: "agent" });
    await add({ target_refs: { introductionRootId: "root2" } });

    // Harper's own schedule: who asked is required; Harper alone may not reach outside.
    await assert.rejects(add({ effect_tier: 0 }), /company_schedule_creator_required/);
    await assert.rejects(add({ effect_tier: 2, created_by: "agent" }), /company_schedule_tier_requires_user/);
    const asked = (await add({ effect_tier: 2, created_by: "user" })).rows[0];
    const ends = new Date(asked.expires_at).getTime() - Date.now();
    assert.ok(ends > 29 * 86_400_000 && ends <= 30 * 86_400_000 + 60_000);
    await assert.rejects(add({ effect_tier: 0, created_by: "agent", expires_at: new Date(Date.now() + 40 * 86_400_000).toISOString() }),
      /company_schedule_expiry_too_far/);
    await assert.rejects(add({ effect_tier: 0, created_by: "agent", interval_days: 0.5 }), /company_schedule_interval_too_short/);

    // At most 5 active per Role (introduction follow-ups not counted); paused ones do not count.
    for (let index = 0; index < 4; index += 1) await add({ effect_tier: 0, created_by: "agent" });
    await assert.rejects(add({ effect_tier: 1, created_by: "agent" }), /company_schedule_role_limit/);
    const paused = (await add({ effect_tier: 1, created_by: "agent", status: "paused" })).rows[0];
    // Resuming a sixth is refused; routine updates of active rows still work at the limit.
    await assert.rejects(db.query("update company_agent_schedules set status = 'active' where id = $1", [paused.id]),
      /company_schedule_role_limit/);
    await db.query(`update company_agent_schedules set next_run_at = now() + interval '1 day', run_count = run_count + 1
      where status = 'active' and role_id = $1`, [role]);

    // A company member cancelling: one decision; an event run cancelling: none.
    const decisions = async () => (await db.query<any>(
      "select subject_kind, subject_id, action, channel, actor_user_id from company_decision_events")).rows;
    await db.query(`update company_agent_schedules set status = 'cancelled', revision = revision + 1, source = $2::jsonb where id = $1`,
      [asked.id, JSON.stringify({ kind: "company", userId: user, channel: "todo" })]);
    const recorded = (await decisions())[0];
    assert.deepEqual([recorded.subject_kind, recorded.subject_id, recorded.action, recorded.channel, recorded.actor_user_id],
      ["agent_schedule", asked.id, "cancel", "todo", user]);
    const [other, buttonRun] = (await db.query<any>("select id from company_agent_schedules where status = 'active' and created_by = 'agent' order by operation_key limit 2")).rows;
    await db.query(`update company_agent_schedules set status = 'cancelled', source = '{"kind":"company_event"}' where id = $1`, [other.id]);
    // Harper cancelling during a run a button started (a member's Pass, not a request to cancel): none.
    await db.query(`update company_agent_schedules set status = 'cancelled', source = $2::jsonb where id = $1`,
      [buttonRun.id, JSON.stringify({ kind: "company", userId: user, messageId: 1, actor: "agent" })]);
    assert.equal((await decisions()).length, 1);
    // A member asking Harper in Slack to cancel: one more decision, channel slack.
    const [third] = (await db.query<any>("select id from company_agent_schedules where status = 'active' and created_by = 'agent' limit 1")).rows;
    await db.query(`update company_agent_schedules set status = 'cancelled', source = $2::jsonb where id = $1`,
      [third.id, JSON.stringify({ kind: "company", userId: user, messageId: 2, actor: "user", channel: "slack" })]);
    assert.deepEqual((await decisions()).map((row) => row.channel).sort(), ["slack", "todo"]);
    // A source user that is not a member id still cancels; the decision has no actor.
    const [fourth] = (await db.query<any>("select id from company_agent_schedules where status = 'active' and not target_refs ? 'introductionRootId' limit 1")).rows;
    await db.query(`update company_agent_schedules set status = 'cancelled', source = $2::jsonb where id = $1`,
      [fourth.id, JSON.stringify({ kind: "company", userId: "U0SLACK", channel: "slack" })]);
    assert.equal((await decisions()).length, 3);
    // The scheduler closing a schedule leaves its source as it was: not a decision.
    await db.query(`update company_agent_schedules set source = $2::jsonb where id = $1`,
      [paused.id, JSON.stringify({ kind: "company", userId: user, messageId: 3, actor: "user", channel: "chat" })]);
    await db.query("update company_agent_schedules set status = 'cancelled', revision = revision + 1 where id = $1", [paused.id]);
    // An introduction follow-up is not a company decision either.
    await db.query(`update company_agent_schedules set status = 'cancelled', source = $1::jsonb
      where target_refs ? 'introductionRootId'`, [JSON.stringify({ kind: "company", userId: user, messageId: 4, actor: "user", channel: "chat" })]);
    assert.equal((await decisions()).length, 3);
    // Freed slots can be used again.
    await add({ effect_tier: 0, created_by: "user" });
  } finally { await db.close(); }
});
