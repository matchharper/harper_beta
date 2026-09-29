import assert from "node:assert/strict";
import test from "node:test";
import { applyRoleTextEdits } from "./roleTextEdits";

test("targeted additions preserve every unrelated public/private character", () => {
  const current = { description: "회사 소개\n\n## 업무\n- API 개발\n\n## 필수\n- PostgreSQL 경험", request: "비공개 판단" };
  const result = applyRoleTextEdits(current, { textEdits: [{ field: "description", before: "- API 개발", after: "- API 개발\n- 고객별 연동 표준화" }] });
  assert.deepEqual(result, { description: "회사 소개\n\n## 업무\n- API 개발\n- 고객별 연동 표준화\n\n## 필수\n- PostgreSQL 경험" });
  assert.equal(current.request, "비공개 판단");
});

test("edits apply in order and can remove exact text without inventing replacements", () => {
  assert.deepEqual(applyRoleTextEdits({ description: "A B C", request: null }, { name: "New title", textEdits: [
    { field: "description", before: "B", after: "X" },
    { field: "description", before: "X C", after: "" },
  ] }), { name: "New title", description: "A " });
});

test("missing, ambiguous, and conflicting edits fail before producing writes", () => {
  const current = { description: "A A", request: null };
  for (const input of [
    { textEdits: [{ field: "description", before: "A", after: "B" }] },
    { textEdits: [{ field: "description", before: "C", after: "B" }] },
    { textEdits: [{ field: "description", before: "", after: "B" }] },
    { textEdits: [{ field: "request", before: "A", after: "B" }] },
    { description: "new", textEdits: [{ field: "description", before: "A A", after: "B" }] },
    { textEdits: [{ field: "salaryRange", before: "A", after: "B" }] },
    { textEdits: [] },
  ]) assert.throws(() => applyRoleTextEdits(current, input));
  assert.equal(current.description, "A A");
});

test("full replacements and null clearing keep the existing tool contract", () => {
  assert.deepEqual(applyRoleTextEdits({ description: "old", request: "private" }, { description: null, request: "new" }), { description: null, request: "new" });
});
