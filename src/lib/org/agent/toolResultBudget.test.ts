import assert from "node:assert/strict";
import test from "node:test";
import {
  fitOrgAgentToolResultToBudget,
  ORG_AGENT_TOOL_RESULT_BUDGET_MARKER,
} from "@/lib/org/agent/toolResultBudget";

test("an exhausted tool-result budget still returns a fixed non-empty incomplete marker", () => {
  const result = fitOrgAgentToolResultToBudget({
    remainingChars: 0,
    serializedResult: "serialization_complete=true\nsecret complete value",
  });

  assert.equal(result.complete, false);
  assert.equal(result.content, ORG_AGENT_TOOL_RESULT_BUDGET_MARKER);
  assert.notEqual(result.content, "");
  assert.match(result.content, /complete=false/);
  assert.doesNotMatch(result.content, /serialization_complete=true/);
});

test("an already-incomplete serializer result is replaced instead of prefix-sliced", () => {
  const result = fitOrgAgentToolResultToBudget({
    remainingChars: 10_000,
    serializedResult: [
      "serialization_complete=false",
      "field_complete=true",
      "partial value",
    ].join("\n"),
  });

  assert.equal(result.complete, false);
  assert.equal(result.content, ORG_AGENT_TOOL_RESULT_BUDGET_MARKER);
  assert.doesNotMatch(result.content, /field_complete=true/);
});

test("a complete result inside the remaining budget is preserved exactly", () => {
  const serializedResult = "serialization_complete=true\nvalue=hello";
  const result = fitOrgAgentToolResultToBudget({
    remainingChars: serializedResult.length,
    serializedResult,
  });

  assert.deepEqual(result, { complete: true, content: serializedResult });
});
