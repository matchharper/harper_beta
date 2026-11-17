import assert from "node:assert/strict";
import test from "node:test";
import { GTM_WORKSPACE_ID } from "../constants";
import { exclusionReason, type ExclusionFacts } from "./people";
import {
  agentRoleTarget, companySideConflict, nextRoleSource, readRoleRunParams, roleRunParams, sumCounts, type AgentRoleRow,
} from "./role";

const customerRoleId = "11111111-1111-4111-8111-111111111111";
const copyId = "22222222-2222-4222-8222-222222222222";
const gtmOnlyId = "33333333-3333-4333-8333-333333333333";
const customerWorkspace = "44444444-4444-4444-8444-444444444444";

const copy: AgentRoleRow = {
  roleId: copyId, workspaceId: GTM_WORKSPACE_ID,
  information: { purpose: "gtm_outreach", gtm: { source: "customer_role", sourceRoleId: customerRoleId.toUpperCase() } },
};

test("a customer Role always means the real Role; its GTM copy only searches", () => {
  // Picked as the GTM copy ("저장한 Role 이어서"): the records still name the customer's Role.
  assert.deepEqual(agentRoleTarget(copy), { mailRoleId: customerRoleId, searchRoleId: copyId, customer: true });
  // Picked as the customer Role, with or without a copy.
  const customer: AgentRoleRow = { roleId: customerRoleId, workspaceId: customerWorkspace, information: {} };
  assert.deepEqual(agentRoleTarget(customer, { roleId: copyId }), { mailRoleId: customerRoleId, searchRoleId: copyId, customer: true });
  assert.deepEqual(agentRoleTarget(customer, null), { mailRoleId: customerRoleId, searchRoleId: null, customer: true });
  // A GTM Role from a URL or a pasted JD is its own Role.
  const own: AgentRoleRow = { roleId: gtmOnlyId, workspaceId: GTM_WORKSPACE_ID, information: { purpose: "gtm_outreach", gtm: { source: "url", sourceRoleId: null } } };
  assert.deepEqual(agentRoleTarget(own), { mailRoleId: gtmOnlyId, searchRoleId: gtmOnlyId, customer: false });
  // A sourceRoleId without source customer_role, or a Role that only claims the purpose outside the GTM workspace, maps nothing.
  const odd: AgentRoleRow = { roleId: gtmOnlyId, workspaceId: GTM_WORKSPACE_ID, information: { purpose: "gtm_outreach", gtm: { source: "text", sourceRoleId: customerRoleId } } };
  assert.equal(agentRoleTarget(odd).mailRoleId, gtmOnlyId);
  const elsewhere: AgentRoleRow = { roleId: gtmOnlyId, workspaceId: customerWorkspace, information: copy.information };
  assert.deepEqual(agentRoleTarget(elsewhere), { mailRoleId: gtmOnlyId, searchRoleId: null, customer: true });
});

test("run settings: defaults, limits, and no external search without a GTM Role", () => {
  const params = roleRunParams({
    searchRoleId: copyId,
    sources: { member: { enabled: true, max: 500 }, scraped: { enabled: true, max: -3 }, external: { enabled: true } },
    keywords: [" backend ", "x", "backend", "결제"], draftOnly: true,
  });
  assert.deepEqual(params.sources, {
    member: { enabled: true, max: 50 }, scraped: { enabled: false, max: 0 }, external: { enabled: true, max: 5 },
  });
  assert.deepEqual(params.keywords, ["backend", "결제"]);
  assert.equal(params.draftOnly, true);
  assert.equal(params.language, "ko");
  assert.equal(roleRunParams({ searchRoleId: null, sources: { external: { enabled: true, max: 3 } } }).sources.external.enabled, false);
  const stored = readRoleRunParams({ ...params, state: { external: { phase: "lookups", lookups: ["a"] } } });
  assert.deepEqual(stored.state.external, { phase: "lookups", lookups: ["a"] });
  assert.equal(stored.sources.member.max, 50);
});

test("one source per tick, external last until its lookups settle", () => {
  const params = roleRunParams({ searchRoleId: copyId, sources: { member: { enabled: true }, scraped: { enabled: true }, external: { enabled: true } } });
  assert.equal(nextRoleSource(params, {}), "member");
  assert.equal(nextRoleSource(params, { searched_member: 1 }), "scraped");
  assert.equal(nextRoleSource(params, { searched_member: 1, searched_scraped: 1 }), "external");
  assert.equal(nextRoleSource({ ...params, state: { external: { phase: "lookups" } } }, { searched_member: 1, searched_scraped: 1 }), "external");
  assert.equal(nextRoleSource({ ...params, state: { external: { phase: "done" } } }, { searched_member: 1, searched_scraped: 1 }), null);
});

test("one person, one path: the company already has them for the same Role", () => {
  const rows = [
    { kind: "shown" as const, linkedinUrl: "https://www.linkedin.com/in/Jane-Doe/", emails: [null] },
    { kind: "intro" as const, linkedinUrl: null, emails: ["Kim@Gmail.com"] },
  ];
  assert.equal(companySideConflict({ email: null, profileUrl: "linkedin.com/in/jane-doe" }, rows), "shown");
  assert.equal(companySideConflict({ email: "kim@gmail.com", profileUrl: null }, rows), "intro");
  assert.equal(companySideConflict({ email: "lee@gmail.com", profileUrl: "https://linkedin.com/in/lee" }, rows), null);
  assert.equal(companySideConflict({ email: null, profileUrl: null }, rows), null);
});

test("a Role run contacts members and needs no recent post, but keeps every other rule", () => {
  const now = new Date("2026-11-17T03:00:00Z");
  const facts: ExclusionFacts = {
    source: "role", email: "a@gmail.com", signalAt: null, isMember: true, isSuppressed: false, isInternal: false,
    lastMailedAt: null, lastEndedAt: null, seenInRun: false,
  };
  assert.equal(exclusionReason(facts, now, 90), null);
  assert.equal(exclusionReason({ ...facts, companyHasPerson: true }, now, 90), "company_intro");
  assert.equal(exclusionReason({ ...facts, lastMailedAt: "2026-11-10T00:00:00Z" }, now, 90), "recent_contact");
  assert.equal(exclusionReason({ ...facts, isSuppressed: true }, now, 90), "suppressed");
  assert.equal(exclusionReason({ ...facts, source: "opentowork", signalAt: "2026-11-16T00:00:00Z" }, now, 90), "member");
});

test("a run's counts add up over its ticks", () => {
  assert.deepEqual(sumCounts({ found: 6, searched_member: 1, external_cost: 0.12 }, { found: 1, excluded: 1, external_cost: 0.24 }),
    { found: 7, searched_member: 1, external_cost: 0.36, excluded: 1 });
});
