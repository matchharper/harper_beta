import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// One save is one Brief version with who and where (#249, #260): role facts,
// criteria and the salary text of one save share a transaction; Ops edits say
// "ops". The production company data writers are stood in by small
// equivalents that keep their source check; the Brief history table and its
// trigger are the production ones.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace, name text,
    description text, location_text text, country_code text, work_mode text, type text, seniority_level text,
    salary_range text, salary_min int, salary_max int, salary_currency text, salary_period text, source_type text,
    status text default 'active', priority smallint, is_expired boolean default false, updated_at timestamptz);
  create table company_internal_roles(role_id uuid primary key references company_roles, request text,
    criteria jsonb default '[]', team_id uuid, memory text, is_anonymous boolean default false, updated_at timestamptz,
    created_at timestamptz default now(), role_status_changed_at timestamptz);
  create table company_role_start_sessions(role_id uuid primary key references company_roles, brief jsonb);
  create table company_agent_web_action_jobs(id uuid primary key);
  create table company_events(workspace_id uuid, content text, source text, created_at timestamptz);
  create table company_intro_candidates(id uuid primary key, company_workspace_id uuid, role_id uuid, talent_id uuid,
    status text, close_reason text, requested_by_company_user_id uuid, requested_at timestamptz, company_appeal text,
    next_stage_id uuid, revision int not null default 0, updated_at timestamptz);
  create table company_messages(id bigint generated always as identity primary key, company_workspace_id uuid, body text);
  create table talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
    recommendation_id uuid, user_id text, company_user_id uuid, kind text, text text, metadata jsonb,
    created_at timestamptz default now(), open_to_talent boolean, open_to_company boolean);
  create function company_role_search_brief_snapshot_v1(p_role_id uuid) returns jsonb language sql stable set search_path = public as $$
    select jsonb_build_object('roleId', r.role_id, 'name', r.name, 'request', ir.request, 'criteria', ir.criteria,
      'location', r.location_text, 'salaryRange', r.salary_range)
    from company_roles r join company_internal_roles ir using(role_id) where r.role_id = p_role_id $$;
  create function company_role_search_brief_version_v1(p_role_id uuid) returns text language sql stable set search_path = public as $$
    select md5(company_role_search_brief_snapshot_v1(p_role_id)::text) $$;
  create function pass_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_passed') $$;
  create function request_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid,
    p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_requested') $$;
  -- Stand-in for the production company data writer: same source check, role name and location only.
  create function apply_company_data_changes_v1(p_workspace_id uuid, p_changes jsonb, p_source text, p_event_content text)
  returns jsonb language plpgsql security definer set search_path = public as $$
  declare v_change jsonb; v_count int := 0; v_current text;
  begin
    if p_source is null or p_source not in ('chat', 'slack', 'website') then
      raise exception using errcode = '22023', message = 'invalid company data source';
    end if;
    for v_change in select value from jsonb_array_elements(p_changes) loop
      select case v_change->>'key' when 'role_name' then name else location_text end into v_current
      from company_roles where role_id = (v_change->>'role_id')::uuid;
      if v_change ? 'expected' and to_jsonb(v_current) is distinct from v_change->'expected' then
        return jsonb_build_object('status', 'conflict', 'key', v_change->>'key');
      end if;
      update company_roles set name = case when v_change->>'key' = 'role_name' then v_change->>'value' else name end,
        location_text = case when v_change->>'key' = 'role_location' then v_change->>'value' else location_text end,
        updated_at = now()
      where role_id = (v_change->>'role_id')::uuid;
      v_count := v_count + 1;
    end loop;
    insert into company_events values (p_workspace_id, p_event_content, p_source, now());
    return jsonb_build_object('status', 'updated', 'changed_count', v_count);
  end $$;
  -- Stand-in for the chat salary writer (salaryRange key), delegating the rest.
  create function apply_company_data_changes_with_role_salary_v1(p_workspace_id uuid, p_changes jsonb, p_source text, p_event_content text)
  returns jsonb language plpgsql security definer set search_path = public as $$
  declare v_other jsonb;
  begin
    update company_roles r set salary_range = c.value->>'value', updated_at = now()
    from jsonb_array_elements(p_changes) c
    where c.value->>'key' = 'salaryRange' and r.role_id = (c.value->>'role_id')::uuid;
    select coalesce(jsonb_agg(value), '[]') into v_other from jsonb_array_elements(p_changes) where value->>'key' <> 'salaryRange';
    if jsonb_array_length(v_other) > 0 then perform apply_company_data_changes_v1(p_workspace_id, v_other, p_source, p_event_content); end if;
    return jsonb_build_object('status', 'updated', 'changed_count', jsonb_array_length(p_changes));
  end $$;
  -- Production criteria writer (input checks left out).
  create function update_company_internal_role_criteria_v1(p_workspace_id uuid, p_role_id uuid, p_expected_criteria jsonb,
    p_criteria jsonb, p_event_content text, p_source text)
  returns jsonb language plpgsql security definer set search_path to 'public' as $$
  declare v_current jsonb;
  begin
    select coalesce(cir.criteria, '[]'::jsonb) into v_current
    from company_roles r join company_internal_roles cir on cir.role_id = r.role_id
    where r.company_workspace_id = p_workspace_id and r.role_id = p_role_id for update of r, cir;
    if v_current is distinct from p_expected_criteria then return jsonb_build_object('status', 'conflict'); end if;
    if v_current = p_criteria then return jsonb_build_object('status', 'already_reflected'); end if;
    update company_internal_roles set criteria = p_criteria, updated_at = now() where role_id = p_role_id;
    return jsonb_build_object('status', 'updated');
  end $$;
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const draft = "10000000-0000-4000-8000-000000000003";
const fresh = "10000000-0000-4000-8000-000000000004";
const actor = "10000000-0000-4000-8000-000000000005";
const opsUser = "10000000-0000-4000-8000-000000000006";

const migration = (name: string) => readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");

test("one save is one Brief version with who and where; Ops edits say ops", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}', 'Company');
      insert into company_roles(role_id, company_workspace_id, name, location_text, source_type, status) values
        ('${role}', '${workspace}', 'Engineer', 'Seoul', 'internal', 'active'),
        ('${draft}', '${workspace}', 'Analyst', 'Seoul', 'internal', 'active'),
        ('${fresh}', '${workspace}', 'Writer', 'Seoul', 'internal', 'draft');
      insert into company_internal_roles(role_id, request, criteria) values
        ('${role}', 'brief', '[]'), ('${draft}', 'brief', '[]'), ('${fresh}', 'brief', '[]');
    `);
    // The Brief history table and its trigger, and v1, as in production.
    const history = await migration("20261022094500_company_hiring_brief_history.sql");
    await db.exec(history.slice(history.indexOf("create table public.company_role_hiring_brief_history"),
      history.indexOf("-- A Hiring Brief is free text.")));
    await db.exec(history.match(/create trigger company_hiring_brief_history_capture[\s\S]*?;\n/)![0]);
    await db.exec(history.slice(history.indexOf("create function public.apply_company_data_with_hiring_history_v1"),
      history.indexOf("create function public.claim_company_hiring_brief_summary_v1")));
    for (const name of [
      "20261105020000_company_decision_events.sql",
      "20261105080000_company_role_brief_revisions.sql",
      "20261105090100_company_role_setting_revisions.sql",
      "20261107060000_company_brief_change_records.sql",
    ]) await db.exec(await migration(name));

    const versions = async (id: string) => (await db.query<any>(
      "select revision, source, actor_user_id, actor_label, snapshot from company_role_brief_revisions where role_id = $1 order by revision",
      [id])).rows;
    const v2 = (changes: unknown[], criteria: unknown[], options: { source?: string; changeSource?: string | null;
      actorId?: string | null; label?: string | null; salary?: unknown } = {}) =>
      db.query<any>(`select apply_company_data_with_hiring_history_v2($1, $2::jsonb, $3::jsonb, $4, 'Saved', $5, $6, false, $7, $8::jsonb) r`,
        [workspace, JSON.stringify(changes), JSON.stringify(criteria), options.source ?? "website", options.actorId ?? actor,
          options.label ?? "Kim", options.changeSource ?? null, options.salary === undefined ? null : JSON.stringify(options.salary)])
        .then(result => result.rows[0].r);
    const before = (await versions(role)).length;

    // Role facts alone: one version, with who and where.
    assert.equal((await v2([{ key: "role_location", role_id: role, expected: "Seoul", value: "Busan" }], [])).status, "updated");
    let rows = await versions(role);
    assert.equal(rows.length, before + 1);
    assert.deepEqual([rows.at(-1).source, rows.at(-1).actor_user_id, rows.at(-1).actor_label], ["website", actor, "Kim"]);

    // Facts, criteria and the salary text of one save: one version, one history item.
    const criteria = [{ name: "Go", criteria: "Ships Go services" }];
    const saved = await v2([{ key: "role_name", role_id: role, value: "Senior Engineer" }],
      [{ role_id: role, expected: [], value: criteria }], { salary: { role_id: role, value: "1억" } });
    assert.equal(saved.status, "updated");
    assert.equal(saved.history_ids.length, 1);
    rows = await versions(role);
    assert.equal(rows.length, before + 2);
    assert.equal(rows.at(-1).snapshot.search.name, "Senior Engineer");
    assert.equal(rows.at(-1).snapshot.search.salaryRange, "1억");
    assert.deepEqual(rows.at(-1).snapshot.search.criteria, criteria);
    const item = (await db.query<any>("select source, actor_user_id from company_role_hiring_brief_history where id = $1",
      [saved.history_ids[0]])).rows[0];
    assert.deepEqual([item.source, item.actor_user_id], ["website", actor]);

    // The salary text alone is a save too; the same text again is nothing.
    assert.equal((await v2([], [], { salary: { role_id: role, value: "1억 2천" } })).status, "updated");
    assert.equal((await v2([], [], { salary: { role_id: role, value: "1억 2천" } })).status, "already_reflected");
    rows = await versions(role);
    assert.equal(rows.length, before + 3);
    assert.equal(rows.at(-1).actor_user_id, actor);

    // A conflict writes nothing, the salary included.
    const conflict = await v2([{ key: "role_name", role_id: role, value: "Other" }],
      [{ role_id: role, expected: [{ name: "stale" }], value: [] }], { salary: { role_id: role, value: "0" } });
    assert.equal(conflict.status, "conflict");
    const current = (await db.query<any>("select name, salary_range from company_roles where role_id = $1", [role])).rows[0];
    assert.deepEqual([current.name, current.salary_range], ["Senior Engineer", "1억 2천"]);
    assert.equal((await versions(role)).length, before + 3);

    // The role creation chat writes the salary only while the role is a draft.
    await v2([], [], { source: "chat", salary: { role_id: draft, value: "x", draft_only: true } });
    assert.equal((await db.query<any>("select salary_range from company_roles where role_id = $1", [draft])).rows[0].salary_range, null);
    await v2([], [], { source: "chat", salary: { role_id: fresh, value: "x", draft_only: true } });
    assert.equal((await db.query<any>("select salary_range from company_roles where role_id = $1", [fresh])).rows[0].salary_range, "x");
    assert.equal((await versions(fresh)).at(-1).source, "chat");

    // The chat's role facts now go through v1, which records who and where too.
    await db.query(`select apply_company_data_with_hiring_history_v1($1, $2::jsonb, '[]'::jsonb, 'chat', 'Saved', $3, 'Lee') r`,
      [workspace, JSON.stringify([{ key: "role_name", role_id: fresh, value: "Lead Writer", expected: "Writer" }]), actor]);
    const chat = (await versions(fresh)).at(-1);
    assert.deepEqual([chat.source, chat.actor_user_id, chat.actor_label, chat.snapshot.search.name], ["chat", actor, "Lee", "Lead Writer"]);

    // Ops: the company data writer still gets "website", the records say "ops".
    await v2([{ key: "role_location", role_id: draft, value: "Daegu" }], [], { changeSource: "ops", actorId: opsUser, label: "Ops" });
    const ops = (await versions(draft)).at(-1);
    assert.deepEqual([ops.source, ops.actor_user_id, ops.actor_label], ["ops", opsUser, "Ops"]);
    assert.equal((await db.query<any>("select source from company_events order by created_at desc limit 1")).rows[0].source, "website");
    // A setting change from Ops is recorded the same way.
    await db.exec(`create or replace function apply_company_data_changes_v1(p_workspace_id uuid, p_changes jsonb, p_source text,
      p_event_content text) returns jsonb language sql security definer set search_path = public as $$
      update company_roles set status = 'paused' where role_id = (p_changes->0->>'role_id')::uuid;
      select jsonb_build_object('status', 'updated', 'changed_count', 1) $$;`);
    await v2([{ key: "role_status", role_id: draft, value: "paused" }], [], { changeSource: "ops", actorId: opsUser, label: "Ops" });
    const setting = (await db.query<any>("select source, actor_user_id from company_role_setting_revisions where role_id = $1 order by revision desc limit 1",
      [draft])).rows[0];
    assert.deepEqual([setting.source, setting.actor_user_id], ["ops", opsUser]);

    // A bad salary value is refused before anything is written.
    await assert.rejects(v2([], [], { salary: { role_id: role, value: 5 } }), /salary range/);
    await assert.rejects(v2([], [], { salary: { value: "x" } }), /salary range/);

    // A role start session created with an empty Brief is no Brief change.
    const count = (await versions(fresh)).length;
    await db.exec(`insert into company_role_start_sessions values ('${fresh}', '{}')`);
    assert.equal((await versions(fresh)).length, count);
    await db.exec(`update company_role_start_sessions set brief = '{"summary":"first"}' where role_id = '${fresh}'`);
    assert.equal((await versions(fresh)).length, count + 1);
    assert.equal((await versions(fresh)).at(-1).snapshot.sessionBrief.summary, "first");

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    const signature = "apply_company_data_with_hiring_history_v2(uuid,jsonb,jsonb,text,text,uuid,text,boolean,text,jsonb)";
    assert.equal(await can(`has_function_privilege('service_role', '${signature}', 'EXECUTE')`), true);
    assert.equal(await can(`has_function_privilege('authenticated', '${signature}', 'EXECUTE')`), false);
    assert.equal(await can(`has_function_privilege('anon', '${signature}', 'EXECUTE')`), false);

    // Applying the file again changes nothing.
    await db.exec(await migration("20261107060000_company_brief_change_records.sql"));
  } finally { await db.close(); }
});
