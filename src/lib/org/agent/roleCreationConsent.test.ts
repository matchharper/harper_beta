import assert from "node:assert/strict";
import test from "node:test";
import { validateRoleCreationNotificationConsent } from "@/lib/org/agent/roleCreationConsent";

const channel = {
  aliases: ["#채용", "C123"],
  id: "channel:C123",
  label: "채용",
};
const assignee = {
  aliases: ["minsu@example.com", "U123"],
  id: "assignee:U123",
  label: "김민수",
};

test("accepts a clear yes only for targets named in the previous proposal", () => {
  assert.deepEqual(
    validateRoleCreationNotificationConsent({
      previousAssistantMessage:
        "#채용 채널을 연결하고 김민수님을 담당자로 등록할까요?",
      targets: [channel, assignee],
      userMessage: "네, 그렇게 해주세요",
    }),
    { missingTargetIds: [], ok: true }
  );
});

test("accepts targets explicitly selected in the current user turn", () => {
  assert.equal(
    validateRoleCreationNotificationConsent({
      previousAssistantMessage: "어디로 연결할까요?",
      targets: [channel, assignee],
      userMessage: "채용 채널이랑 김민수님으로 해주세요",
    }).ok,
    true
  );
});

test("accepts a shorthand only when the preceding proposal names the target", () => {
  assert.equal(
    validateRoleCreationNotificationConsent({
      previousAssistantMessage: "#채용 채널에 연결할까요?",
      targets: [channel],
      userMessage: "그 채널로 해주세요",
    }).ok,
    true
  );
});

test("rejects an unrelated yes and a target absent from the proposal", () => {
  assert.deepEqual(
    validateRoleCreationNotificationConsent({
      previousAssistantMessage: "근무 방식은 하이브리드로 할까요?",
      targets: [channel],
      userMessage: "네",
    }),
    { missingTargetIds: ["channel:C123"], ok: false }
  );
  assert.deepEqual(
    validateRoleCreationNotificationConsent({
      previousAssistantMessage: "채용 채널을 연결할까요?",
      targets: [channel, assignee],
      userMessage: "아니요",
    }).missingTargetIds,
    ["channel:C123", "assignee:U123"]
  );
});
