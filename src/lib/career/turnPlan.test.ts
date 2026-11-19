import assert from "node:assert/strict";
import test from "node:test";
import { applyCareerTurnPlanChanges, CAREER_TURN_PLAN_TOOLS, type CareerTurnPlanItem } from "./turnPlan";

test("changes add, update, finish and remove items one at a time", () => {
  const first = applyCareerTurnPlanChanges([], { changes: [
    { text: "희망 조건 확인", status: "in_progress" }, { text: "맞는 기회 찾기" }, { text: "결과 정리" },
  ] });
  assert.deepEqual(first.items.map(item => [item.id, item.status]), [["1", "in_progress"], ["2", "pending"], ["3", "pending"]]);
  const next = applyCareerTurnPlanChanges(first.items, { changes: [
    { id: "1", status: "done" }, { id: "2", status: "in_progress", text: "디자인 리드 기회 찾기" }, { id: "3", delete: true }, { text: "지원 준비" },
  ] });
  assert.deepEqual(next.items, [
    { id: "1", text: "희망 조건 확인", status: "done" },
    { id: "2", text: "디자인 리드 기회 찾기", status: "in_progress" },
    { id: "4", text: "지원 준비", status: "pending" },
  ]);
  assert.equal(next.modelOutput, "Current checklist:\n1. [done] 희망 조건 확인\n2. [in_progress] 디자인 리드 기회 찾기\n4. [pending] 지원 준비");
});

test("an unknown id or an empty new item is reported without dropping the other changes", () => {
  const result = applyCareerTurnPlanChanges([{ id: "1", text: "확인", status: "pending" }], { changes: [{ id: "9", status: "done" }, { text: " " }, { delete: true }, { id: "1", status: "done" }] });
  assert.deepEqual(result.items, [{ id: "1", text: "확인", status: "done" }]);
  assert.match(result.modelOutput, /Item 9 does not exist/);
  assert.match(result.modelOutput, /A new item needs text/);
  assert.match(result.modelOutput, /Removing an item needs its id/);
});

test("the tool writes only to the current reply's checklist", async () => {
  let items: CareerTurnPlanItem[] = [];
  const tool = CAREER_TURN_PLAN_TOOLS.upsert_plan;
  const result = await tool.execute!({ changes: [{ text: "공고 확인" }] }, { turnPlan: { read: () => items, write: (next: CareerTurnPlanItem[]) => { items = next; } } } as any);
  assert.deepEqual(items, [{ id: "1", text: "공고 확인", status: "pending" }]);
  assert.deepEqual(result, { modelOutput: "Current checklist:\n1. [pending] 공고 확인" });
  await assert.rejects(tool.execute!({ changes: [] }, {} as any));
});
