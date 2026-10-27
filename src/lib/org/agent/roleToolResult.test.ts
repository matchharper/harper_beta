import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { formatRoleCalibrationToolResult, formatRoleCreationToolResult } from "./roleToolResult";
import { serializeOrgAgentToolResult } from "./promptFormat";
import { serializeToolResultForModel } from "@/lib/llm/toolError";
import { buildOrgAgentRollingToolContext } from "./toolResultBudget";

const criteria = [
  { name: "Distributed systems implementation and operation", fitness: "excellent" },
  { name: "Cross-functional product ownership", fitness: "uncertain" },
];
const capabilities = { contactCandidate: false, requestIntro: true, viewResume: false };
const profile = {
  location: "Example City", bio: "Biography first paragraph\n\nBiography second paragraph",
  experiences: [{ company_name: "Source Company", role: "Research Engineer", start_date: "2024-01-01", end_date: null, description: "Full work evidence\n\n" + "details ".repeat(6000) + "WORK_END" }],
  education: [{ school: "Source University", degree: "PhD", field: "Computer Science", description: "EDUCATION_END" }],
  extras: [{ title: "Paper", date: "2025", description: "EXTRA_END" }],
  resumeText: "PRIVATE_RESUME_TEXT",
};

test("pipeline criteria and action permissions survive without column truncation", () => {
  const result = serializeOrgAgentToolResult("read_role", {
    role: { roleId: "role-a", name: "Engineer", criteria: criteria.map(item => ({ name: item.name, criteria: `Definition for ${item.fitness}` })) },
    fieldCompleteness: { role_criteria: { included: true, complete: true } }, people: { offset: 20, limit: 2, hasMore: true, total: 25,
      items: ["one", "two"].map(talentId => ({ talentId, name: talentId, currentStageId: "custom:stage-long-id", currentStageLabel: "Technical discussion", criteriaEvaluations: criteria, capabilities })) },
  });
  assert.equal(result.split(criteria[0].name).length - 1, 1);
  assert.ok(result.includes("Definition for excellent"));
  assert.ok(result.includes("criteria1: excellent"));
  assert.ok(result.includes("criteria2: uncertain"));
  assert.ok(result.includes("가능: Intro 요청; 불가: 연락, 이력서 조회"));
  assert.ok(result.includes('"stageId":"custom:stage-long-id"'));
  assert.match(result, /offset=20 limit=2 has_more=true total=25/);
  assert.doesNotMatch(result, /contactCandidate|…/);
});

test("candidate batch shares definitions and notes without merging criteria from different Roles", () => {
  const items = ["one", "two"].map(talentId => ({
    candidate: { talentId, name: talentId }, responseGuide: "Only company-shared facts are included.",
    positions: [{ roleId: "role-a", criteriaEvaluations: criteria, capabilities }, { roleId: "role-b", criteriaEvaluations: criteria, capabilities }],
    recentProgress: [], requestHistory: [], meetingHistory: null, harperSharedInformation: null,
  }));
  const before = structuredClone(items);
  const result = serializeOrgAgentToolResult("read_talent", { items, notFoundTalentIds: ["missing"], requestedCount: 3 });
  assert.deepEqual(items, before);
  assert.equal(result.split(criteria[0].name).length - 1, 2, "one definition per Role, not per person");
  assert.equal(result.split("Only company-shared facts are included.").length - 1, 1);
  assert.equal(result.split("가능: Intro 요청; 불가: 연락, 이력서 조회").length - 1, 1);
  assert.match(result, /criteria3: excellent/);
  assert.match(result, /contacts=0; meetings=not_included/);
  assert.match(result, /not_found_count=1/);
  assert.match(result, /missing/);
  assert.doesNotMatch(result, /<company_contact_history>|<meeting_coordination>|항목 0/);
});

test("limited evidence, conflicting evidence and pending reevaluation keep distinct meanings", () => {
  const result = serializeOrgAgentToolResult("get_talents", { items: [{ candidate: { talentId: "one" }, role: { roleId: "role" }, criteriaEvaluations: [
    { name: "Research", fitness: "limited" }, { name: "Location", fitness: "conflict" }, { name: "Ownership", fitness: "uncertain", pending: true },
  ] }] });
  assert.match(result, /criteria1: limited/);
  assert.match(result, /criteria2: conflict/);
  assert.match(result, /criteria3: uncertain \(재평가 중\)/);
  assert.match(result, /limited=근거 제한; conflict=조건 상충/);
});

test("calibration and ordinary reader preserve the complete professional source", () => {
  const raw = { items: [{ candidate: { talentId: "person", name: "Person", email: "private@example.com" }, profileIncluded: true, profile,
    positions: [{ roleId: "role-a", stage: "company_intro", criteriaEvaluations: criteria, capabilities }],
    scheduledFollowups: { items: [{ followupId: "UNRELATED_FOLLOWUP" }] }, responseGuide: "COMPANY_EXECUTION_GUIDE",
  }], notFoundTalentIds: ["missing"], requestedCount: 2 };
  const before = structuredClone(raw);
  const calibration = serializeToolResultForModel(raw, value => formatRoleCalibrationToolResult("read_talent", value));
  const ordinary = serializeOrgAgentToolResult("read_talent", raw);
  for (const result of [calibration, ordinary]) {
    assert.ok(result.includes(profile.bio));
    assert.ok(result.includes(profile.experiences[0].description));
    assert.match(result, /EDUCATION_END/);
    assert.match(result, /EXTRA_END/);
    assert.match(result, /Research Engineer at Source Company : 2024-01-01 - -/);
    assert.match(result, /missing/);
    assert.doesNotMatch(result, /PRIVATE_RESUME_TEXT|private@example.com/);
  }
  assert.doesNotMatch(calibration, /UNRELATED_FOLLOWUP|COMPANY_EXECUTION_GUIDE|criteria1|access1|<positions>/);
  assert.deepEqual(raw, before);
  const rolling = buildOrgAgentRollingToolContext({ messages: [
    { role: "tool", name: "read_talent", tool_call_id: "old", content: ordinary },
    { role: "tool", name: "get_talents", tool_call_id: "new", content: "status=ok" },
  ], compactableResultIndexes: new Set([0]), targetChars: 1000 });
  assert.match(rolling.messages[0].content!, /Research Engineer at Source Company/);
  assert.match(rolling.messages[0].content!, /criteria1: excellent/);
  assert.doesNotMatch(rolling.messages[0].content!, /WORK_END/);
});

test("Role creation web results contain the full body once without storage/cache duplication", () => {
  const markdown = "# External source\n\n" + "source ".repeat(7000) + "SOURCE_END";
  const raw = { ok: true, url: "https://example.com/source", resolvedUrl: "https://example.com/source", title: "Source", markdown,
    excerpt: "DUPLICATE_EXCERPT", cached: false, createdAt: "2026-10-26T00:00:00Z", documentId: "INTERNAL_CACHE_ID", markdownCharCount: markdown.length, truncated: true };
  const result = formatRoleCreationToolResult("open_url", raw);
  assert.ok(result.includes(markdown));
  assert.equal(result.split("SOURCE_END").length - 1, 1);
  assert.match(result, /content_truncated/);
  assert.doesNotMatch(result, /DUPLICATE_EXCERPT|INTERNAL_CACHE_ID|cached|createdAt/);
  assert.equal(result, serializeOrgAgentToolResult("open_url", raw));
  const batch = formatRoleCalibrationToolResult("open_url", { pages: [{ label: "Source", url: raw.url, content: markdown, truncated: true }], failed: [{ url: "https://example.com/failed", error: "source timeout" }] });
  assert.ok(batch.includes(markdown));
  assert.match(batch, /opened_count=1 failed_count=1/);
  assert.match(batch, /https:\/\/example.com\/failed/);
  assert.match(batch, /source timeout/);
  for (const formatter of [formatRoleCreationToolResult, formatRoleCalibrationToolResult]) {
    const failure = formatter("open_url", { ok: false, error: "source timeout" });
    assert.match(failure, /source timeout/);
    assert.doesNotMatch(failure, /status=ok/);
  }
});

test("stored followups retain exact revision, schedule and delivery facts", () => {
  const result = serializeOrgAgentToolResult("read_talent", { candidate: { talentId: "person" }, scheduledFollowups: {
    limit: 1, offset: 2, hasMore: true, items: [{ contactRef: "followup:exact-id", expectedRevision: 9, sourceContactRef: "contact:source", roleId: "role-a", state: "후속 연락 예정",
      scheduledAt: "2026-10-28T00:00:00Z", availableActions: ["cancel_followup"], channels: [{ channel: "email", status: "sent", sentAt: "2026-10-27T00:00:00Z" }] }],
  } });
  assert.match(result, /followup:exact-id\t9\tcontact:source/);
  assert.match(result, /2026-10-28 09:00/);
  assert.match(result, /email: sent \(2026-10-27 09:00\)/);
  assert.match(result, /cancel_followup/);
  assert.match(result, /offset=2 limit=1 has_more=true/);
  const unavailable = serializeOrgAgentToolResult("read_talent", { candidate: { talentId: "person" }, scheduledFollowups: { available: false } });
  assert.match(unavailable, /followups_available=false/);
  assert.doesNotMatch(unavailable, /followups_page:/);
});

test("both production loops use the purpose-specific tool result renderers", () => {
  for (const [path, formatter] of [["roleCreationChat.ts", "formatRoleCreationToolResult"], ["roleCalibration.ts", "formatRoleCalibrationToolResult"]]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.ok(source.includes(`value => ${formatter}(call.function.name, value)`));
  }
});
