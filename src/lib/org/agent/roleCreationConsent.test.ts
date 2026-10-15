import assert from "node:assert/strict";
import test from "node:test";
import {
  isUnambiguousFinalRoleNotificationDefault,
  validateRoleCreationNotificationConsent,
} from "@/lib/org/agent/roleCreationConsent";

const channel = {
  aliases: ["#채용", "C123"],
  id: "channel:C123",
  kind: "channel" as const,
  label: "채용",
};
const assignee = {
  aliases: ["minsu@example.com", "U123"],
  id: "assignee:U123",
  kind: "assignee" as const,
  label: "김민수",
};

// Stands in for the LLM judgment and records the targets it was asked about.
function judgment(approves: boolean) {
  const askedTargetIds: string[][] = [];
  return {
    approvesProposal: async (input: { targets: Array<{ id: string }> }) => {
      askedTargetIds.push(input.targets.map((target) => target.id));
      return approves;
    },
    askedTargetIds,
  };
}

test("accepts a clear yes only for targets named in the previous proposal", async () => {
  const approval = judgment(true);
  assert.deepEqual(
    await validateRoleCreationNotificationConsent({
      approvesProposal: approval.approvesProposal,
      previousAssistantMessage:
        "#채용 채널을 연결하고 김민수님을 담당자로 등록할까요?",
      targets: [channel, assignee],
      userMessage: "네, 그렇게 해주세요",
    }),
    { missingTargetIds: [], ok: true }
  );
  assert.deepEqual(approval.askedTargetIds, [
    ["channel:C123", "assignee:U123"],
  ]);
});

test("keeps proposed targets unsaved when the reply does not approve them", async () => {
  assert.deepEqual(
    await validateRoleCreationNotificationConsent({
      approvesProposal: judgment(false).approvesProposal,
      previousAssistantMessage:
        "#채용 채널을 연결하고 김민수님을 담당자로 등록할까요?",
      targets: [channel, assignee],
      userMessage: "채널은 바꾸고 등록 진행해 주세요",
    }),
    { missingTargetIds: ["channel:C123", "assignee:U123"], ok: false }
  );
});

test("asks only about proposed targets the user did not name", async () => {
  const approval = judgment(true);
  assert.equal(
    (
      await validateRoleCreationNotificationConsent({
        approvesProposal: approval.approvesProposal,
        previousAssistantMessage:
          "#채용 채널을 연결하고 김민수님을 담당자로 등록할까요?",
        targets: [channel, assignee],
        userMessage: "채널은 좋아요. 담당자는 김민수님으로 해주세요",
      })
    ).ok,
    true
  );
  assert.deepEqual(approval.askedTargetIds, [["channel:C123"]]);
});

test("accepts targets explicitly selected in the current user turn", async () => {
  const approval = judgment(false);
  assert.equal(
    (
      await validateRoleCreationNotificationConsent({
        approvesProposal: approval.approvesProposal,
        previousAssistantMessage: "어디로 연결할까요?",
        targets: [channel, assignee],
        userMessage: "채용 채널이랑 김민수님으로 해주세요",
      })
    ).ok,
    true
  );
  assert.deepEqual(approval.askedTargetIds, []);
});

test("accepts an exact current-channel reference only for the current channel target", async () => {
  const approval = judgment(true);
  assert.equal(
    (
      await validateRoleCreationNotificationConsent({
        approvesProposal: approval.approvesProposal,
        previousAssistantMessage: "어디로 연결할까요?",
        targets: [
          { ...channel, aliases: [...channel.aliases, "현재 채널", "이 채널"] },
          assignee,
        ],
        userMessage: "현재 채널로 하고, 김민수님으로 바로 시작해 주세요",
      })
    ).ok,
    true
  );
  assert.equal(
    (
      await validateRoleCreationNotificationConsent({
        approvesProposal: approval.approvesProposal,
        previousAssistantMessage: "어디로 연결할까요?",
        targets: [channel, assignee],
        userMessage: "현재 채널로 하고, 김민수님으로 바로 시작해 주세요",
      })
    ).missingTargetIds.includes("channel:C123"),
    true
  );
  assert.deepEqual(approval.askedTargetIds, []);
});

test("accepts a shorthand only when the preceding proposal names the target", async () => {
  assert.equal(
    (
      await validateRoleCreationNotificationConsent({
        approvesProposal: judgment(true).approvesProposal,
        previousAssistantMessage: "#채용 채널에 연결할까요?",
        targets: [channel],
        userMessage: "그 채널로 해주세요",
      })
    ).ok,
    true
  );
});

test("rejects an unrelated yes and a target absent from the proposal", async () => {
  const approval = judgment(true);
  assert.deepEqual(
    await validateRoleCreationNotificationConsent({
      approvesProposal: approval.approvesProposal,
      previousAssistantMessage: "근무 방식은 하이브리드로 할까요?",
      targets: [channel],
      userMessage: "네",
    }),
    { missingTargetIds: ["channel:C123"], ok: false }
  );
  assert.deepEqual(
    (
      await validateRoleCreationNotificationConsent({
        approvesProposal: approval.approvesProposal,
        previousAssistantMessage: "채용 채널을 연결할까요?",
        targets: [channel, assignee],
        userMessage: "아니요",
      })
    ).missingTargetIds,
    ["channel:C123", "assignee:U123"]
  );
  assert.deepEqual(approval.askedTargetIds, []);
});

test("allows only the sole channel and current author as ready-draft defaults", () => {
  const defaults = {
    availableChannelIds: ["C123"],
    currentUserId: "U123",
    memberUserIds: ["U123"],
    roleStatus: "draft",
    selectedAssigneeUserId: "U123",
    selectedChannelIds: ["C123"],
    unresolvedFields: ["connected_slack", "assignee"],
  };
  assert.equal(isUnambiguousFinalRoleNotificationDefault(defaults), true);
  assert.equal(
    isUnambiguousFinalRoleNotificationDefault({
      ...defaults,
      availableChannelIds: ["C123", "C456"],
    }),
    false
  );
  assert.equal(
    isUnambiguousFinalRoleNotificationDefault({
      ...defaults,
      unresolvedFields: ["location", "connected_slack", "assignee"],
    }),
    false
  );
});
