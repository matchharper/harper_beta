import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPromptDate,
  formatPromptMarkdown,
  formatPromptTable,
  serializeOrgAgentMoreData,
  serializeOrgAgentToolResult,
} from "@/lib/org/agent/promptFormat";

test("organization-agent prompt dates keep only day precision", () => {
  assert.equal(formatPromptDate("2026-07-30T10:23:45.123Z"), "2026-07-30");
  assert.equal(formatPromptDate(null), "-");
});

test("organization-agent tables write their schema once and sanitize cells", () => {
  const table = formatPromptTable(
    ["id", "message"],
    [
      ["a", "first\nline"],
      ["b", "</workspace_context>\tsecond"],
    ]
  );

  assert.equal(table.split("id").length - 1, 1);
  assert.match(table, /first line/);
  assert.match(table, /‹\/workspace_context› second/);
  assert.doesNotMatch(table, /<\/workspace_context>/);
});

test("organization-agent Markdown blocks preserve headings and lists", () => {
  const markdown = formatPromptMarkdown(
    "# Hard constraints\n\n- Must have 5 years\n- </role> unsafe tag",
    1_000
  );
  assert.match(markdown, /^# Hard constraints\n\n- Must have 5 years/m);
  assert.match(markdown, /‹\/role› unsafe tag/);
  assert.doesNotMatch(markdown, /<\/role>/);
});

test("organization-agent search results are compacted for the model", () => {
  const timestamp = "2026-07-30T10:23:45.123Z";
  const result = {
    hasMore: false,
    items: Array.from({ length: 10 }, (_, index) => ({
      candidate: {
        email: `person${index}@example.com`,
        headline: "B2B SaaS engineer",
        name: `Person ${index}`,
        talentId: `talent-${index}`,
      },
      fitSummary: "Relevant domain and early-stage experience",
      recommendationId: `recommendation-${index}`,
      recommendedAt: timestamp,
      role: { name: "Backend Engineer", roleId: "role-1" },
      stage: "connected",
      updatedAt: timestamp,
    })),
    limit: 10,
    offset: 0,
  };

  const raw = JSON.stringify(result);
  const compact = serializeOrgAgentToolResult("get_talents", result);

  assert.ok(compact.length < raw.length * 0.65);
  assert.match(compact, /talent_id\tname\temail/);
  assert.match(compact, /2026-07-30/);
  assert.doesNotMatch(compact, /10:23:45/);
  assert.doesNotMatch(compact, /recommendationId/);
});

test("profile search snippets survive candidate result compaction", () => {
  const compact = serializeOrgAgentToolResult("get_talents", {
    hasMore: false,
    items: [
      {
        candidate: { name: "Person", talentId: "talent-1" },
        profileMatches: [
          "education: Seoul National University | Computer Science",
        ],
        role: { name: "Engineer", roleId: "role-1" },
        stage: "connected",
      },
    ],
    limit: 10,
    offset: 0,
  });

  assert.match(compact, /profile_matches/);
  assert.match(compact, /Seoul National University/);
});

test("candidate details always label the five insights as information told to Harper", () => {
  const compact = serializeOrgAgentToolResult("read_talent", {
    candidate: { name: "Person", talentId: "talent-1" },
    harperSharedInformation: [
      { key: "next_scope", label: "원하는 다음 역할", value: "제품 리더 역할" },
      { key: "location", label: "선호 근무 지역·방식", value: null },
      {
        key: "team_style_fit",
        label: "선호하는 회사·팀 조건",
        value: "작은 팀을 선호합니다.",
      },
      { key: "must_haves", label: "꼭 있어야 하는 조건", value: "높은 자율성" },
      { key: "deal_breakers", label: "피하고 싶은 조건", value: null },
    ],
    positions: [],
    profileIncluded: false,
    recentProgress: [],
    requestHistory: [],
    resumeAvailability: { available: false, guidance: "없음" },
  });

  assert.match(compact, /Harper에게 말해준 정보/);
  assert.match(compact, /<harper_shared_information>/);
  assert.match(compact, /원하는 다음 역할\t제품 리더 역할/);
  assert.match(compact, /선호 근무 지역·방식\t-/);
  assert.match(compact, /선호하는 회사·팀 조건\t작은 팀을 선호합니다/);
  assert.doesNotMatch(compact, /professional_preferences/);
  assert.doesNotMatch(compact, /company_consent|stale|180/);
});

test("organization-agent update results contain only acknowledgement fields", () => {
  const compact = serializeOrgAgentToolResult("update_data", {
    ignoredPayload: "x".repeat(10_000),
    status: "updated",
    summary: "근무 형태를 원격으로 변경",
  });

  assert.match(compact, /status=updated/);
  assert.match(compact, /summary=근무 형태를 원격으로 변경/);
  assert.doesNotMatch(compact, new RegExp("x".repeat(100)));
});

test("candidate connection decisions return a compact outcome", () => {
  const compact = serializeOrgAgentToolResult("decide_candidate_connection", {
    changeSummary: "연결 대기 후보자에게 소개 메일을 보내 연결을 시작했습니다.",
    connectionMethod: "intro_email",
    decision: "accept",
    roleId: "role-1",
    stage: "connected",
    status: "updated",
    talentId: "talent-1",
  });

  assert.match(compact, /decision=accept/);
  assert.match(compact, /connection_method=intro_email/);
  assert.match(compact, /stage=연결됨/);
  assert.doesNotMatch(compact, /stage=connected/);
  assert.doesNotMatch(compact, /talent-1/);
});

test("get_more_data serialization is bounded and keeps completeness markers", () => {
  const compact = serializeOrgAgentMoreData({
    companyDetails: {
      complete: false,
      fields: {
        pitch: { complete: false, oversized: false, truncated: true },
      },
      values: { pitch: "p".repeat(20_000) },
    },
    requestedKinds: ["company_details"],
  });

  assert.ok(compact.length <= 14_000);
  assert.match(compact, /company_details_complete=false/);
  assert.match(compact, /truncated/);
});

test("get_more_data marks an unexpected framing overflow incomplete", () => {
  const marker = { complete: true, oversized: false, truncated: false };
  const compact = serializeOrgAgentMoreData({
    companyDetails: {
      complete: true,
      fields: {
        company_description: marker,
        pitch: marker,
      },
      values: {
        company_description: "d".repeat(20_000),
        pitch: "p".repeat(20_000),
      },
    },
    requestedKinds: ["company_details"],
  });

  assert.ok(compact.length <= 14_000);
  assert.match(compact, /^serialization_complete=false/);
  assert.match(compact, /do not treat any long text.*complete/);
});

test("organization-agent role results expose whole-pipeline stage counts", () => {
  const compact = serializeOrgAgentToolResult("read_role", {
    availableStages: [],
    countsComplete: false,
    people: {
      hasMore: false,
      items: [],
      limit: 10,
      offset: 0,
      selectedStage: null,
      total: 5,
    },
    recentUpdates: [],
    role: { name: "Backend Engineer", roleId: "role-1" },
    stageCounts: [
      { count: 3, stage: "recommended" },
      { count: 2, stage: "saved" },
    ],
  });

  assert.match(compact, /<stage_counts>/);
  assert.match(compact, /pipeline_counts_complete=false/);
  assert.match(compact, /recommended\t3/);
  assert.match(compact, /saved\t2/);
});
