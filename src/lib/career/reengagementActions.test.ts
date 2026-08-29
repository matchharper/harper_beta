import assert from "node:assert/strict";
import test from "node:test";

import {
  extractCareerReengagementActions,
  resolveCareerReengagementActionKeys,
} from "./reengagementActions";

test("extracts chat and navigation re-engagement actions separately from labels", () => {
  const result = extractCareerReengagementActions(`무엇부터 같이 볼까요?
[[CAREER_REENGAGEMENT_ACTIONS]]
{"actions":[{"label":"새 기회 찾아보기","action":{"type":"send_message","message":"지금 조건에 맞는 새로운 기회를 찾아줘."}},{"label":"내 프로필 확인","action":{"type":"open_path","path":"/career/profile"}}]}
[[/CAREER_REENGAGEMENT_ACTIONS]]`);

  assert.equal(result.content, "무엇부터 같이 볼까요?");
  assert.deepEqual(result.actions, [
    {
      label: "새 기회 찾아보기",
      action: {
        type: "send_message",
        message: "지금 조건에 맞는 새로운 기회를 찾아줘.",
      },
    },
    {
      label: "내 프로필 확인",
      action: { type: "open_path", path: "/career/profile" },
    },
  ]);
});

test("rejects unsafe navigation, deduplicates actions, and limits output to three", () => {
  const result = extractCareerReengagementActions(`안내
[[CAREER_REENGAGEMENT_ACTIONS]]
{"actions":[{"label":"외부로 이동","action":{"type":"open_path","path":"https://example.com"}},{"label":"프로필","action":{"type":"open_path","path":"/career/profile"}},{"label":"프로필 다시","action":{"type":"open_path","path":"/career/profile"}},{"label":"대화 1","action":{"type":"send_message","message":"첫 번째 대화를 시작해줘."}},{"label":"대화 2","action":{"type":"send_message","message":"두 번째 대화를 시작해줘."}},{"label":"대화 3","action":{"type":"send_message","message":"세 번째 대화를 시작해줘."}}]}
[[/CAREER_REENGAGEMENT_ACTIONS]]`);

  assert.equal(result.actions.length, 3);
  assert.deepEqual(
    result.actions.map((item) => item.label),
    ["프로필", "대화 1", "대화 2"]
  );
});

test("rejects normalized and encoded path traversal outside career", () => {
  const result = extractCareerReengagementActions(`안내
[[CAREER_REENGAGEMENT_ACTIONS]]
{"actions":[{"label":"경로 우회","action":{"type":"open_path","path":"/career/../org"}},{"label":"인코딩 우회","action":{"type":"open_path","path":"/career/%2e%2e/org"}},{"label":"정상 경로","action":{"type":"open_path","path":"/career/history?tab=saved#latest"}}]}
[[/CAREER_REENGAGEMENT_ACTIONS]]`);

  assert.deepEqual(result.actions, [
    {
      label: "정상 경로",
      action: {
        path: "/career/history?tab=saved#latest",
        type: "open_path",
      },
    },
  ]);
});

test("accepts an otherwise valid action payload wrapped in a JSON code fence", () => {
  const result = extractCareerReengagementActions(`안내
[[CAREER_REENGAGEMENT_ACTIONS]]
\`\`\`json
{"actions":[{"label":"프로필 보기","action":{"type":"open_path","path":"/career/profile"}}]}
\`\`\`
[[/CAREER_REENGAGEMENT_ACTIONS]]`);

  assert.equal(result.content, "안내");
  assert.equal(result.actions[0]?.label, "프로필 보기");
});

test("hides malformed or incomplete re-engagement metadata", () => {
  assert.deepEqual(
    extractCareerReengagementActions(
      "보이는 답변\n[[CAREER_REENGAGEMENT_ACTIONS]]\n{not-json}\n[[/CAREER_REENGAGEMENT_ACTIONS]]"
    ),
    { actions: [], content: "보이는 답변" }
  );
  assert.deepEqual(
    extractCareerReengagementActions(
      "보이는 답변\n[[CAREER_REENGAGEMENT_ACTIONS"
    ),
    { actions: [], content: "보이는 답변" }
  );
});

test("resolves only server-provided pending action keys before rendering", () => {
  const resolved = resolveCareerReengagementActionKeys({
    content: `질문을 바로 확인할 수 있어요.
[[CAREER_REENGAGEMENT_ACTIONS]]
{"actions":[{"label":"질문에 답하기","action":{"type":"open_pending_action","actionKey":"pending_1"}},{"label":"잘못된 항목","action":{"type":"open_pending_action","actionKey":"pending_2"}}]}
[[/CAREER_REENGAGEMENT_ACTIONS]]`,
    resolvePendingActionRef: (actionKey) =>
      actionKey === "pending_1" ? "signedPayload.signedValue" : null,
  });

  assert.doesNotMatch(resolved, /pending_1|pending_2/);
  assert.match(resolved, /signedPayload\.signedValue/);
  assert.deepEqual(extractCareerReengagementActions(resolved), {
    actions: [
      {
        label: "질문에 답하기",
        action: {
          type: "open_pending_action",
          ref: "signedPayload.signedValue",
        },
      },
    ],
    content: "질문을 바로 확인할 수 있어요.",
  });
});

test("does not accept an LLM-authored pending action ref during server resolution", () => {
  const resolved = resolveCareerReengagementActionKeys({
    content: `안내
[[CAREER_REENGAGEMENT_ACTIONS]]
{"actions":[{"label":"임의 요청","action":{"type":"open_pending_action","ref":"forged.ref"}}]}
[[/CAREER_REENGAGEMENT_ACTIONS]]`,
    resolvePendingActionRef: () => null,
  });

  assert.equal(resolved, "안내");
});
