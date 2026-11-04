import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { formatToolResultText } from "@/lib/llm/promptText";

const talentId = "10000000-0000-4000-8000-000000000001";
const roleId = "20000000-0000-4000-8000-000000000001";
const siblingId = "20000000-0000-4000-8000-000000000002";

test("exact internal role lookup uses the tool contract and existing visibility filters", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-key";
  process.env.OPENAI_API_KEY = "fixture-key";
  // An isolated database executes the actual query, without production credentials.
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE company_workspace(company_workspace_id uuid, company_name text, published_name text);
    CREATE TABLE company_roles(role_id uuid, company_workspace_id uuid, name text,
      description text, work_mode text, type text[], location_text text, posted_at timestamptz,
      updated_at timestamptz, source_type text, status text, is_expired boolean,
      expires_at timestamptz, information jsonb, opportunity_search_tsv tsvector);
    CREATE TABLE company_internal_roles(role_id uuid, request text);
    CREATE TABLE official_jobs(id integer, role_id uuid, company_name text, is_published boolean, updated_at timestamptz);
    CREATE TABLE talent_opportunity_fit(talent_id uuid, opportunity_id uuid, human_label text,
      label text, recommend boolean, role_fit text, candidate_fit text, company_fit text,
      reason text, score float, last_evaluated_at timestamptz, pending boolean);
    CREATE TABLE talent_progress(talent_id uuid, role_id uuid, kind text, metadata jsonb);
    CREATE TABLE talent_opportunity_tag(talent_id uuid, opportunity_id uuid, tag text);
    CREATE TABLE talent_effective_opportunity_recommendations_v1(id uuid, talent_id uuid,
      role_id uuid, feedback text, saved_stage text, updated_at timestamptz, created_at timestamptz);
    CREATE FUNCTION talent_internal_role_reconsideration_is_pending_v1(f talent_opportunity_fit)
      RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(f.pending, false) $$;
    CREATE FUNCTION talent_internal_role_is_candidate_visible_v1(f talent_opportunity_fit)
      RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(f.human_label, f.label) = 'fit' $$;
    INSERT INTO company_workspace VALUES ('30000000-0000-4000-8000-000000000001', 'Private Company', 'Public Company');
    INSERT INTO company_roles(role_id, company_workspace_id, name, source_type, status, information, opportunity_search_tsv)
      VALUES ('${roleId}', '30000000-0000-4000-8000-000000000001', 'Platform Engineer', 'internal', 'active', '{}', to_tsvector('simple', 'Platform Engineer')),
             ('${siblingId}', '30000000-0000-4000-8000-000000000001', 'Platform Engineer', 'internal', 'active', '{}', to_tsvector('simple', 'Platform Engineer'));
  `);

  // The tag adapter only binds values; all filtering runs in PostgreSQL.
  const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.reduce(
      (text, part, i) => text + (i ? `$${i}` : "") + part,
      ""
    );
    const params = values.map((value) =>
      Array.isArray(value)
        ? `{${value.map((item) => JSON.stringify(item)).join(",")}}`
        : value
    );
    return (await db.query(sql, params)).rows;
  };
  const client = Object.assign(query, {
    begin: async (work: (tx: typeof query) => unknown) => work(query),
    unsafe: async () => [],
  });
  const nodeModule = Module as typeof Module & {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = nodeModule._load;
  const previousUrl = process.env.CAREER_ROLE_SEARCH_DATABASE_URL;
  process.env.CAREER_ROLE_SEARCH_DATABASE_URL = "postgres://isolated-fixture";
  nodeModule._load = function (request, parent, isMain) {
    if (request === "postgres") return () => client;
    if (request === "server-only") return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  let tools: typeof import("@/lib/talentOnboarding/tools");
  let searchInternalRolesForCareerTool: typeof import("./internalRoleSearch").searchInternalRolesForCareerTool;
  try {
    tools = await import("@/lib/talentOnboarding/tools");
    ({ searchInternalRolesForCareerTool } = await import("./internalRoleSearch"));
  } finally {
    nodeModule._load = originalLoad;
  }
  t.after(() => {
    if (previousUrl === undefined)
      delete process.env.CAREER_ROLE_SEARCH_DATABASE_URL;
    else process.env.CAREER_ROLE_SEARCH_DATABASE_URL = previousUrl;
  });
  const definition = tools
    .getOpenAIChatTools("chat")
    .find((tool) => tool.function.name === "get_internal_roles")!;
  assert.ok(definition);
  const schema = definition.function.parameters;
  assert.equal(
    (schema.properties as Record<string, { type: string }>).role_id.type,
    "string"
  );
  for (const key of ["role_id", "keywords"]) {
    assert.ok(!(schema.required as string[] | undefined)?.includes(key));
  }
  assert.ok(!("matchedOnly" in (schema.properties as Record<string, unknown>)));
  assert.ok(!("company" in (schema.properties as Record<string, unknown>)));
  // Keep coverage of the legacy internal reader without exposing it to Career.
  const legacySearch = (input: Record<string, unknown>) => searchInternalRolesForCareerTool({
    ...input, roleId: input.role_id, userId: talentId,
  });
  const search = async (input: Record<string, unknown>) =>
    (await tools.executeTalentTool({
      name: "get_internal_roles",
      input,
      context: { userId: talentId },
      logging: false,
    })) as {
      returnedCount: number;
      roles: { id: string; role: string }[];
    };

  await assert.rejects(() => search({ matchedOnly: true }), /requires role_id or keywords/);
  const exact = await search({ role_id: roleId });
  assert.deepEqual(
    exact.roles.map((role) => role.id),
    [roleId]
  );
  const providerText = formatToolResultText(exact);
  t.diagnostic(`Provider-facing exact-role result:\n${providerText}`);
  assert.ok(providerText.includes(roleId));
  assert.ok(providerText.includes("Platform Engineer"));
  assert.ok(providerText.includes("Public Company"));
  assert.ok(!providerText.includes("Private Company"));
  assert.ok(!providerText.trim().startsWith("{"));
  assert.equal((await search({ keywords: ["Platform"] })).returnedCount, 2);
  assert.equal(
    (await search({ role_id: roleId, keywords: ["Accountant"] })).returnedCount,
    0
  );
  assert.equal(
    (await legacySearch({ role_id: roleId, matchedOnly: true })).returnedCount,
    0
  );

  await db.query(
    "INSERT INTO talent_opportunity_fit(talent_id, opportunity_id, label) VALUES ($1,$2,'fit'),($1,$3,'fit')",
    [talentId, roleId, siblingId]
  );
  assert.deepEqual(
    (await legacySearch({ role_id: roleId, matchedOnly: true })).roles.map(
      (role) => role.id
    ),
    [roleId]
  );
  assert.equal(
    (
      await legacySearch({
        role_id: roleId,
        matchedOnly: true,
        company: "Different Company",
      })
    ).returnedCount,
    0
  );

  await db.query(
    "UPDATE talent_opportunity_fit SET label='hold' WHERE opportunity_id=$1",
    [roleId]
  );
  assert.equal((await search({ role_id: roleId })).returnedCount, 1, "private fit judgments do not hide a user-chosen active Role");
  assert.equal((await legacySearch({ role_id: roleId, matchedOnly: true })).returnedCount, 0);
  await db.query("DELETE FROM talent_opportunity_fit WHERE opportunity_id=$1", [
    roleId,
  ]);
  for (const patch of [
    "status='closed'",
    "is_expired=true",
    "expires_at=now() - interval '1 day'",
    'information=\'{"testOnly":true,"testFixture":"internal-role-id-lookup"}\'',
    "source_type='external'",
  ]) {
    await db.query(`UPDATE company_roles SET ${patch} WHERE role_id=$1`, [
      roleId,
    ]);
    assert.equal((await search({ role_id: roleId })).returnedCount, 0, patch);
    await db.query(
      "UPDATE company_roles SET status='active', is_expired=false, expires_at=null, information='{}', source_type='internal' WHERE role_id=$1",
      [roleId]
    );
  }
  await assert.rejects(search({ role_id: "invalid-id" }), /invalid role_id/);
});
