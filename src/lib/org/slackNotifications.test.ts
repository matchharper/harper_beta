import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrgCandidateAcceptedSlackMessage,
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

  assert.match(message, /새 역할 등록이 완료됐어요/);
  assert.match(message, /후보자의 관심과 연결 의사를 확인/);
  assert.match(message, /Harper 팀의 마지막 확인/);
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

  assert.match(sent, /이전 프로세스 종료를 이미 안내/);
  assert.match(sent, /소개 메일에는 과거 거절이나 종료를 언급하지 않았습니다/);
  assert.match(sent, /직접 솔직하고 배려 있게/);
  assert.match(unsent, /종료 안내는 아직 나가지 않았습니다/);
  assert.match(unsent, /더 이상 발송되지 않도록/);
});
