import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHarperSlackChoiceBlocks,
  buildSelectedHarperSlackChoiceBlocks,
  decodeHarperSlackChoiceActionValue,
  HARPER_SLACK_CHOICE_ACTION_PREFIX,
  parseHarperSlackChoiceMarkers,
} from "./slackChoiceButtons";

test("extracts up to two private button markers from a Slack answer", () => {
  const parsed = parseHarperSlackChoiceMarkers(`이 변경안을 적용할까요?

[적용해주세요](button:네, 위 변경안을 그대로 적용해 주세요.) [아니요](button:아니요, 지금은 적용하지 않을게요.)`);

  assert.equal(parsed.text, "이 변경안을 적용할까요?");
  assert.deepEqual(parsed.choices, [
    {
      label: "적용해주세요",
      userMessage: "네, 위 변경안을 그대로 적용해 주세요.",
    },
    {
      label: "아니요",
      userMessage: "아니요, 지금은 적용하지 않을게요.",
    },
  ]);
});

test("allows ordinary parentheses inside the synthetic user reply", () => {
  const parsed = parseHarperSlackChoiceMarkers(
    "계속할까요? [계속](button:네, 직접 연락(이메일 없이)으로 진행해 주세요.)"
  );

  assert.deepEqual(parsed.choices, [
    {
      label: "계속",
      userMessage: "네, 직접 연락(이메일 없이)으로 진행해 주세요.",
    },
  ]);
  assert.equal(parsed.text, "계속할까요?");
});

test("leaves markers in code literal and degrades button spam to labels", () => {
  const code = parseHarperSlackChoiceMarkers(
    "`[예시](button:누르기)`\n\n일반 답변"
  );
  const spam = parseHarperSlackChoiceMarkers(
    "선택: [A](button:A 선택) [B](button:B 선택) [C](button:C 선택)"
  );

  assert.equal(code.choices.length, 0);
  assert.match(code.text, /\[예시\]\(button:누르기\)/);
  assert.deepEqual(spam.choices, []);
  assert.equal(spam.text, "선택: A B C");
});

test("builds Slack actions with opaque job references and removes them after selection", () => {
  const sourceJobId = "123e4567-e89b-42d3-a456-426614174000";
  const blocks = buildHarperSlackChoiceBlocks({
    choices: [{ label: "진행해주세요", userMessage: "진행해주세요." }],
    sourceJobId,
    text: "진행할까요?",
  });
  const actions = blocks[1] as {
    block_id: string;
    elements: Array<{ action_id: string; value: string }>;
    type: string;
  };

  assert.equal(actions.type, "actions");
  assert.equal(
    actions.elements[0].action_id,
    `${HARPER_SLACK_CHOICE_ACTION_PREFIX}0`
  );
  assert.deepEqual(
    decodeHarperSlackChoiceActionValue(actions.elements[0].value),
    { choiceIndex: 0, sourceJobId }
  );

  const selected = buildSelectedHarperSlackChoiceBlocks({
    choiceLabel: "진행해주세요",
    originalBlocks: blocks,
    originalText: "진행할까요?",
    slackUserId: "U123",
  });
  assert.equal(
    selected.some((block) => block.type === "actions"),
    false
  );
  assert.match(JSON.stringify(selected.at(-1)), /<@U123>/);
  assert.match(JSON.stringify(selected.at(-1)), /진행해주세요/);
});

test("removes unsupported language labels from Slack code fences", () => {
  const blocks = buildHarperSlackChoiceBlocks({
    choices: [],
    sourceJobId: "123e4567-e89b-42d3-a456-426614174000",
    text: "본문:\n```text\n안녕하세요.\n```",
  });

  assert.equal(blocks[0].type, "section");
  assert.doesNotMatch(JSON.stringify(blocks), /```text/);
  assert.match(JSON.stringify(blocks), /```\\n안녕하세요/);
});

test("keeps inline company-information links inside the normal Slack reply", () => {
  const blocks = buildHarperSlackChoiceBlocks({
    choices: [{ label: "확인", userMessage: "확인했습니다." }],
    sourceJobId: "123e4567-e89b-42d3-a456-426614174000",
    text: "<https://matchharper.com/org/team?orgId=workspace-1|회사 정보>를 반영했습니다.",
  });
  const message = blocks[0] as {
    expand: boolean;
    text: { text: string; type: string };
    type: string;
  };

  assert.equal(message.type, "section");
  assert.equal(message.expand, true);
  assert.match(message.text.text, /<https:\/\/matchharper\.com\/org\/team\?orgId=workspace-1\|회사 정보>를 반영했습니다\./);
  assert.equal(blocks[1].type, "actions");
});
