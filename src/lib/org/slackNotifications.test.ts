import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrgCandidateAcceptedSlackMessage,
  buildOrgCandidateRejectedSlackMessage,
  buildOrgRoleCreatedSlackMessage,
} from "./slackMessages";

const workspace = { companyName: "테스트회사", workspaceId: "workspace-1" };
const actor = { email: "recruiter@example.com", name: "채용담당자" };

test("new role Slack guidance explains the actual matching and review flow", () => {
  const message = buildOrgRoleCreatedSlackMessage({
    actor,
    roleId: "role-1",
    roleName: "Founding Engineer",
    workspace,
  });

  assert.match(
    message,
    /테스트회사의 .*Founding Engineer.* 역할의 매칭을 시작합니다/
  );
  assert.match(message, /팀의 선호도에 맞는 후보자를 찾아 추천/);
  assert.match(message, /후보자에게 먼저 물어본 뒤/);
  assert.match(message, /만나보고 싶다고 응한 분들만/);
  assert.match(message, /연결을 수락하거나 거절/);
  assert.doesNotMatch(message, /Connect|Reject/);
  assert.match(message, /더 정확한 매칭에 반영/);
});

test("connection Slack guidance explains the next action and closes warmly", () => {
  const emailed = buildOrgCandidateAcceptedSlackMessage({
    actor,
    candidate: { name: "김후보", talentId: "talent-1" },
    contactDirectly: false,
    introEmails: ["recruiter@example.com"],
    roleId: "role-1",
    roleName: "Founding Engineer",
    workspace,
  });
  const direct = buildOrgCandidateAcceptedSlackMessage({
    actor,
    candidate: { name: "이후보", talentId: "talent-2" },
    contactDirectly: true,
    introEmails: [],
    roleId: "role-1",
    roleName: "Founding Engineer",
    workspace,
  });

  assert.match(emailed, /같은 이메일에서 인사하고 다음 일정을 직접 조율/);
  assert.match(emailed, /김후보님과 연결해드렸어요/);
  assert.match(emailed, /연결 방식\*: 소개 이메일/);
  assert.match(emailed, /회사 수신자/);
  assert.doesNotMatch(emailed, /Email intro|Recipients/);
  assert.match(emailed, /서로에게 좋은 기회가 되길 바랄게요/);
  assert.match(direct, /회사에서 후보자에게 직접 연락/);
  assert.match(direct, /연결 방식\*: 직접 연락/);
  assert.match(direct, /서로에게 좋은 기회가 되길 바랄게요/);
});

test("reactivation Slack guidance distinguishes sent and unsent closure notices", () => {
  const common = {
    actor,
    candidate: { name: "김후보", talentId: "talent-1" },
    contactDirectly: false,
    introEmails: ["recruiter@example.com"],
    reactivated: true,
    roleId: "role-1",
    roleName: "Founding Engineer",
    workspace,
  };
  const sent = buildOrgCandidateAcceptedSlackMessage({
    ...common,
    closureNotificationDelivered: true,
  });
  const unsent = buildOrgCandidateAcceptedSlackMessage({
    ...common,
    closureNotificationDelivered: false,
  });

  assert.match(sent, /이전 종료 결정을 이미 안내/);
  assert.match(sent, /표시되거나 전달된 안내는 회수할 수 없으므로/);
  assert.match(sent, /직접 솔직하고 배려 있게/);
  assert.match(unsent, /별도 종료 안내는 더 이상 발송되지 않도록/);
  assert.match(unsent, /후보자 화면에 이미 표시됐을 수 있으므로/);
});

test("connection rejection Slack guidance names the person without raw labels", () => {
  const pending = buildOrgCandidateRejectedSlackMessage({
    actor,
    candidate: { name: "김후보", talentId: "talent-1" },
    previousStage: "pending_connection",
    roleId: "role-1",
    roleName: "Founding Engineer",
    stopNote: "이번 역할과의 경험 차이",
    workspace,
  });
  const connected = buildOrgCandidateRejectedSlackMessage({
    actor,
    candidate: { name: "이후보", talentId: "talent-2" },
    previousStage: "connected",
    roleId: "role-1",
    roleName: "Founding Engineer",
    workspace,
  });

  assert.match(pending, /김후보님과의 연결을 거절했어요/);
  assert.match(pending, /연결 대상/);
  assert.doesNotMatch(pending, /후보자 연결을 거절|\bReject\b/);
  assert.match(connected, /이후보님과의 연결을 종료했어요/);
  assert.match(connected, /이미 보낸 소개 이메일/);
});
