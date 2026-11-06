import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Role start passes the first-three people rated 맞지 않음. They were shown in
// role start, never in the inbox, so their card records no inbox_card; the
// people role start keeps still go to the inbox and are recorded there.
// Only the objects the migrations read are created.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace, name text,
    description text, location_text text, country_code text, work_mode text, type text, seniority_level text,
    salary_range text, salary_min int, salary_max int, salary_currency text, salary_period text, source_type text,
    status text, information jsonb not null default '{}', updated_at timestamptz);
  create table company_internal_roles(role_id uuid primary key references company_roles, request text, criteria jsonb,
    team_id uuid, memory text);
  create table company_role_start_sessions(role_id uuid primary key references company_roles, brief jsonb,
    first_candidates jsonb not null default '[]');
  create table talent_users(user_id uuid primary key);
  create table company_role_candidate_evaluations(id uuid primary key, role_id uuid, talent_id uuid, run_id uuid,
    evaluated_at timestamptz);
  create table talent_role_materials(id uuid primary key);
  create table company_first_search_runs(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    scheduled_slot timestamptz, trigger_reason text, status text, result jsonb, finished_at timestamptz, role_id uuid,
    requested_role_ids uuid[]);
  create table company_intro_candidates(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    role_id uuid, talent_id uuid, status text not null default 'ready', close_reason text,
    requested_by_company_user_id uuid, requested_at timestamptz, company_appeal text, next_stage_id uuid,
    revision int not null default 1, updated_at timestamptz, selection_run_id uuid,
    selected_at timestamptz not null default now(), selection_reason text not null,
    presentation jsonb not null default '{}', shared_material_id uuid, role_fingerprint text not null,
    talent_fingerprint text not null, created_at timestamptz default now());
  create unique index company_intro_candidates_active_workspace_talent_idx
    on company_intro_candidates (company_workspace_id, talent_id) where status in ('ready', 'awaiting_talent', 'connecting');
  create unique index company_intro_candidates_active_pair_idx
    on company_intro_candidates (role_id, talent_id) where status in ('ready', 'awaiting_talent', 'connecting');
  create table company_first_slack_outbox(id uuid primary key, run_id uuid, company_workspace_id uuid, channel_id uuid,
    candidate_ids uuid[], status text, sent_at timestamptz, slack_message_ts text, delivery_kind text);
  create table company_email_action_links(id uuid primary key default gen_random_uuid(), email_outbox_id uuid,
    company_workspace_id uuid, intro_candidate_id uuid, action text, unique (email_outbox_id, intro_candidate_id, action));
  create table external_candidates(id uuid primary key, run_id uuid, company_workspace_id uuid, role_id uuid,
    headline text, current_company text, verdict jsonb, rank int, delivered boolean not null default false);
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
    update public.company_intro_candidates set status = 'passed', close_reason = 'company_passed',
      requested_by_company_user_id = p_company_user_id, revision = revision + 1
    where id = p_intro_candidate_id and status = 'ready';
    if not found then return jsonb_build_object('status', 'already_passed'); end if;
    return jsonb_build_object('status', 'passed', 'introCandidateId', p_intro_candidate_id);
  end $$;
  create function request_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid,
    p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_requested') $$;
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const otherRole = "10000000-0000-4000-8000-000000000003";
const actor = "10000000-0000-4000-8000-000000000005";
const talent = (n: number) => `20000000-0000-4000-8000-00000000000${n}`;

async function database() {
  const db = new PGlite();
  await db.exec(SETUP);
  for (const name of [
    "20261105020000_company_decision_events.sql",
    "20261105080000_company_role_brief_revisions.sql",
    "20261105110000_company_presentations.sql",
    "20261107050100_role_start_pass_without_inbox_card.sql",
  ]) await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));
  await db.exec(`
    insert into company_workspace values ('${workspace}', 'Company');
    insert into company_roles(role_id, company_workspace_id, name, source_type, status, information) values
      ('${role}', '${workspace}', 'Engineer', 'internal', 'draft', '{"testOnly": true}'),
      ('${otherRole}', '${workspace}', 'Designer', 'internal', 'active', '{}');
    insert into company_internal_roles(role_id, request, criteria) values ('${role}', 'brief', '[]'), ('${otherRole}', 'brief', '[]');
    insert into talent_users values ${[1, 2, 3, 4].map((n) => `('${talent(n)}')`).join(", ")};
    insert into company_role_start_sessions(role_id, first_candidates) values ('${role}',
      '${JSON.stringify([1, 2, 3, 4].map((n) => ({ talentId: talent(n), runId: "first-three", name: `T${n}` })))}');
  `);
  return db;
}

const surfaces = async (db: PGlite) => {
  const rows = (await db.query<any>(`select subject_id, surface from company_presentations
    where role_id = '${role}' order by subject_id, surface`)).rows;
  const bySubject: Record<string, string[]> = {};
  for (const row of rows) (bySubject[row.subject_id] ??= []).push(row.surface);
  return bySubject;
};

test("a person role start passes gets a passed card, a Pass on its role_start showing, and no inbox showing", async () => {
  const db = await database();
  try {
    const [{ id: run }] = (await db.query<any>(`insert into company_first_search_runs(company_workspace_id, role_id, trigger_reason)
      values ('${workspace}', '${role}', 'role_start') returning id`)).rows;
    const pass = async (n: number) => (await db.query<any>(
      "select pass_role_start_candidate_v1($1, $2, $3, $4, $5, 'not a fit', $6, 'role-start:x', 'role-start-v1')::text as id",
      [workspace, role, talent(n), actor, run, JSON.stringify({ tldr: `T${n}` })])).rows[0].id;

    const card = await pass(1);
    assert.ok(card);
    const [saved] = (await db.query<any>("select status, close_reason, presentation from company_intro_candidates where id = $1", [card])).rows;
    assert.deepEqual([saved.status, saved.close_reason, saved.presentation], ["passed", "company_passed", { tldr: "T1" }]);
    assert.deepEqual((await surfaces(db))[talent(1)], ["role_start"]);
    const decisions = (await db.query<any>(`select event.action, event.channel, event.actor_user_id, presentation.surface
      from company_decision_events event join company_presentations presentation on presentation.id = event.presentation_id
      where event.subject_id = '${talent(1)}'`)).rows;
    assert.deepEqual(decisions, [{ action: "pass", channel: "role_start", actor_user_id: actor, surface: "role_start" }]);

    // A rerun writes nothing; a person with a card on another Role is skipped too.
    assert.equal(await pass(1), null);
    await db.exec(`insert into company_intro_candidates(company_workspace_id, role_id, talent_id, selection_reason,
      role_fingerprint, talent_fingerprint, presentation) values ('${workspace}', '${otherRole}', '${talent(4)}', 'x', 'x', 'x', '{"tldr":"elsewhere"}')`);
    assert.equal(await pass(4), null);
    assert.equal((await db.query<any>(`select count(*)::int n from company_intro_candidates where role_id = '${role}'`)).rows[0].n, 1);
    assert.equal((await db.query<any>(`select count(*)::int n from company_decision_events`)).rows[0].n, 1);

    // The flag covers only that insert: a card written next in the same transaction is an inbox showing.
    await db.exec(`begin;
      select pass_role_start_candidate_v1('${workspace}', '${role}', '${talent(3)}', '${actor}', '${run}', 'not a fit',
        '{}', 'role-start:x', 'role-start-v1');
      insert into company_intro_candidates(company_workspace_id, role_id, talent_id, selection_reason, role_fingerprint,
        talent_fingerprint, presentation) values ('${workspace}', '${role}', '${talent(2)}', 'kept', 'x', 'x', '{"tldr":"T2"}');
      commit;`);
    const shown = await surfaces(db);
    assert.deepEqual(shown[talent(3)], ["role_start"]);
    assert.deepEqual(shown[talent(2)], ["inbox_card", "role_start"]);
    assert.equal((await db.query<any>("select coalesce(current_setting('harper.company_card_shown_in', true), '') as v")).rows[0].v, "");

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    const signature = "pass_role_start_candidate_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,text,text)";
    assert.equal(await can(`has_function_privilege('service_role', '${signature}', 'EXECUTE')`), true);
    for (const user of ["anon", "authenticated"])
      assert.equal(await can(`has_function_privilege('${user}', '${signature}', 'EXECUTE')`), false);
  } finally { await db.close(); }
});

// The role start code itself, on the same database: postgres.js-style tagged
// queries are run on PGlite.
function pgliteSql(db: PGlite) {
  const run = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((query, part, index) => query + part + (index < values.length ? `$${index + 1}` : ""), "");
    const params = values.map((value) =>
      value && typeof value === "object" && "jsonValue" in value ? JSON.stringify((value as { jsonValue: unknown }).jsonValue) : value);
    return (await db.query(text, params)).rows;
  };
  return Object.assign(run, { json: (jsonValue: unknown) => ({ jsonValue }) });
}

test("registration: 맞지 않음 is passed without an inbox showing, the people kept are shown in the inbox", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";
  const { passDislikedFirstThree, keepLikedFirstThree } = await import("./roleStart/service");
  const db = await database();
  try {
    const sql = pgliteSql(db) as never;
    const verdict = { tldr: "요약", finalFit: "good", criteria: [], companyQuestion: null };
    const session = {
      brief: { summary: "", keywords: [], hardConditions: [], criteria: [] },
      firstCandidates: [1, 2, 3].map((n) => ({ talentId: talent(n), name: `후보 ${n}`, verdict })),
      evaluations: { [talent(1)]: { rating: "bad" }, [talent(2)]: { rating: "uncertain" }, [talent(3)]: { rating: "good" } },
    } as never;
    const args = { roleId: role, workspaceId: workspace, userId: actor, session };

    assert.equal(await passDislikedFirstThree(sql, args), 1);
    assert.equal(await passDislikedFirstThree(sql, args), 0, "a rerun adds nothing");
    assert.deepEqual(await keepLikedFirstThree(sql, args), ["후보 2", "후보 3"]);

    const cards = (await db.query<any>(`select talent_id, status from company_intro_candidates where role_id = '${role}' order by talent_id`)).rows;
    assert.deepEqual(cards.map((row) => [row.talent_id, row.status]),
      [[talent(1), "passed"], [talent(2), "ready"], [talent(3), "ready"]]);
    const shown = await surfaces(db);
    assert.deepEqual(shown[talent(1)], ["role_start"]);
    assert.deepEqual(shown[talent(2)], ["inbox_card", "role_start"]);
    assert.deepEqual(shown[talent(3)], ["inbox_card", "role_start"]);
    const decisions = (await db.query<any>(`select event.subject_id, event.action, event.channel, presentation.surface
      from company_decision_events event left join company_presentations presentation on presentation.id = event.presentation_id`)).rows;
    assert.deepEqual(decisions, [{ subject_id: talent(1), action: "pass", channel: "role_start", surface: "role_start" }]);
    // One role start run for both steps; the test-only allow-list still lists everyone written.
    assert.equal((await db.query<any>("select count(*)::int n from company_first_search_runs")).rows[0].n, 1);
    const [{ ids }] = (await db.query<any>(`select information->'testTalentIds' ids from company_roles where role_id = '${role}'`)).rows;
    assert.deepEqual([...new Set(ids)].sort(), [talent(1), talent(2), talent(3)]);
  } finally { await db.close(); }
});
