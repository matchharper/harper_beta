import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type User } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { companyAgentIsCorrespondence, companyRunCanContactCandidate, formatCompanyAgentServiceScope, withCandidateFacingRun, withCompanyAgentScope } from "@/lib/agentContacts/companyScope";
import { formatCompanyDecisions, readCompanyDecisions } from "./companyDecisions";
import { readWithdrawnTalentIds } from "./data";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const roleId = "00000000-0000-4000-8000-000000000002";
const teamId = "00000000-0000-4000-8000-000000000003";
const talentId = "00000000-0000-4000-8000-000000000004";
const gone = "00000000-0000-4000-8000-000000000005";
const externalId = "00000000-0000-4000-8000-000000000006";

const events = [
  { id: 4, role_id: roleId, subject_kind: "member_candidate", subject_id: talentId, action: "pass", detail: {}, reason_text: null, reason_tags: ["too_junior"], channel: "slack", created_at: "2026-11-08T00:00:00Z", role: { name: "Backend" } },
  { id: 3, role_id: roleId, subject_kind: "external_candidate", subject_id: externalId, action: "pass", detail: {}, reason_text: "No startup work", reason_tags: [], channel: "web", created_at: "2026-11-07T00:00:00Z", role: { name: "Backend" } },
  { id: 2, role_id: roleId, subject_kind: "member_candidate", subject_id: gone, action: "rate", detail: { rating: 1 }, reason_text: "Too senior", reason_tags: [], channel: "role_start", created_at: "2026-11-06T00:00:00Z", role: { name: "Backend" } },
  { id: 1, role_id: roleId, subject_kind: "todo_suggestion", subject_id: null, action: "reject", detail: { title: "Ask about pay", progressId: "x" }, reason_text: null, reason_tags: [], channel: "todo", created_at: "2026-11-05T00:00:00Z", role: { name: "Backend" } },
];

function client(member?: Record<string, unknown>, rows: unknown[] = events) {
  const calls: URL[] = [];
  const admin = createClient("https://decisions.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    calls.push(url);
    const table = url.pathname.split("/").at(-1)!;
    const one = String(new Headers(init?.headers).get("Accept") ?? "").includes("vnd.pgrst.object");
    const data = table === "company_workspace" ? { is_reviewing: false }
      : table === "company_user_workspace" ? member
      : table === "company_workspace_teams" ? [{ id: teamId, name: "Engineering" }]
      : table === "company_roles" ? (one ? { role_id: roleId, company_internal_roles: { team_id: teamId } } : [{ role_id: roleId, company_internal_roles: { team_id: teamId } }])
      : table === "company_decision_events" ? rows
      : table === "talent_users" ? [{ user_id: talentId, headline: "Engineer", deleted_at: null }, { user_id: gone, headline: "Hidden", deleted_at: "2026-11-01T00:00:00Z" }]
      : table === "external_candidates" ? [{ id: externalId, name: "Outside Person" }]
      : [];
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", "Content-Range": `0-${rows.length - 1}/${rows.length}` } });
  } } });
  const eventQuery = () => calls.filter((url) => url.pathname.endsWith("/company_decision_events")).at(-1)?.searchParams;
  const lastTalentQuery = () => calls.filter((url) => url.pathname.endsWith("/talent_users")).at(-1)?.searchParams;
  return { admin, eventQuery, lastTalentQuery };
}
const serviceUser = { id: "job", app_metadata: {}, user_metadata: {}, aud: "service", created_at: "2026-11-08T00:00:00Z" } as User;
const scoped = (fake: ReturnType<typeof client>, companyMemory: boolean) => ({
  admin: withCompanyAgentScope(fake.admin, { kind: "company_event", workspaceId, roleId, jobId: "job", leaseOwner: "lease", assertCurrent: async () => {}, companyMemory } as any) as any,
  user: serviceUser, workspaceId,
});
const owner = { authority: "owner", access_scope: "organization", team_id: null, company_workspace_team_members: [] };

test("every channel and kind is readable, also with tags only", async () => {
  const fake = client(owner);
  const read = await readCompanyDecisions({ admin: fake.admin as any, user: { id: "m", email: "m@example.test" } as User, workspaceId });
  assert.equal(read.items.length, 4);
  const text = formatCompanyDecisions(read);
  assert.match(text, /tags=too_junior/);
  assert.match(text, new RegExp(`talent:${talentId} \\(Engineer\\)`));
  assert.match(text, /외부 후보 .*Outside Person[\s\S]*이유: No startup work/);
  assert.match(text, /Ask about pay/);
  assert.equal(fake.eventQuery()!.get("action"), "neq.view");
});

test("a withdrawn candidate shows as withdrawn and the company's record stays", async () => {
  const text = formatCompanyDecisions(await readCompanyDecisions({ admin: client(owner).admin as any, user: { id: "m", email: "m@example.test" } as User, workspaceId }));
  assert.match(text, new RegExp(`talent:${gone} \\(더 이상 진행할 수 없는 후보\\)`));
  assert.match(text, /이유: Too senior/);
  assert.doesNotMatch(text, /Hidden/);
  assert.doesNotMatch(text, /progressId/);
});

test("only a person whose account is marked deleted counts as withdrawn", async () => {
  const fake = client(owner);
  await readWithdrawnTalentIds(fake.admin as any, [gone]);
  assert.equal(fake.lastTalentQuery()!.get("deleted_at"), "not.is.null");
  assert.equal((await readWithdrawnTalentIds(fake.admin as any, [])).size, 0);
});

const candidateRuns: Array<[string, Parameters<typeof companyRunCanContactCandidate>[0], boolean | null]> = [
  ["correspondence with a candidate's agent", { actionName: "agent_contact_received" }, false],
  ["an introduction follow-up", { actionName: "agent_schedule_due", schedule: { effect_tier: 0, target_refs: { introductionRootId: "root" } } }, false],
  ["a Harper schedule at effect tier 2", { actionName: "agent_schedule_due", schedule: { effect_tier: 2, target_refs: {} } }, true],
  ["a candidate contact received run", { actionName: "candidate_contact_received" }, null],
];
for (const [name, run, companyMemory] of candidateRuns) {
  test(`${name} sees that a decision happened, not why`, async () => {
    assert.equal(companyRunCanContactCandidate(run), true);
    const fake = client(owner);
    const marked = withCandidateFacingRun(fake.admin);
    const args = companyMemory === null
      ? { admin: marked as any, user: { id: "m", email: "m@example.test" } as User, workspaceId }
      : { ...scoped({ ...fake, admin: marked } as any, companyMemory) };
    assert.equal(companyAgentIsCorrespondence(args.admin), true);
    const read = await readCompanyDecisions(args);
    const text = formatCompanyDecisions(read);
    assert.equal(read.factsOnly, true);
    assert.doesNotMatch(fake.eventQuery()!.get("select")!, /reason_text|reason_tags|detail/);
    assert.equal(fake.eventQuery()!.get("subject_kind"), "in.(member_candidate,external_candidate)");
    for (const hidden of [/이유:/, /tags=/, /No startup work/, /too_junior/, /slack/, /Engineer\)/, /Outside Person/]) assert.doesNotMatch(text, hidden);
    assert.match(text, new RegExp(`role=${roleId} \\(Backend\\) · pass · talent:${talentId}$`, "m"));
    assert.match(text, new RegExp(`talent:${gone} \\(더 이상 진행할 수 없는 후보\\)`));
    assert.match(text, /결정이 있었다는 사실만 보임/);
    assert.doesNotMatch(text, /전하지 않음/);
  });
}

test("schedules below tier 2 and other runs are not candidate-facing", () => {
  assert.equal(companyRunCanContactCandidate({ actionName: "agent_schedule_due", schedule: { effect_tier: 1 } }), false);
  assert.equal(companyRunCanContactCandidate({ actionName: "agent_schedule_due", schedule: null }), false);
  assert.equal(companyRunCanContactCandidate({ actionName: "company_update" }), false);
});

test("both run creators apply the one helper", async () => {
  for (const file of ["../../agentContacts/companyReceiver.server.ts", "chat.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /companyRunCanContactCandidate\(\{ actionName/);
    assert.match(source, /withCandidateFacingRun\(/);
  }
});

test("the run's own access text does not promise reasons to a candidate-facing run", () => {
  const facing = formatCompanyAgentServiceScope({ roleId, companyMemory: true }, true);
  assert.doesNotMatch(facing, /결정 이유\(decisions\)는 판단/);
  assert.match(facing, /사실\(decisions\)만/);
  assert.match(formatCompanyAgentServiceScope({ roleId, companyMemory: true }), /결정 이유\(decisions\)는 판단/);
});

test("Harper's own Role runs read only their Role", async () => {
  const fake = client();
  await readCompanyDecisions(scoped(fake, true));
  assert.equal(fake.eventQuery()!.get("role_id"), `in.(${roleId})`);
});

test("a team member reads only the roles of the team", async () => {
  const fake = client({ authority: "admin", access_scope: "team", team_id: teamId, company_workspace_team_members: [{ team_id: teamId }] });
  await readCompanyDecisions({ admin: fake.admin as any, user: { id: "m", email: "member@example.test" } as User, workspaceId });
  assert.equal(fake.eventQuery()!.get("role_id"), `in.(${roleId})`);
});

test("a long page stops by size and hands back the next offset", async () => {
  const long = Array.from({ length: 30 }, (_, i) => ({ ...events[1], id: 100 - i, reason_text: "x".repeat(2000) }));
  const read = await readCompanyDecisions({ admin: client(owner, long).admin as any, user: { id: "m", email: "m@example.test" } as User, workspaceId, input: { limit: 30 } });
  assert.ok(read.items.length < 30);
  assert.equal(read.nextOffset, read.items.length);
});

test("only a run without company memory counts as correspondence", () => {
  const fake = client();
  assert.equal(companyAgentIsCorrespondence(fake.admin), false);
  assert.equal(companyAgentIsCorrespondence(scoped(fake, true).admin), false);
  assert.equal(companyAgentIsCorrespondence(scoped(fake, false).admin), true);
});
