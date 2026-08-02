import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPromptDate,
  formatPromptTable,
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

test("organization-agent update results contain only acknowledgement fields", () => {
  const compact = serializeOrgAgentToolResult("update_role", {
    changeSummary: "근무 형태를 remote로 변경",
    role: {
      description: "x".repeat(10_000),
      name: "Backend Engineer",
      roleId: "role-1",
    },
    status: "updated",
  });

  assert.match(compact, /status=updated/);
  assert.match(compact, /role_id=role-1/);
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
  assert.match(compact, /stage=connected/);
  assert.doesNotMatch(compact, /talent-1/);
});

test("organization-agent role results expose whole-pipeline stage counts", () => {
  const compact = serializeOrgAgentToolResult("read_role", {
    availableStages: [],
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
  assert.match(compact, /recommended\t3/);
  assert.match(compact, /saved\t2/);
});
