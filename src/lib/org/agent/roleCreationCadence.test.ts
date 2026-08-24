import assert from "node:assert/strict";
import test from "node:test";
import { shouldAttachRoleCreationConfirmation } from "@/lib/org/agent/roleCreationCadence";

test("attaches confirmation to an explicit final Slack setup after notification save", () => {
  assert.equal(
    shouldAttachRoleCreationConfirmation({
      assistantText: "*마지막 설정*\n\n• Slack은 `#test`로 연결할게요.",
      confirmationRequested: false,
      notificationSaved: true,
      roleWasDraft: true,
      surface: "slack",
    }),
    true
  );
});

test("does not force confirmation during ordinary discovery or editing", () => {
  const base = {
    assistantText: "팀에서 중요하게 보는 기준을 하나 더 알려주세요.",
    confirmationRequested: false,
    notificationSaved: true,
    roleWasDraft: true,
    surface: "slack" as const,
  };
  assert.equal(shouldAttachRoleCreationConfirmation(base), false);
  assert.equal(
    shouldAttachRoleCreationConfirmation({
      ...base,
      assistantText: "*마지막 설정*",
      roleWasDraft: false,
    }),
    false
  );
  assert.equal(
    shouldAttachRoleCreationConfirmation({
      ...base,
      assistantText: "*마지막 설정*",
      notificationSaved: false,
    }),
    false
  );
});
