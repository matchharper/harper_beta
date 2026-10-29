import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeQuestionList,
  parseDecision,
} from "./internalOpportunityCallDecision";

test("keeps the model's decision without a minimum question count", () => {
  for (const questions of [[], ["One useful question?"]]) {
    assert.equal(
      parseDecision(JSON.stringify({ do_request: true, questions })).doRequest,
      true
    );
  }
  assert.equal(
    parseDecision(
      JSON.stringify({
        do_request: false,
        questions: ["One?", "Two?", "Three?"],
      })
    ).doRequest,
    false
  );
});
test("does not truncate questions, quantity, or rationale", () => {
  const questions = Array.from(
    { length: 8 },
    () => "Question " + "내용".repeat(300)
  );
  const reasoning = "reason ".repeat(300);
  const result = parseDecision(
    JSON.stringify({
      do_request: true,
      questions,
      reasoning,
      user_facing_reason: reasoning,
    })
  );
  assert.deepEqual(result.questions, questions);
  assert.equal(result.reasoning, reasoning.trim());
  assert.equal(result.userFacingReason, reasoning.trim());
  assert.deepEqual(normalizeQuestionList(questions), questions);
});
test("still requires readable JSON and machine-readable values", () => {
  assert.equal(parseDecision("not json").doRequest, false);
  assert.equal(parseDecision("[]").doRequest, false);
  assert.deepEqual(normalizeQuestionList([false, 3, null, "Question?"]), [
    "Question?",
  ]);
});
