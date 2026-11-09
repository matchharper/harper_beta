import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type User } from "@supabase/supabase-js";
import { withCompanyAgentScope } from "@/lib/agentContacts/companyScope";
import { readCompanyMemory, writeCompanyMemory } from "./companyMemory";

// Who reads company-wide memory. Harper's Role-bound runs (a service principal
// with no team) read it for judgment; a team-scoped member stays blind to it;
// nobody but Organization access writes it. Synthetic client, no database.
const workspaceId = "00000000-0000-4000-8000-000000000001";
const roleId = "00000000-0000-4000-8000-000000000002";
const teamId = "00000000-0000-4000-8000-000000000003";

function client(member?: Record<string, unknown>) {
  const calls: URL[] = [];
  const rpcs: string[] = [];
  const admin = createClient("https://company-memory.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    calls.push(url);
    const table = url.pathname.split("/").at(-1)!;
    if (url.pathname.includes("/rpc/")) rpcs.push(table);
    const one = String(new Headers(init?.headers).get("Accept") ?? "").includes("vnd.pgrst.object");
    const data = table === "company_workspace" ? { is_reviewing: false }
      : table === "company_user_workspace" ? member
      : table === "company_workspace_teams" ? [{ id: teamId, name: "Engineering" }]
      : table === "company_internal_roles" ? { team_id: teamId }
      : table === "company_roles" ? (one ? { role_id: roleId, company_internal_roles: { team_id: teamId } } : [{ role_id: roleId, company_internal_roles: { team_id: teamId } }])
      : [];
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" } });
  } } });
  const memoryQuery = () => calls.filter((url) => url.pathname.endsWith("/company_memory_entries")).at(-1)?.searchParams.get("or") ?? null;
  return { admin, memoryQuery, rpcs };
}

const serviceUser = { id: "job", app_metadata: {}, user_metadata: {}, aud: "service", created_at: "2026-11-08T00:00:00Z" } as User;
function service(companyMemory = true) {
  const fake = client();
  const admin = withCompanyAgentScope(fake.admin, { kind: "company_event", workspaceId, roleId, jobId: "job", leaseOwner: "lease", assertCurrent: async () => {}, companyMemory } as any);
  return { ...fake, args: { admin: admin as any, user: serviceUser, workspaceId } };
}
function teamMember() {
  const fake = client({ authority: "admin", access_scope: "team", team_id: teamId, company_workspace_team_members: [{ team_id: teamId }] });
  return { ...fake, args: { admin: fake.admin as any, user: { id: "member", email: "member@example.test" } as User, workspaceId } };
}

test("Harper's Role-bound run reads company memory with the Role's own", async () => {
  const run = service();
  await readCompanyMemory({ ...run.args, input: { limit: 8, forRoleId: roleId } });
  assert.match(run.memoryQuery()!, /scope\.eq\.company/);
  assert.match(run.memoryQuery()!, new RegExp(`scope\\.eq\\.role,role_id\\.eq\\.${roleId}`));
  // An explicit company read is allowed too.
  await readCompanyMemory({ ...run.args, input: { scope: "company" } });
  assert.match(run.memoryQuery()!, /scope\.eq\.company/);
});

test("correspondence with a candidate's agent does not read company memory", async () => {
  const run = service(false);
  await readCompanyMemory({ ...run.args, input: { limit: 8, forRoleId: roleId } });
  assert.doesNotMatch(run.memoryQuery()!, /scope\.eq\.company/);
  await assert.rejects(readCompanyMemory({ ...run.args, input: { scope: "company" } }), /Company memory is unavailable in this audience/);
});

test("a team-scoped member still does not see company memory", async () => {
  const member = teamMember();
  await readCompanyMemory({ ...member.args, input: { limit: 8, forRoleId: roleId } });
  assert.doesNotMatch(member.memoryQuery()!, /scope\.eq\.company/);
  await readCompanyMemory({ ...member.args, input: {} });
  assert.doesNotMatch(member.memoryQuery()!, /scope\.eq\.company/);
  await assert.rejects(readCompanyMemory({ ...member.args, input: { scope: "company" } }), /Company memory is unavailable in this audience/);
});

test("Harper's Role-bound run still cannot write company memory", async () => {
  const run = service();
  await assert.rejects(
    writeCompanyMemory({ ...run.args, input: { operationId: "op", changes: [{ op: "add", scope: "company", label: "규칙", content: "연봉 상한" }] } }),
    /Company memory is unavailable in this audience/
  );
  assert.deepEqual(run.rpcs, []);
});
