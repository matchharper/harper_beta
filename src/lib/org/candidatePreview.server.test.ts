import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as previewContract from "./candidatePreview";
import * as publicProfile from "./publicProfile";
import * as availability from "./companyIntroRoleAvailability";
import * as candidateLinkIntro from "./candidateLinkIntro";
import { OrgHttpError } from "./httpError";
import { projectOrgCandidateDetailForAgent } from "./agent/candidatePreviewRead";
import type { readOrgCandidateDetail } from "./candidatePreview.server";

// These are execution-boundary unit fixtures, not the real-data LLM eval set.
function fixture(options: { blocked?: boolean; testOnly?: boolean; existing?: object; private?: boolean; candidateLink?: boolean } = {}) {
  const reads: Array<{ table: string; columns: string }> = [];
  const role = { role_id: "role", name: "Role", source_type: "internal", status: "active",
    company_internal_roles: {}, information: options.testOnly ? { testOnly: true } : {} };
  const rows: Record<string, unknown> = {
    company_roles: [role], talent_effective_opportunity_recommendations_v1: [],
    // A 후보자 링크 card whose pair read is not available (fetchOrgTalentDetail 404 below).
    company_intro_candidates: options.candidateLink ? [{ id: "card", role_id: "role", role_fingerprint: "share-link:link" }] : [],
    company_workspace: { company_name: "Company", published_name: "Published" },
    talent_setting: { is_onboarding_done: true, profile_visibility: options.private ? "dont_share" : "open_to_matches",
      get_internal_recommendation: !options.private,
      blocked_companies: options.blocked ? ["Company"] : [] },
    talent_users: { user_id: "talent", deleted_at: null, name: "Candidate", bio: "Public bio", headline: "Engineer",
      email: "PRIVATE_EMAIL", memory: "PRIVATE_MEMORY", location: "Seoul", profile_picture: null },
    talent_experiences: [{ company_name: "Employer", role: "Engineer", description: "Public experience", memo: "PRIVATE_MEMO" }],
    talent_educations: [], talent_extras: { content: [{ title: "Public project", description: "Public result", memo: "PRIVATE_MEMO" }] },
  };
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const admin = { rpc(name: string, args: { p_intro_candidate_ids: string[] }) {
    rpcCalls.push({ name, args });
    // company_intro_share_link_consent_v1: the card counts only when the link consent stands.
    return Promise.resolve({ data: options.candidateLink ? args.p_intro_candidate_ids.map(id => ({ intro_candidate_id: id })) : [], error: null });
  }, from(table: string) {
    const chain = {
      select(columns: string) { reads.push({ table, columns }); return chain; },
      eq() { return chain; }, in() { return chain; }, not() { return chain; },
      order() { return chain; }, or() { return chain; }, is() { return chain; },
      maybeSingle() { return Promise.resolve({ data: rows[table], error: null }); },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows[table], error: null }).then(resolve); },
    };
    assert.ok(Object.hasOwn(rows, table), `unexpected table ${table}`);
    return chain;
  } };
  const dependencies: Record<string, unknown> = {
    "@/lib/talentLocation": { resolveTalentLocation: () => "Seoul" },
    "@/lib/server/candidateAccess": { getSupabaseAdmin() { throw Error("injected reader must not use singleton"); } },
    "./publicProfile": publicProfile, "./candidatePreview": previewContract, "./companyIntroRoleAvailability": availability,
    "./candidateLinkIntro": candidateLinkIntro,
    "./httpError": { OrgHttpError }, "./roleVisibility": { isCompanyVisibleRole: () => true },
    "./server": {
      assertOrgWorkspacePermission: async ({ admin: client }: { admin: unknown }) => { assert.equal(client, admin); },
      fetchOrgTalentDetail: async ({ admin: client }: { admin: unknown }) => {
        assert.equal(client, admin);
        if (options.existing) return options.existing;
        throw new OrgHttpError(404, "Talent not found");
      },
    },
    "./teamAccess": { readOrgRoleAccess: async () => ({}), scopeOrgRoleQuery: (query: unknown) => query },
  };
  const module = { exports: {} as { readOrgCandidateDetail: typeof readOrgCandidateDetail } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("./candidatePreview.server.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require(name: string) {
    assert.ok(name in dependencies, `unexpected dependency ${name}`); return dependencies[name];
  } });
  return { reads, rpcCalls, read: (extra: Record<string, unknown> = {}) => module.exports.readOrgCandidateDetail({
    admin, workspaceId: "workspace", roleId: "role", talentId: "talent", user: { id: "actor" }, ...extra,
  } as unknown as Parameters<typeof readOrgCandidateDetail>[0]) };
}

test("existing shared pairs resolve before new-preview eligibility and do not create another pair", async () => {
  const existing = { recommendation: { recommendationId: "existing" } };
  const { read, reads } = fixture({ existing, blocked: true });
  assert.equal(await read(), existing);
  assert.deepEqual(reads, []);
});

test("sharing and test-only boundaries run before any professional profile read", async () => {
  for (const options of [{ blocked: true }, { testOnly: true }]) {
    const { read, reads } = fixture(options);
    await assert.rejects(read(), OrgHttpError);
    assert.ok(!reads.some(item => item.table === "talent_users" && item.columns.includes("headline")));
    assert.ok(!reads.some(item => item.table === "talent_experiences"));
  }
  await assert.rejects(fixture().read({ roleId: "inaccessible-role" }), OrgHttpError);
});

test("an authorized Free preview exposes a professional card without billing or opening RPCs and the agent shares that same projection", async () => {
  const { read, reads } = fixture();
  const detail = await read();
  assert.ok(previewContract.isOrgCandidateProfilePreview(detail));
  assert.equal("recommendation" in detail, false);
  assert.equal(detail.talent.name, "Candidate");
  assert.equal(detail.talent.email, null);
  assert.ok(!JSON.stringify(detail).includes("PRIVATE_"));
  assert.ok(!reads.some(item => item.table.startsWith("talent_") && /email|memory|memo|resume/.test(item.columns)));
  const agentRead = projectOrgCandidateDetailForAgent(detail, true);
  assert.equal(agentRead.profilePreview, true);
  assert.deepEqual(agentRead.positions, []);
  assert.equal(agentRead.profileIncluded, true);
  assert.deepEqual(agentRead.requestHistory, []);
  assert.equal(agentRead.resumeAvailability.available, false);
  assert.equal(agentRead.candidate.email, null);
});

test("a private candidate is previewed only by the company holding their candidate-link consent card", async () => {
  // Matching off, no consent card: hidden as before, and no consent read is made.
  const hidden = fixture({ private: true });
  await assert.rejects(hidden.read(), OrgHttpError);
  assert.deepEqual(hidden.rpcCalls, []);
  // Matching off, consent card from their own link: the same public projection as any preview.
  const linked = fixture({ private: true, candidateLink: true });
  const detail = await linked.read();
  assert.ok(previewContract.isOrgCandidateProfilePreview(detail));
  assert.equal(detail.talent.email, null);
  assert.deepEqual(linked.rpcCalls.map(call => call.name), ["company_intro_share_link_consent_v1"]);
  // A blocked company stays blocked even with the consent card.
  await assert.rejects(fixture({ private: true, candidateLink: true, blocked: true }).read(), OrgHttpError);
});
