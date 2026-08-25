import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoleCreationCompletionMessage,
  splitRoleCreationCompletionSentences,
} from "@/lib/org/agent/roleCreationCompletionMessage";

test("builds a detailed matching-start guide with role context and expectations", () => {
  const message = buildRoleCreationCompletionMessage({
    companyName: "Harper",
    roleName: "Founding Designer",
    userName: "민지",
  });

  assert.ok(message.split("\n\n").length >= 7);
  assert.doesNotMatch(message, /^#{1,6}\s/m);
  assert.match(
    message,
    /지금부터 Harper의 \*\*Founding Designer\*\* 역할의 매칭을 시작합니다/
  );
  assert.match(message, /🔥 앞으로 Harper가 해당 역할의 기준과 팀의 선호도/);
  assert.match(message, /Harper 인재풀을 검토하고/);
  assert.match(message, /후보자에게 먼저 확인해요/);
  assert.match(message, /Inbox의 연결 대기 후보자/);
  assert.match(message, /Harper와 역할을 충분히 소개하고/);
  assert.match(message, /천천히 정말 적합한 분들만을 연결/);
  assert.match(message, /연결을 수락하거나 거절/);
  assert.doesNotMatch(message, /Connect|Reject/);
  assert.match(message, /종료 결정이 후보자에게 안내돼요/);
  assert.match(message, /자세히 알려주실수록 다음 매칭에 더 정확하게 반영/);
  assert.match(message, /기준이 달라진다면 편하게 알려주세요/);
  assert.match(message, /감사합니다\.$/);
});

test("splits completion copy by whole sentences while preserving paragraphs", () => {
  const message = buildRoleCreationCompletionMessage({
    companyName: "Harper",
    roleName: "Founding Designer",
    userName: "민지",
  });
  const chunks = splitRoleCreationCompletionSentences(message);

  assert.ok(chunks.length >= 5);
  assert.equal(chunks.join(""), message);
  assert.ok(chunks.some((chunk) => chunk.endsWith("\n\n")));
});

test("states whether the selected Slack channel received completion guidance", () => {
  const delivered = buildRoleCreationCompletionMessage({
    companyName: "Harper",
    roleName: "Founding Designer",
    slackNotificationDelivered: true,
    userName: "민지",
  });
  const failed = buildRoleCreationCompletionMessage({
    companyName: "Harper",
    roleName: "Founding Designer",
    slackNotificationDelivered: false,
    userName: "민지",
  });

  assert.match(delivered, /Slack 채널에도 역할 등록과 후보자 탐색 시작/);
  assert.match(failed, /Slack에는 등록 안내를 보내지 못했어요/);
  assert.match(failed, /역할 등록과 후보자 탐색은 정상적으로 시작/);
});

test("keeps the full matching-start explanation on Slack", () => {
  const message = buildRoleCreationCompletionMessage({
    companyName: "Harper",
    roleName: "Founding Designer",
    slackNotificationDelivered: true,
    surface: "slack",
    userName: "민지",
  });

  assert.ok(message.split("\n\n").length >= 7);
  assert.match(message, /Founding Designer/);
  assert.match(message, /Slack 채널에도 역할 등록과 후보자 탐색 시작/);
  assert.match(message, /천천히 정말 적합한 분들만을 연결/);
  assert.match(message, /감사합니다\.$/);
});
