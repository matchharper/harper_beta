import assert from "node:assert/strict";
import test from "node:test";
import { buildHarperSlackAccessDeniedMessage } from "./slackMemberAccessPolicy";

test("guides a non-member to request a Harper workspace invitation", () => {
  const message = buildHarperSlackAccessDeniedMessage({
    email: "guest@example.com",
    reason: "not_member",
    workspaceName: "테스트 회사",
  });

  assert.match(message, /Harper Workspace 접근 권한이 없습니다/);
  assert.match(message, /guest@example\.com/);
  assert.match(message, /“테스트 회사”/);
  assert.match(message, /초대를 요청한 뒤 다시 시도/);
});

test("tells an invited Slack user to finish the pending signup", () => {
  const message = buildHarperSlackAccessDeniedMessage({
    email: "invited@example.com",
    hasPendingInvitation: true,
    reason: "not_member",
    workspaceName: "테스트 회사",
  });

  assert.match(message, /가입이 필요합니다/);
  assert.match(message, /초대가 발송되어 있습니다/);
  assert.match(message, /가입을 완료한 뒤 다시 시도/);
});

test("fails closed with useful guidance when Slack email is unavailable", () => {
  const message = buildHarperSlackAccessDeniedMessage({
    reason: "email_unavailable",
    workspaceName: "테스트 회사",
  });

  assert.match(message, /권한을 확인하지 못했습니다/);
  assert.match(message, /Slack 계정의 이메일을 확인할 수 없어/);
});

test("directs viewers to request an Admin or Owner role", () => {
  const message = buildHarperSlackAccessDeniedMessage({
    email: "viewer@example.com",
    reason: "insufficient_role",
    workspaceName: "테스트 회사",
  });

  assert.match(message, /Viewer/);
  assert.match(message, /Owner 또는 Admin/);
});

test("escapes Slack control characters in account details", () => {
  const message = buildHarperSlackAccessDeniedMessage({
    email: "user<test>@example.com",
    reason: "not_member",
    workspaceName: "A&B <Team>",
  });

  assert.doesNotMatch(message, /<test>/);
  assert.match(message, /A&amp;B &lt;Team&gt;/);
});
