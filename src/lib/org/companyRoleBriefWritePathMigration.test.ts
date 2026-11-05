import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// One write path for the Brief (D18, E3a): a registered role-start role's Brief
// text and criteria are copies of its role start Brief and change only from role
// start, on every path; the write function records who and where. The two
// production company data writers are stood in by small equivalents.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace, name text,
    description text, location_text text, country_code text, work_mode text, type text, seniority_level text,
    salary_range text, salary_min int, salary_max int, salary_currency text, salary_period text, source_type text,
    status text default 'active', is_expired boolean default false, updated_at timestamptz);
  create table company_internal_roles(role_id uuid primary key references company_roles, request text,
    criteria jsonb default '[]', team_id uuid, memory text, updated_at timestamptz);
  create table company_role_start_sessions(role_id uuid primary key references company_roles, brief jsonb,
    brief_source text, phase text);
  create table company_role_hiring_brief_history(id uuid primary key default gen_random_uuid(), role_id uuid,
    source text, transaction_id bigint default txid_current(), created_at timestamptz default now());
  create table company_events(workspace_id uuid, content text, source text, created_at timestamptz);
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
    select jsonb_build_object('roleId', r.role_id, 'name', r.name, 'request', ir.request, 'criteria', ir.criteria)
    from company_roles r join company_internal_roles ir using(role_id) where r.role_id = p_role_id $$;
  create function company_role_search_brief_version_v1(p_role_id uuid) returns text language sql stable set search_path = public as $$
    select md5(company_role_search_brief_snapshot_v1(p_role_id)::text) $$;
  create function scheduled_company_memory_fingerprint_v1(p_role uuid) returns text language sql stable set search_path = public as $$
    select md5(coalesce((select i.memory from company_internal_roles i where i.role_id = p_role), '')) $$;
  create function pass_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_passed') $$;
  create function request_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid,
    p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_requested') $$;
  -- Stand-in for the production company data writer (role_request only).
  create function apply_company_data_changes_internal_v1(p_workspace_id uuid, p_changes jsonb, p_source text,
    p_event_content text, p_sync_company_db boolean)
  returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_change jsonb;
begin
  if p_sync_company_db is null then
    raise exception using errcode = '22023', message = 'company_db sync mode is required';
  end if;
  for v_change in select value from jsonb_array_elements(p_changes) loop
    if v_change->>'key' = 'role_request' then
      update public.company_internal_roles set request = v_change->>'value'
      where role_id = (v_change->>'role_id')::uuid and request is distinct from v_change->>'value';
    end if;
  end loop;
  return jsonb_build_object('status', 'updated');
end;
$function$;
  -- Production criteria writer (input checks left out; the rest as in production).
  CREATE FUNCTION public.update_company_internal_role_criteria_v1(p_workspace_id uuid, p_role_id uuid, p_expected_criteria jsonb, p_criteria jsonb, p_event_content text, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current jsonb;
  v_now timestamptz := now();
begin
  select coalesce(cir.criteria, '[]'::jsonb)
  into v_current
  from public.company_roles r
  join public.company_internal_roles cir on cir.role_id = r.role_id
  where r.company_workspace_id = p_workspace_id
    and r.role_id = p_role_id
    and r.source_type = 'internal'
    and r.is_expired is not true
  for update of r, cir;

  if not found then
    raise exception using errcode = 'P0002', message = 'internal role not found';
  end if;
  if v_current is distinct from p_expected_criteria then
    return jsonb_build_object('status', 'conflict');
  end if;
  if v_current = p_criteria then
    return jsonb_build_object('status', 'already_reflected');
  end if;

  update public.company_internal_roles
  set criteria = p_criteria, updated_at = v_now
  where role_id = p_role_id;

  update public.company_roles
  set updated_at = v_now
  where role_id = p_role_id;

  insert into public.company_events(workspace_id, content, source, created_at)
  values (p_workspace_id, p_event_content, p_source, v_now);

  return jsonb_build_object('status', 'updated');
end;
$function$;
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const plain = "10000000-0000-4000-8000-000000000002";
const started = "10000000-0000-4000-8000-000000000003";
const draft = "10000000-0000-4000-8000-000000000004";
const fresh = "10000000-0000-4000-8000-000000000005";
const actor = "10000000-0000-4000-8000-000000000006";

test("a role-start role's Brief copy changes only from role start; the write function records who and where", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}', 'Company');
      insert into company_roles(role_id, company_workspace_id, name, source_type, status) values
        ('${plain}', '${workspace}', 'Engineer', 'internal', 'active'),
        ('${started}', '${workspace}', 'Designer', 'internal', 'active'),
        ('${draft}', '${workspace}', 'Analyst', 'internal', 'draft'),
        ('${fresh}', '${workspace}', 'Writer', 'internal', 'draft');
      insert into company_internal_roles(role_id, request, criteria) values
        ('${plain}', 'plain brief', '[]'), ('${started}', 'started brief', '[]'), ('${draft}', 'draft brief', '[]');
      insert into company_role_start_sessions values
        ('${started}', '{}', 'onboarding', 'done'), ('${draft}', '{}', 'onboarding', 'review');
    `);
    for (const name of [
      "20261105020000_company_decision_events.sql",
      "20261105080000_company_role_brief_revisions.sql",
      "20261105180000_company_role_brief_write_path.sql",
    ]) await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));

    const request = async (role: string) =>
      (await db.query<any>("select request from company_internal_roles where role_id = $1", [role])).rows[0]?.request;
    const versions = async (role: string) => (await db.query<any>(
      "select revision, source, actor_user_id from company_role_brief_revisions where role_id = $1 order by revision", [role])).rows;
    const write = (role: string, text: string | null, criteria: unknown, roleStart = false) => db.query<any>(
      "select write_company_role_brief_v1($1, $2, $3::jsonb, 'role_start', $4, 'Kim', false, $5) r",
      [role, text, criteria === null ? null : JSON.stringify(criteria), actor, roleStart]);

    // An ordinary role's Brief is the original: other writes are not restricted.
    await db.exec(`update company_internal_roles set request = 'plain brief' where role_id = '${plain}'`);
    await db.exec(`insert into company_internal_roles(role_id) values ('${fresh}')`);
    // A direct write to a registered role-start role's copy is refused; other columns are not.
    await assert.rejects(db.exec(`update company_internal_roles set request = 'x' where role_id = '${started}'`),
      /company_role_brief_via_role_start/);
    await db.exec(`update company_internal_roles set team_id = '${actor}' where role_id = '${started}'`);

    // The write function saves with who and where; an unchanged save is no version.
    const saved = (await write(plain, "plain brief v2", null)).rows[0].r;
    assert.equal(saved.status, "updated");
    assert.equal(await request(plain), "plain brief v2");
    const last = (await versions(plain)).at(-1);
    assert.equal(last.source, "role_start");
    assert.equal(last.actor_user_id, actor);
    const count = (await versions(plain)).length;
    assert.equal((await write(plain, "plain brief v2", null)).rows[0].r.status, "unchanged");
    assert.equal((await versions(plain)).length, count);

    // The chat, Slack, website and Ops writers still work for an ordinary role.
    await db.query(`select apply_company_data_changes_internal_v1($1, $2::jsonb, 'chat', 'Saved', false)`,
      [workspace, JSON.stringify([{ key: "role_request", role_id: plain, value: "plain brief v3" }])]);
    assert.equal(await request(plain), "plain brief v3");
    const criteria = [{ name: "Go", criteria: "Ships Go services" }];
    const updated = (await db.query<any>(`select update_company_internal_role_criteria_v1($1, $2, '[]'::jsonb, $3::jsonb, 'Saved', 'chat') r`,
      [workspace, plain, JSON.stringify(criteria)])).rows[0].r;
    assert.equal(updated.status, "updated");

    // A registered role-start role changes only through role start, on every path.
    await assert.rejects(write(started, "edited elsewhere", null), /company_role_brief_via_role_start/);
    await assert.rejects(db.query(`select apply_company_data_changes_internal_v1($1, $2::jsonb, 'website', 'Saved', false)`,
      [workspace, JSON.stringify([{ key: "role_request", role_id: started, value: "edited elsewhere" }])]),
      /company_role_brief_via_role_start/);
    await assert.rejects(db.query(`select update_company_internal_role_criteria_v1($1, $2, '[]'::jsonb, $3::jsonb, 'Saved', 'chat')`,
      [workspace, started, JSON.stringify(criteria)]), /company_role_brief_via_role_start/);
    assert.equal(await request(started), "started brief");
    assert.equal((await write(started, "from the Brief", criteria, true)).rows[0].r.status, "updated");
    assert.equal(await request(started), "from the Brief");
    // The role start mark ends with its write.
    await assert.rejects(db.exec(`begin; select write_company_role_brief_v1('${started}', 'again', null, 'role_start', null, null, false, true);
      update company_internal_roles set request = 'after' where role_id = '${started}'; commit;`), /company_role_brief_via_role_start/);
    await db.exec("rollback");
    // An unchanged save from elsewhere is not a change and is not refused.
    await db.query(`select apply_company_data_changes_internal_v1($1, $2::jsonb, 'website', 'Saved', false)`,
      [workspace, JSON.stringify([{ key: "role_request", role_id: started, value: "from the Brief" }])]);

    // A role still in role start (draft) can be edited from chat as before.
    await db.query(`select apply_company_data_changes_internal_v1($1, $2::jsonb, 'chat', 'Saved', false)`,
      [workspace, JSON.stringify([{ key: "role_request", role_id: draft, value: "draft brief v2" }])]);
    assert.equal(await request(draft), "draft brief v2");

    // A new role's first Brief through the write function (Ops creation).
    assert.equal((await write(fresh, "first brief", null)).rows[0].r.status, "updated");
    assert.equal(await request(fresh), "first brief");

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    const signature = "write_company_role_brief_v1(uuid,text,jsonb,text,uuid,text,boolean,boolean)";
    assert.equal(await can(`has_function_privilege('service_role', '${signature}', 'EXECUTE')`), true);
    assert.equal(await can(`has_function_privilege('authenticated', '${signature}', 'EXECUTE')`), false);
  } finally { await db.close(); }
});
