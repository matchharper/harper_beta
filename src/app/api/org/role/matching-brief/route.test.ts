import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const roleId = "00000000-0000-4000-8000-000000000002";
const actorId = "00000000-0000-4000-8000-000000000003";
const teamId = "00000000-0000-4000-8000-000000000004";

test("matching Brief reads only display data and enforces workspace and team access", async (t) => {
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: "https://matching-brief.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-key",
  })) {
    const before = process.env[key];
    process.env[key] = value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  const nodeModule = Module as any, load = nodeModule._load;
  t.mock.method(nodeModule, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "server-only") return {};
    return load.call(this, name, ...args);
  });
  const session = {
    phase: "done", brief_source: "onboarding",
    brief: {
      summary: "서비스를 운영할 엔지니어", hardConditions: [],
      criteria: [{ id: "experience", name: "운영 경험", criteria: "서비스 운영 경험", requirement: "must", importance: "high", signals: { A: "private grade signal" } }],
      references: [],
    },
    progress: [{ key: "chat_brief_edit", status: "running", text: "private progress", at: new Date().toISOString() }],
  };
  let member = true, reviewing = false, roleExists = true, status = "active", roleTeam = teamId, fail = false;
  let storedSession: typeof session | null = session;
  const membership = { authority: "viewer", access_scope: "team", team_id: teamId };
  const reads: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://matching-brief.invalid", "Never contact production");
    assert.equal(init?.method ?? "GET", "GET", "Reading criteria must not create or update anything");
    reads.push(url.pathname);
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (url.pathname === "/auth/v1/user") return json({ id: actorId, email: "viewer@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {} });
    if (url.pathname === "/rest/v1/company_workspace") return json([{ is_reviewing: reviewing }]);
    if (url.pathname === "/rest/v1/company_user_workspace") {
      assert.equal(url.searchParams.get("company_user_id"), `eq.${actorId}`);
      assert.equal(url.searchParams.get("company_workspace_id"), `eq.${workspaceId}`);
      return json(member ? [membership] : []);
    }
    if (url.pathname === "/rest/v1/company_workspace_teams") return json([{ id: teamId, name: "Fixture team" }]);
    if (url.pathname === "/rest/v1/company_roles") {
      assert.equal(url.searchParams.get("company_workspace_id"), `eq.${workspaceId}`);
      assert.equal(url.searchParams.get("role_id"), `eq.${roleId}`);
      assert.equal(url.searchParams.get("source_type"), "eq.internal");
      assert.equal(url.searchParams.get("is_expired"), "not.is.true");
      assert.equal(url.searchParams.get("company_internal_roles.team_id"), `in.(${teamId})`);
      assert.equal(url.searchParams.get("company_internal_roles"), "not.is.null");
      const selected = url.searchParams.get("select")!;
      assert.ok(selected.includes("company_role_start_sessions("));
      assert.doesNotMatch(selected, /\*|pool|first_candidates|evaluations|llm_usage|timings|questions/);
      if (fail) return json({ message: "database unavailable" }, 500);
      return json(roleExists ? [{ status, company_internal_roles: { team_id: roleTeam }, company_role_start_sessions: storedSession }] : []);
    }
    assert.fail(`Unexpected dependency: ${url.pathname}`);
  });
  const { GET } = await import("./route");
  const { normalizeRoleStartBrief } = await import("@/lib/org/roleStart/brief");
  const { visibleBriefHash } = await import("@/lib/org/roleStart/view");
  const read = (auth = true, query = `workspaceId=${workspaceId}&roleId=${roleId}`) => GET(new NextRequest(
    `https://harper.invalid/api/org/role/matching-brief?${query}`,
    { headers: auth ? { Authorization: "Bearer matching-brief-fixture" } : {} }
  ));

  assert.equal((await read(false)).status, 401);
  assert.equal((await read(true, `workspaceId=${workspaceId}`)).status, 400);
  reads.length = 0;
  const response = await read();
  assert.equal(response.status, 200, "Viewers can read criteria for a Role in their team");
  const data = await response.json();
  assert.equal(data.structured, true);
  assert.equal(data.rubric.criteria[0].name, "운영 경험");
  assert.equal(data.briefHash, visibleBriefHash(normalizeRoleStartBrief(session.brief)));
  assert.deepEqual(data.session, { briefEdit: "running" });
  assert.doesNotMatch(JSON.stringify(data), /private grade signal|private progress|signals|pool|evaluations/);
  assert.equal(reads.filter(path => path.endsWith("/company_roles")).length, 1, "One combined Role and Brief read");
  assert.equal(reads.filter(path => path.startsWith("/rest/")).length, 4, "Only availability, membership, team, and Brief reads");

  session.progress[0].at = new Date(Date.now() - 6 * 60_000).toISOString();
  assert.deepEqual((await (await read()).json()).session, { briefEdit: null });
  session.progress[0].status = "error";
  assert.deepEqual((await (await read()).json()).session, { briefEdit: "error" });

  const legacy = { structured: false, rubric: null, briefHash: null, session: null };
  for (const source of ["chat", "legacy"]) {
    session.brief_source = source;
    assert.deepEqual(await (await read()).json(), legacy);
  }
  session.brief_source = "onboarding";
  session.phase = "superseded";
  assert.deepEqual(await (await read()).json(), legacy);
  session.phase = "done";
  status = "draft";
  assert.deepEqual(await (await read()).json(), legacy);
  status = "active";
  storedSession = null;
  assert.deepEqual(await (await read()).json(), legacy, "No session is created for legacy Roles");
  storedSession = session;

  roleTeam = "another-team";
  assert.equal((await read()).status, 404);
  roleTeam = teamId;
  roleExists = false;
  assert.equal((await read()).status, 404);
  roleExists = true;
  member = false;
  reads.length = 0;
  assert.equal((await read()).status, 403);
  assert.equal(reads.includes("/rest/v1/company_roles"), false);
  member = true;
  reviewing = true;
  assert.equal((await read()).status, 403);
  reviewing = false;
  fail = true;
  assert.equal((await read()).status, 500, "Read failures must not select the wrong editor");
});
