import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Module from "node:module";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// One role start save is one Brief version with who and where (#249): the
// session's Brief and the Role's saved text and list commit together, and a
// session write that changes the Brief alone says who and where in the same
// round trip. Runs the production SQL of session.ts on PGlite with the Brief
// version, Brief history and write path migrations.
const roleId = "00000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text);
  create table company_users(user_id uuid primary key, name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace, name text,
    description text, location_text text, country_code text, work_mode text, type text, seniority_level text,
    salary_range text, salary_min int, salary_max int, salary_currency text, salary_period text, source_type text,
    status text default 'active', is_expired boolean default false, updated_at timestamptz, information jsonb default '{}');
  create table company_internal_roles(role_id uuid primary key references company_roles, request text,
    criteria jsonb default '[]', team_id uuid, memory text, updated_at timestamptz);
  create table company_role_start_sessions(role_id uuid primary key references company_roles, company_workspace_id uuid,
    phase text, brief jsonb default '{}', brief_source text, questions jsonb default '{}', pending_question jsonb,
    pool jsonb, first_candidates jsonb default '[]', evaluations jsonb default '{}', batch jsonb,
    timings jsonb default '{}', progress jsonb default '[]', refined_answers int default 0,
    revision int default 1, updated_at timestamptz default now());
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
    select jsonb_build_object('roleId', r.role_id, 'request', ir.request, 'criteria', ir.criteria, 'salaryRange', r.salary_range)
    from company_roles r join company_internal_roles ir using(role_id) where r.role_id = p_role_id $$;
  create function company_role_search_brief_version_v1(p_role_id uuid) returns text language sql stable set search_path = public as $$
    select md5(company_role_search_brief_snapshot_v1(p_role_id)::text) $$;
  create function pass_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_passed') $$;
  create function request_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid,
    p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_requested') $$;
`;

const migration = (name: string) =>
  readFile(new URL(`../../../../supabase/migrations/${name}`, import.meta.url), "utf8");

test("a role start save is one Brief version with who and where", async () => {
  const db = new PGlite();
  let statements = 0;
  // Execute the production tagged SQL with PGlite; fragments keep real bound parameters.
  class Fragment {
    constructor(readonly strings: readonly string[], readonly values: unknown[]) {}
    render(parameters: unknown[]): string {
      return this.strings.reduce((out, part, index) => {
        if (!index) return part;
        const value = this.values[index - 1];
        return out + (value instanceof Fragment ? value.render(parameters) : `$${parameters.push(value)}`) + part;
      }, "");
    }
    then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
      const parameters: unknown[] = [];
      const query = this.render(parameters);
      statements++;
      return db.query(query, parameters).then(result => resolve(result.rows), reject);
    }
  }
  const sql = Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => new Fragment(strings, values), {
    json: (value: unknown) => JSON.stringify(value),
    begin: async (run: (tx: unknown) => Promise<unknown>) => {
      await db.exec("begin");
      try {
        const out = await run(sql);
        await db.exec("commit");
        return out;
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    },
  });
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function(name, ...args) {
    if (name === "server-only") return {};
    if (name === "next/server") return { after: () => undefined };
    if (name === "./db") return { roleStartSql: () => sql };
    return original.call(this, name, ...args);
  };
  let session!: typeof import("./session");
  try { session = await import("./session"); }
  finally { loader._load = original; }
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspaceId}', 'Company');
      insert into company_users values ('${userId}', 'Kim');
      insert into company_roles(role_id, company_workspace_id, name, source_type, status)
        values ('${roleId}', '${workspaceId}', 'Engineer', 'internal', 'active');
      insert into company_internal_roles(role_id, request, criteria) values ('${roleId}', 'old text', '[]');
      insert into company_role_start_sessions(role_id, company_workspace_id, phase, brief, brief_source)
        values ('${roleId}', '${workspaceId}', 'done', '{"summary":"first","criteria":[],"hardConditions":[]}', 'onboarding');
    `);
    const history = await migration("20261022094500_company_hiring_brief_history.sql");
    await db.exec(history.slice(history.indexOf("create table public.company_role_hiring_brief_history"),
      history.indexOf("-- A Hiring Brief is free text.")));
    await db.exec(history.match(/create trigger company_hiring_brief_history_capture[\s\S]*?;\n/)![0]);
    for (const name of [
      "20261105020000_company_decision_events.sql",
      "20261105080000_company_role_brief_revisions.sql",
      "20261105180000_company_role_brief_write_path.sql",
      "20261105180100_company_role_brief_copy_guard.sql",
      "20261107060000_company_brief_change_records.sql",
    ]) await db.exec(await migration(name));

    const versions = async () => (await db.query<any>(
      "select revision, source, actor_user_id, actor_label, snapshot from company_role_brief_revisions where role_id = $1 order by revision",
      [roleId])).rows;
    const revision = async () =>
      (await db.query<{ revision: number }>("select revision from company_role_start_sessions")).rows[0].revision;
    const brief = (summary: string, criterion = "Ships Go services") => ({
      summary, hardConditions: [], keywords: [],
      criteria: [{ id: "cr1", name: "Go", criteria: criterion, requirement: "must" as const }],
    }) as unknown as import("./brief").RoleStartBrief;
    let count = (await versions()).length;

    // A team edit from the web: the session and the Role's copy are one version, one history item.
    const saved = await session.saveRoleStartSessionBrief({
      roleId, expectedRevision: await revision(), patch: { brief: brief("edited") },
      save: { changeSource: "matching_tab", historySource: "website", changeSummary: "edit", userId, writeRole: true },
    });
    assert.ok(saved);
    let rows = await versions();
    assert.equal(rows.length, count + 1, "one version for the session and the copy");
    const edited = rows.at(-1);
    assert.deepEqual([edited.source, edited.actor_user_id, edited.actor_label], ["website", userId, "Kim"]);
    assert.equal(edited.snapshot.sessionBrief.summary, "edited");
    assert.match(edited.snapshot.search.request, /edited/);
    assert.equal(edited.snapshot.search.criteria[0].criteria, "Ships Go services");
    assert.equal(saved.version, (await db.query<any>("select company_role_search_brief_version_v1($1) v", [roleId])).rows[0].v);
    const items = (await db.query<any>("select source, actor_user_id from company_role_hiring_brief_history")).rows;
    assert.deepEqual(items.map(item => [item.source, item.actor_user_id]), [["website", userId]]);
    count = rows.length;

    // A session moved meanwhile: nothing is written, the copy included.
    const stale = await session.saveRoleStartSessionBrief({
      roleId, expectedRevision: 1, patch: { brief: brief("lost") },
      save: { changeSource: "matching_tab", historySource: "website", changeSummary: null, userId, writeRole: true },
    });
    assert.equal(stale, null);
    assert.equal((await versions()).length, count);
    assert.match((await db.query<any>("select request from company_internal_roles")).rows[0].request, /edited/);

    // Harper's own background save: one version, where without a person.
    await session.saveRoleStartSessionBrief({
      roleId, expectedRevision: await revision(), patch: { brief: brief("edited", "Ships Go and Rust services") },
      save: { changeSource: "signals", changeSummary: null, userId: null, writeRole: true },
    });
    rows = await versions();
    assert.equal(rows.length, count + 1);
    assert.deepEqual([rows.at(-1).source, rows.at(-1).actor_user_id], ["signals", null]);
    count = rows.length;

    // A session write that changes the Brief alone says who and where, still one round trip.
    let before = statements;
    await session.saveRoleStartSession({ roleId, expectedRevision: await revision(), patch: { brief: brief("answered") },
      change: { source: "answer", userId } });
    assert.equal(statements, before + 1);
    rows = await versions();
    assert.equal(rows.length, count + 1);
    assert.deepEqual([rows.at(-1).source, rows.at(-1).actor_user_id, rows.at(-1).actor_label], ["answer", userId, "Kim"]);
    count = rows.length;
    // With no source given it is still marked as role start's.
    await session.saveRoleStartSession({ roleId, patch: { brief: brief("background") } });
    assert.equal((await versions()).at(-1).source, "role_start");
    count += 1;
    // A write without a Brief is no version and needs no context.
    before = statements;
    await session.saveRoleStartSession({ roleId, patch: { phase: "done" } });
    assert.equal(statements, before + 1);
    assert.equal((await versions()).length, count);

    // The compensation answer: the salary's version says who, in the same one round trip.
    before = statements;
    const compensation = await session.saveRoleStartCompensation(roleId, "1억", { source: "answer", userId });
    assert.equal(statements, before + 1);
    assert.equal(compensation.salaryRange, "1억");
    rows = await versions();
    assert.equal(rows.length, count + 1);
    assert.deepEqual([rows.at(-1).source, rows.at(-1).actor_user_id, rows.at(-1).snapshot.search.salaryRange], ["answer", userId, "1억"]);
  } finally { await db.close(); }
});
