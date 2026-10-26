import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY ||= "test-only-not-used";

test("an answered Slack question keeps the question and replaces the buttons with the answer", async () => {
  const { answeredQuestionBlocks, buildRoleStartQuestionBlocks } = await import("./slackBlocks");
  const question = { id: "q1", question: "B2B 경험이 꼭 있어야 하나요?", why: "후보 범위가 달라져요.", chips: [{ id: "c1", label: "꼭 필요해요", effect: { type: "none" } }], status: "pending", askedAt: "", overlap: null };
  const open = buildRoleStartQuestionBlocks({ roleId: "r1", pendingQuestion: question } as never);
  assert.ok(open.some((block) => block.type === "actions"));
  const closed = answeredQuestionBlocks(question as never, "꼭 필요해요");
  assert.ok(!closed.some((block) => block.type === "actions"));
  assert.match(JSON.stringify(closed), /B2B 경험이 꼭 있어야 하나요/);
  assert.match(JSON.stringify(closed), /✓ \*꼭 필요해요\*/);
});

test("a question moved out of a Slack reply goes out as its 4-5 chips plus skip, answered like the web card", async () => {
  const { buildRoleStartQuestionBlocks, decodeRoleStartSlackValue, ROLE_START_SLACK_CHIP_ACTION, ROLE_START_SLACK_SKIP_ACTION } = await import("./slackBlocks");
  const chips = ["있어요", "없어요", "팀원 프로필을 참고해 주세요", "아직 정하지 않았어요"].map((label, index) => ({ id: `c${index}`, label, effect: { type: "note" as const } }));
  const blocks = buildRoleStartQuestionBlocks({
    roleId: "00000000-0000-0000-0000-000000000001",
    pendingQuestion: { id: "q1", question: "참고할 프로필이 있나요?", why: "", chips, status: "pending", overlap: null, askedAt: "" },
  } as never);
  const section = blocks[0] as { text: { text: string } };
  assert.equal(section.text.text, "*참고할 프로필이 있나요?*", "no empty reason line");
  const buttons = (blocks[1] as { elements: Array<{ action_id: string; value: string }> }).elements;
  assert.equal(buttons.filter((button) => button.action_id.startsWith(ROLE_START_SLACK_CHIP_ACTION)).length, 4);
  assert.equal(buttons.at(-1)?.action_id, ROLE_START_SLACK_SKIP_ACTION);
  assert.deepEqual(decodeRoleStartSlackValue(buttons[1]!.value), { roleId: "00000000-0000-0000-0000-000000000001", questionId: "q1", chipId: "c1" });
});
