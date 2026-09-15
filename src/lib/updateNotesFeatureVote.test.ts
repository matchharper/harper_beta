import assert from "node:assert/strict";
import test from "node:test";
import {
  areUpdateNotesFeatureVotesEqual,
  formatUpdateNotesFeatureVoteSlackText,
  normalizeUpdateNotesFeatureVoteOptionIds,
  shouldSubmitUpdateNotesFeatureVoteDirectly,
} from "./updateNotesFeatureVote";

test("normalizes feature selections to canonical unique option ids", () => {
  assert.deepEqual(
    normalizeUpdateNotesFeatureVoteOptionIds([
      "company_following",
      "not_an_option",
      "resume_writing",
      "company_following",
    ]),
    ["resume_writing", "company_following"]
  );
});

test("compares votes independently of selection order and surrounding context whitespace", () => {
  assert.equal(
    areUpdateNotesFeatureVotesEqual(
      {
        context: "  이직 준비 중이에요.  ",
        customResponse: "  지원 현황도 정리해 주세요. ",
        optionIds: ["company_following", "resume_writing"],
      },
      {
        context: "이직 준비 중이에요.",
        customResponse: "지원 현황도 정리해 주세요.",
        optionIds: ["resume_writing", "company_following"],
      }
    ),
    true
  );
});

test("submits a custom-only response without requesting selection context", () => {
  assert.equal(
    shouldSubmitUpdateNotesFeatureVoteDirectly({
      customResponse: "지원 현황을 한눈에 보고 싶어요.",
      optionIds: [],
    }),
    true
  );
  assert.equal(
    shouldSubmitUpdateNotesFeatureVoteDirectly({
      customResponse: "지원 현황을 한눈에 보고 싶어요.",
      optionIds: ["resume_writing"],
    }),
    false
  );
  assert.equal(
    shouldSubmitUpdateNotesFeatureVoteDirectly({
      customResponse: "   ",
      optionIds: [],
    }),
    false
  );
});

test("formats Slack feedback as plain lines without bullet points", () => {
  const text = formatUpdateNotesFeatureVoteSlackText({
    context: "<지원 전에>\n- 흐름을 알고 싶어요.",
    customResponse: "지원 현황도 정리해 주세요.",
    email: "talent@example.com",
    optionIds: ["apply_on_my_behalf", "company_following"],
    revision: false,
  });

  assert.match(text, /^Harper 피드백\n/);
  assert.match(
    text,
    /선택한 기능: 지원 전략 세워주기, 원하는 회사를 팔로우하기/
  );
  assert.match(text, /&lt;지원 전에&gt; - 흐름을 알고 싶어요\./);
  assert.match(text, /주관식 답변: 지원 현황도 정리해 주세요\./);
  assert.doesNotMatch(text, /^(?:•|-) /m);
});

test("formats custom-only feedback without a selected feature", () => {
  const text = formatUpdateNotesFeatureVoteSlackText({
    context: "",
    customResponse: "관심 회사의 새 공고를 요약해 주세요.",
    email: null,
    optionIds: [],
    revision: false,
  });

  assert.match(text, /선택한 기능: 선택하지 않음/);
  assert.match(text, /주관식 답변: 관심 회사의 새 공고를 요약해 주세요\./);
  assert.match(text, /선택 이유와 맥락: 작성하지 않음/);
});
