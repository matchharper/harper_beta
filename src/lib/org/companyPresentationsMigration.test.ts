import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Presentations: every time a candidate or a suggestion is shown to a company,
// one row with what was shown, and decisions point at it. Only the objects the
// migrations read are created.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace, name text,
    description text, location_text text, country_code text, work_mode text, type text, seniority_level text,
    salary_range text, salary_min int, salary_max int, salary_currency text, salary_period text, source_type text,
    updated_at timestamptz);
  create table company_internal_roles(role_id uuid primary key references company_roles, request text, criteria jsonb,
    team_id uuid, memory text);
  create table company_role_start_sessions(role_id uuid primary key references company_roles, brief jsonb,
    first_candidates jsonb not null default '[]');
  create table talent_users(user_id uuid primary key);
  create table company_role_candidate_evaluations(id uuid primary key, role_id uuid, talent_id uuid, run_id uuid,
    evaluated_at timestamptz);
  create table talent_role_materials(id uuid primary key);
  create table company_intro_candidates(id uuid primary key, company_workspace_id uuid, role_id uuid, talent_id uuid,
    status text, close_reason text, requested_by_company_user_id uuid, requested_at timestamptz, company_appeal text,
    next_stage_id uuid, revision int not null default 0, updated_at timestamptz, selection_run_id uuid,
    selected_at timestamptz, presentation jsonb, shared_material_id uuid, created_at timestamptz default now());
  create table company_first_slack_outbox(id uuid primary key, run_id uuid, company_workspace_id uuid, channel_id uuid,
    candidate_ids uuid[], status text, sent_at timestamptz, slack_message_ts text, delivery_kind text);
  create table company_email_action_links(id uuid primary key default gen_random_uuid(), email_outbox_id uuid,
    company_workspace_id uuid, intro_candidate_id uuid, action text, unique (email_outbox_id, intro_candidate_id, action));
  create table external_candidates(id uuid primary key, run_id uuid, company_workspace_id uuid, role_id uuid,
    headline text, current_company text, verdict jsonb, rank int, delivered boolean not null default false, profile_text text);
  create table company_todo_suggestions(id uuid primary key, company_workspace_id uuid, role_id uuid, kind text,
    title text, plan text, talent_ids uuid[], status text not null default 'pending', source text);
  create table company_messages(id bigint generated always as identity primary key, company_workspace_id uuid, body text);
  create table company_memory_entries(id bigint generated always as identity primary key, company_workspace_id uuid,
    scope text, role_id uuid, team_id uuid, content text, deleted_at timestamptz);
  create table talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
    recommendation_id uuid, user_id text, company_user_id uuid, kind text, text text, metadata jsonb,
    created_at timestamptz default now(), open_to_talent boolean, open_to_company boolean);
  create function company_role_search_brief_snapshot_v1(p_role_id uuid) returns jsonb language sql stable set search_path = public as $$
    select jsonb_build_object('roleId', r.role_id, 'name', r.name, 'request', ir.request, 'criteria', ir.criteria,
      'location', r.location_text)
    from company_roles r join company_internal_roles ir using(role_id) where r.role_id = p_role_id $$;
  create function company_role_search_brief_version_v1(p_role_id uuid) returns text language sql stable set search_path = public as $$
    select md5(company_role_search_brief_snapshot_v1(p_role_id)::text) $$;
  create function scheduled_company_memory_fingerprint_v1(p_role uuid) returns text language sql stable set search_path = public as $$
    select md5(coalesce((select i.memory from company_internal_roles i where i.role_id = p_role), '')) $$;
  create function pass_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid)
  returns jsonb language plpgsql security definer set search_path to 'public' as $$
  begin
    update public.company_intro_candidates set status = 'passed', requested_by_company_user_id = p_company_user_id,
      revision = revision + 1 where id = p_intro_candidate_id and status = 'ready';
    if not found then return jsonb_build_object('status', 'already_passed'); end if;
    return jsonb_build_object('status', 'passed', 'introCandidateId', p_intro_candidate_id);
  end $$;
  create function request_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid,
    p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_requested') $$;
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const actor = "10000000-0000-4000-8000-000000000005";
const talentA = "20000000-0000-4000-8000-000000000001";
const talentB = "20000000-0000-4000-8000-000000000002";
const talentC = "20000000-0000-4000-8000-000000000003";
const cardA = "30000000-0000-4000-8000-000000000001";
const cardB = "30000000-0000-4000-8000-000000000002";
const cardConnect = "30000000-0000-4000-8000-000000000003";
const runA = "40000000-0000-4000-8000-000000000001";
const evalRun = "50000000-0000-4000-8000-000000000001";
const evalLater = "50000000-0000-4000-8000-000000000002";
const outbox = "60000000-0000-4000-8000-000000000001";
const mail = "60000000-0000-4000-8000-000000000002";
const person = "70000000-0000-4000-8000-000000000001";
const suggestion = "80000000-0000-4000-8000-000000000001";

test("what was shown is kept per surface, and decisions point at it", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}', 'Company');
      insert into company_roles(role_id, company_workspace_id, name, source_type) values ('${role}', '${workspace}', 'Engineer', 'internal');
      insert into company_internal_roles(role_id, request, criteria) values ('${role}', 'brief', '[]');
      insert into company_role_start_sessions(role_id) values ('${role}');
      insert into talent_users values ('${talentA}'), ('${talentB}'), ('${talentC}');
      insert into company_role_candidate_evaluations values
        ('${evalRun}', '${role}', '${talentA}', '${runA}', '2026-11-01'),
        ('${evalLater}', '${role}', '${talentA}', null, '2026-11-02');
      insert into company_intro_candidates(id, company_workspace_id, role_id, talent_id, status, close_reason,
        selection_run_id, selected_at, presentation) values
        ('${cardA}', '${workspace}', '${role}', '${talentA}', 'ready', null, '${runA}', '2026-11-01', '{"name":"A","tldr":"first"}'),
        ('${cardConnect}', '${workspace}', '${role}', '${talentC}', 'closed', 'route_replaced', '${runA}', '2026-11-01', '{"name":"C"}');
    `);
    for (const name of [
      "20261105020000_company_decision_events.sql",
      "20261105080000_company_role_brief_revisions.sql",
      "20261105110000_company_presentations.sql",
    ]) await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));

    const shown = async () => (await db.query<any>(`select id, surface, subject_kind, subject_id, intro_candidate_id,
      intro_candidate_revision, brief_revision, evaluation_id, shown, delivery_ref, idempotency_key
      from company_presentations order by presented_at, idempotency_key`)).rows;

    // Cards already shown are filled; a card that went straight to a connection was never a card.
    let rows = await shown();
    assert.deepEqual(rows.map(r => [r.surface, r.subject_id, r.intro_candidate_revision]), [["inbox_card", talentA, 0]]);
    assert.equal(rows[0].evaluation_id, evalRun);
    assert.equal(rows[0].brief_revision, 1);
    assert.equal(rows[0].shown.tldr, "first");
    assert.equal(rows[0].delivery_ref.backfill, true);

    // A republished card is shown again; a status-only write and a closed card are not.
    await db.exec(`update company_intro_candidates set presentation = '{"name":"A","tldr":"second"}', revision = revision + 1
      where id = '${cardA}';`);
    await db.exec(`update company_intro_candidates set revision = revision + 1, updated_at = now() where id = '${cardA}';`);
    await db.exec(`insert into company_intro_candidates(id, company_workspace_id, role_id, talent_id, status, selection_run_id, presentation)
      values ('${cardB}', '${workspace}', '${role}', '${talentB}', 'ready', '${runA}', '{"name":"B"}');`);
    // A Slack message with two candidates, sent once.
    await db.exec(`insert into company_first_slack_outbox values ('${outbox}', '${runA}', '${workspace}', null,
      array['${cardA}', '${cardB}']::uuid[], 'pending', null, null, 'company_first');`);
    await db.exec(`update company_first_slack_outbox set status = 'sent', sent_at = now(), slack_message_ts = '1.2' where id = '${outbox}';`);
    await db.exec(`update company_first_slack_outbox set status = 'sent' where id = '${outbox}';`);
    // One mail with both buttons for card A: one presentation, both buttons point at it.
    await db.exec(`insert into company_email_action_links(email_outbox_id, company_workspace_id, intro_candidate_id, action) values
      ('${mail}', '${workspace}', '${cardA}', 'pass'), ('${mail}', '${workspace}', '${cardA}', 'request_intro');`);
    const links = (await db.query<any>("select distinct presentation_id from company_email_action_links")).rows;
    assert.equal(links.length, 1);
    assert.ok(links[0].presentation_id);
    // Role start shows its first candidates; the same list again adds nothing.
    const first = JSON.stringify([{ talentId: talentB, runId: "r1", name: "B", overall: 4 }]);
    await db.exec(`update company_role_start_sessions set first_candidates = '${first}' where role_id = '${role}';`);
    await db.exec(`update company_role_start_sessions set first_candidates = '${first}' where role_id = '${role}';`);
    // An external candidate is shown without their profile text; a To-do suggestion is shown.
    await db.exec(`insert into external_candidates(id, run_id, company_workspace_id, role_id, headline, verdict, rank, profile_text)
      values ('${person}', '${runA}', '${workspace}', '${role}', 'Backend lead', '{"fit":"strong"}', 1, 'raw profile');
      update external_candidates set delivered = true where id = '${person}';
      update external_candidates set delivered = true where id = '${person}';`);
    await db.exec(`insert into company_todo_suggestions(id, company_workspace_id, role_id, kind, title, talent_ids)
      values ('${suggestion}', '${workspace}', '${role}', 'follow_up', 'Follow up', array['${talentA}']::uuid[]);`);

    rows = await shown();
    assert.deepEqual(rows.map(r => [r.surface, r.subject_kind]).slice(1).sort(), [
      ["email", "member_candidate"], ["external_tab", "external_candidate"], ["inbox_card", "member_candidate"],
      ["inbox_card", "member_candidate"], ["role_start", "member_candidate"], ["slack_card", "member_candidate"],
      ["slack_card", "member_candidate"], ["todo", "todo_suggestion"],
    ].sort());
    const republished = rows.find(r => r.idempotency_key === `card:${cardA}:1`);
    assert.equal(republished.shown.tldr, "second");
    const slackA = rows.find(r => r.surface === "slack_card" && r.subject_id === talentA);
    assert.equal(slackA.delivery_ref.slackMessageTs, "1.2");
    assert.equal(slackA.intro_candidate_revision, 2);
    const external = rows.find(r => r.surface === "external_tab");
    assert.deepEqual(external.shown, { headline: "Backend lead", verdict: { fit: "strong" }, rank: 1 });
    assert.equal(rows.find(r => r.surface === "role_start").shown.overall, 4);

    // Decisions take what was shown on their own surface.
    const decide = async (intro: string, channel: string) =>
      db.query("select pass_company_intro_v2($1, $2, $3, $4, $5)", [intro, workspace, actor, channel, "not now"]);
    await decide(cardA, "email");
    await decide(cardB, "web");
    await db.query(`select record_company_decision_v1($1, $2, 'member_candidate', $3, 'rate', 'role_start', $4, 'rate-b')`,
      [workspace, role, talentB, actor]);
    await db.query(`select record_company_decision_v1($1, $2, 'external_candidate', $3, 'pass', 'web', $4, 'ext')`,
      [workspace, role, person, actor]);
    const decisions = (await db.query<any>(`select event.action, presentation.surface, presentation.subject_id
      from company_decision_events event left join company_presentations presentation on presentation.id = event.presentation_id
      where event.created_at > now() - interval '1 hour' order by event.id`)).rows;
    assert.deepEqual(decisions.map(d => [d.action, d.surface, d.subject_id]), [
      ["pass", "email", talentA], ["pass", "inbox_card", talentB], ["rate", "role_start", talentB], ["pass", "external_tab", person],
    ]);

    // A deleted Talent account takes its presentations along; decisions keep their row.
    await db.exec(`delete from company_email_action_links; delete from company_intro_candidates where talent_id = '${talentA}';
      delete from talent_users where user_id = '${talentA}';`);
    assert.equal((await db.query<any>(`select count(*)::int n from company_presentations where talent_id = '${talentA}'`)).rows[0].n, 0);
    assert.equal((await db.query<any>(`select count(*)::int n from company_decision_events where subject_id = '${talentA}'
      and presentation_id is null`)).rows[0].n, 1);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    assert.equal(await can("has_table_privilege('service_role', 'company_presentations', 'SELECT')"), true);
    for (const privilege of ["INSERT", "UPDATE", "DELETE"])
      assert.equal(await can(`has_table_privilege('service_role', 'company_presentations', '${privilege}')`), false);
    assert.equal(await can("has_table_privilege('authenticated', 'company_presentations', 'SELECT')"), false);
    assert.equal(await can("(select relrowsecurity from pg_class where relname = 'company_presentations')"), true);
    assert.equal(await can("has_function_privilege('service_role', 'record_company_presentation_v1(uuid,uuid,text,uuid,text,text,jsonb,jsonb,uuid,integer,uuid,uuid,timestamptz)', 'EXECUTE')"), false);
  } finally { await db.close(); }
});
