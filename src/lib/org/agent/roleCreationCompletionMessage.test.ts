import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoleCreationCompletionMessage,
  splitRoleCreationCompletionSentences,
} from "@/lib/org/agent/roleCreationCompletionMessage";

test("builds a scannable completion guide with bold labels and role context", () => {
  const message = buildRoleCreationCompletionMessage({
    companyName: "Harper",
    roleName: "Founding Designer",
    userName: "민지",
  });

  assert.ok(message.split("\n\n").length >= 10);
  assert.doesNotMatch(message, /^#{1,6}\s/m);
  assert.match(message, /\*\*Harper는 이제 이런 인재를 찾아요\*\*/);
  assert.match(message, /\*\*적합도가 높은 인재를 발견하면\*\*/);
  assert.match(message, /\*\*민지님이 해주실 일\*\*/);
  assert.match(message, /\*\*기준이 달라지면 언제든 알려주세요\*\*/);
  assert.match(message, /민지님/);
  assert.match(message, /Harper/);
  assert.match(message, /Founding Designer/);
  assert.match(message, /곧바로 회사에 공유하지 않고/);
  assert.match(message, /임의로 수락이나 거절로 판단하지 않기 때문에/);
});

test("splits completion copy by whole sentences while preserving paragraphs", () => {
  const message = buildRoleCreationCompletionMessage({
    companyName: "Harper",
    roleName: "Founding Designer",
    userName: "민지",
  });
  const chunks = splitRoleCreationCompletionSentences(message);

  assert.ok(chunks.length >= 9);
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

  assert.match(delivered, /Slack 채널에도 역할 등록 완료/);
  assert.match(failed, /Slack 채널에는 등록 완료 안내를 전달하지 못했어요/);
  assert.match(failed, /역할 등록과 후보자 탐색은 정상적으로 시작/);
});

test("keeps Slack completion guidance concise", () => {
  const message = buildRoleCreationCompletionMessage({
    companyName: "Harper",
    roleName: "Founding Designer",
    slackNotificationDelivered: true,
    surface: "slack",
    userName: "민지",
  });

  assert.equal(message.split("\n\n").length, 2);
  assert.match(message, /Founding Designer/);
  assert.match(message, /Slack 채널에도 역할 등록 완료/);
  assert.match(message, /언제든 이 스레드에서 알려 주세요/);
  assert.ok(message.length < 500);
});
