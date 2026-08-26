import assert from "node:assert/strict";
import test from "node:test";
import {
  findNewOrgAgentInternalArtifacts,
  findNewOrgAgentInternalTokens,
  replaceNewOrgAgentInternalTokens,
} from "@/lib/org/agent/responseGuard";

test("detects internal tokens newly introduced by a company-side reply", () => {
  assert.deepEqual(
    findNewOrgAgentInternalTokens({
      reply: "이 후보자는 final_offer 단계입니다.",
      userMessage: "이 후보자 상태가 뭐야?",
    }),
    ["final_offer"]
  );
});

test("does not rewrite a raw token that the user explicitly asked about", () => {
  assert.deepEqual(
    findNewOrgAgentInternalTokens({
      reply: "final_offer는 내부 단계 값입니다.",
      userMessage: "final_offer가 무슨 뜻이야?",
    }),
    []
  );
});

test("detects leaked tool and storage keys", () => {
  assert.deepEqual(
    findNewOrgAgentInternalTokens({
      reply: "update_data로 role_memory를 저장했습니다.",
      userMessage: "이 내용을 기억해줘.",
    }),
    ["update_data", "role_memory"]
  );
});

test("detects catalog keys, raw enums, camel-case parameters, and Slack IDs", () => {
  const slackId = "U0123456789";
  const artifacts = findNewOrgAgentInternalArtifacts({
    reply: `company_description은 paused 상태이며 proposalId와 ${slackId}를 사용합니다.`,
    userMessage: "회사 소개 수정이 왜 멈췄어?",
  });
  assert.equal(artifacts.includes("company_description"), true);
  assert.equal(artifacts.includes("paused"), true);
  assert.equal(artifacts.includes("proposalId"), true);
  assert.equal(artifacts.includes(slackId), true);

  const replaced = replaceNewOrgAgentInternalTokens({
    reply: `company_description은 paused 상태이며 ${slackId}가 담당합니다.`,
    userMessage: "회사 소개 수정이 왜 멈췄어?",
  });
  assert.equal(replaced.includes("company_description"), false);
  assert.equal(replaced.includes("paused"), false);
  assert.equal(replaced.includes(slackId), false);
  assert.match(replaced, /회사 소개/);
  assert.match(replaced, /채용 일시 중지/);
});

test("replaces the deleted lifecycle enum with a user-facing status", () => {
  assert.equal(
    replaceNewOrgAgentInternalTokens({
      reply: "이 역할은 deleted 상태예요.",
      userMessage: "이 역할 삭제됐어?",
    }),
    "이 역할은 삭제됨 상태예요."
  );
});

test("has a deterministic human-language fallback when rewrite fails", () => {
  assert.equal(
    replaceNewOrgAgentInternalTokens({
      reply: "update_data에서 role_memory를 저장했습니다.",
      userMessage: "이 내용을 기억해줘.",
    }),
    "정보 수정 기능에서 포지션 메모를 저장했습니다."
  );
  assert.equal(
    replaceNewOrgAgentInternalTokens({
      reply: "The candidate is at final_offer.",
      userMessage: "What is their status?",
    }),
    "The candidate is at final offer stage."
  );
});

test("detects an unrequested UUID but permits an explicit ID question", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(
    findNewOrgAgentInternalArtifacts({
      reply: `후보 내부 ID는 ${id}입니다.`,
      userMessage: "그 후보가 누구야?",
    }),
    [id]
  );
  assert.deepEqual(
    findNewOrgAgentInternalArtifacts({
      reply: `후보 ID는 ${id}입니다.`,
      userMessage: "후보 ID가 뭐야?",
    }),
    []
  );
  assert.equal(
    replaceNewOrgAgentInternalTokens({
      reply: `후보 내부 ID는 ${id}입니다.`,
      userMessage: "그 후보가 누구야?",
    }),
    "후보 내부 ID는 내부 식별자입니다."
  );
});

test("preserves valid talent and role navigation markers", () => {
  const talentId = "123e4567-e89b-42d3-a456-426614174000";
  const roleId = "223e4567-e89b-42d3-a456-426614174000";
  const reply = `[김호진](talent:${talentId})님을 [Portfolio Lead](role:${roleId}) 포지션에 연결했습니다.`;

  assert.deepEqual(
    findNewOrgAgentInternalArtifacts({
      reply,
      userMessage: "소개 메일을 보내줘.",
    }),
    []
  );
  assert.equal(
    replaceNewOrgAgentInternalTokens({
      reply: `${reply} 현재 상태는 pending_connection입니다.`,
      userMessage: "소개 메일을 보내줘.",
    }),
    `${reply} 현재 상태는 연결 대기입니다.`
  );
});

test("does not treat identifiers inside user-facing HTTP links as leaks", () => {
  const workspaceId = "123e4567-e89b-42d3-a456-426614174000";
  const slackLink = `<https://matchharper.com/org/settings?dialog=interview-availability&orgId=${workspaceId}|스케줄 열기>`;

  assert.deepEqual(
    findNewOrgAgentInternalArtifacts({
      reply: `${slackLink}에서 가능한 시간을 알려주세요.`,
      userMessage: "미팅 잡아줘.",
    }),
    []
  );
  assert.equal(
    replaceNewOrgAgentInternalTokens({
      reply: `${slackLink}에서 가능한 시간을 알려주세요.`,
      userMessage: "미팅 잡아줘.",
    }),
    `${slackLink}에서 가능한 시간을 알려주세요.`
  );
  assert.deepEqual(
    findNewOrgAgentInternalArtifacts({
      reply: `${slackLink}\n내부 ID는 ${workspaceId}입니다.`,
      userMessage: "미팅 잡아줘.",
    }),
    [workspaceId]
  );
});
