import assert from "node:assert/strict";
import test from "node:test";
import { formatPromptText, formatToolResultText } from "./promptText";

test("company facts preserve amounts, unknowns, and complete multiline source text", () => {
  const description = "확인된 회사 소개\n".repeat(500);
  const output = formatPromptText({ company_description: description, employee_count_range: { start: 11, end: 50 }, total_funding_raised: "USD 12 million", last_funding_stage: null });
  assert.ok(output.includes(description));
  assert.match(output, /하한: 11/);
  assert.match(output, /상한: 50/);
  assert.match(output, /USD 12 million/);
  assert.match(output, /최근 투자 단계: 미확인/);
  assert.throws(() => JSON.parse(output));
});

test("tool projections preserve authored model text and callable references without replaying UI payloads", () => {
  const modelOutput = "\nstatus=queued\nrunId=run-exact\n";
  assert.equal(formatToolResultText({modelOutput, uiPayload: {private: "not-for-model"}}), modelOutput);
  assert.equal(formatToolResultText({roleId: "role-exact", revision: 4}), "roleId: role-exact\nrevision: 4");
});

test("model metadata uses KST minutes; authored text and identifiers remain exact", () => {
  const original = "사용자가 보낸 원문 2026-10-25T01:02:03.456Z";
  const input = { updatedAt: "2026-10-25T01:02:03.456Z", description: original, id: "cr_123", rows: [{ name: "첫 항목" }] };
  const output = formatPromptText(input);
  assert.match(output, /2026-10-25 10:02/);
  assert.ok(output.includes(original));
  assert.match(output, /cr_123/);
  assert.match(output, /항목 0/);
  assert.equal(input.updatedAt, "2026-10-25T01:02:03.456Z");
});
