import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY ||= "test-openai-key";

const judge = import("./roleCreationConsentJudge");

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

test("shows the proposal, the settings to approve and the whole reply", async () => {
  const { buildRoleNotificationConsentInput } = await judge;
  assert.equal(
    buildRoleNotificationConsentInput({
      previousAssistantMessage:
        "알림 설정만 확인해 주세요.\n• 채널: `#채용`\n• 담당자: 김민수",
      targets: [channel, assignee],
      userMessage: "sp\n\n네",
    }),
    [
      "<harper_previous_message>",
      "알림 설정만 확인해 주세요.",
      "• 채널: `#채용`",
      "• 담당자: 김민수",
      "</harper_previous_message>",
      "",
      "<settings>",
      "- Slack channel: #채용",
      "- Assignee: 김민수",
      "</settings>",
      "",
      "<user_reply>",
      "sp",
      "",
      "네",
      "</user_reply>",
    ].join("\n")
  );
});

test("keeps the end of long messages, where the latest question and answer are", async () => {
  const { buildRoleNotificationConsentInput } = await judge;
  const input = buildRoleNotificationConsentInput({
    previousAssistantMessage: `${"가".repeat(5_000)}이 설정으로 진행할까요?`,
    targets: [channel],
    userMessage: `${"나".repeat(3_000)}네`,
  });
  const proposal = input.split("\n")[1];
  const reply = input.split("\n").at(-2) ?? "";
  assert.equal(proposal.length, 4_001);
  assert.match(proposal, /^…가+이 설정으로 진행할까요\?$/);
  assert.equal(reply.length, 2_001);
  assert.match(reply, /^…나+네$/);
});

test("approves only an explicit yes", async () => {
  const { parseRoleNotificationConsentDecision } = await judge;
  assert.equal(parseRoleNotificationConsentDecision("yes"), true);
  assert.equal(parseRoleNotificationConsentDecision(" Yes\n"), true);
  for (const value of ["no", "yes, but", "", null, undefined]) {
    assert.equal(parseRoleNotificationConsentDecision(value), false);
  }
});
