import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOrgRoleCriteriaEdits,
  getOrgRoleCriteriaValidationError,
  hasCompleteOrgRoleCriteria,
  normalizeOrgRoleCriteria,
  parseOrgRoleCriteria,
} from "@/lib/org/roleCriteria";

const completeCriteria = [
  { name: "Experience level", criteria: "관련 업무를 3년 이상 수행한 경험" },
  {
    name: "Founding-stage experience",
    criteria: "초기 팀에서 제품을 만든 경험",
  },
  {
    name: "Technical depth",
    criteria: "복잡한 기술 문제를 주도해 해결한 근거",
  },
];

test("accepts zero to six complete structured role criteria", () => {
  assert.equal(hasCompleteOrgRoleCriteria([]), true);
  assert.deepEqual(parseOrgRoleCriteria([]), []);
  assert.equal(hasCompleteOrgRoleCriteria(completeCriteria.slice(0, 1)), true);
  assert.equal(hasCompleteOrgRoleCriteria(completeCriteria.slice(0, 2)), true);
  assert.equal(hasCompleteOrgRoleCriteria(completeCriteria), true);
  assert.deepEqual(parseOrgRoleCriteria(completeCriteria), completeCriteria);
  assert.equal(
    hasCompleteOrgRoleCriteria([
      ...completeCriteria,
      { name: "Ownership", criteria: "모호한 문제를 끝까지 맡은 경험" },
      { name: "Communication", criteria: "협업 의사결정을 명확히 설명한 경험" },
      { name: "Domain", criteria: "관련 도메인에서 성과를 낸 경험" },
    ]),
    true
  );
});

test("rejects oversized and incomplete criteria lists", () => {
  assert.match(
    getOrgRoleCriteriaValidationError([
      ...completeCriteria,
      ...completeCriteria,
      completeCriteria[0],
    ])!,
    /6개/
  );
  assert.match(
    getOrgRoleCriteriaValidationError([
      ...completeCriteria.slice(0, 2),
      { name: "", criteria: "내용" },
    ])!,
    /이름과 상세 내용/
  );
});

test("normalizes stored object values without inventing missing content", () => {
  assert.deepEqual(
    normalizeOrgRoleCriteria([
      { name: "  Experience level ", criteria: "  5년 이상  " },
      null,
    ]),
    [
      { name: "Experience level", criteria: "5년 이상" },
      { name: "", criteria: "" },
    ]
  );
});

test("applies targeted add, update, rename, and delete edits in order", () => {
  const result = applyOrgRoleCriteriaEdits(completeCriteria, [
    {
      operation: "add",
      name: "Communication",
      criteria: "복잡한 의사결정을 명확히 설명한 경험",
    },
    {
      operation: "update",
      targetName: "Technical depth",
      criteria: "복잡한 기술 문제를 설계부터 운영까지 해결한 근거",
    },
    {
      operation: "update",
      targetName: "Founding-stage experience",
      name: "Zero-to-one building",
    },
    { operation: "delete", targetName: "Experience level" },
  ]);

  assert.deepEqual(result.counts, { added: 1, deleted: 1, updated: 2 });
  assert.deepEqual(result.criteria, [
    {
      name: "Zero-to-one building",
      criteria: "초기 팀에서 제품을 만든 경험",
    },
    {
      name: "Technical depth",
      criteria: "복잡한 기술 문제를 설계부터 운영까지 해결한 근거",
    },
    {
      name: "Communication",
      criteria: "복잡한 의사결정을 명확히 설명한 경험",
    },
  ]);
});

test("supports adding one criterion and deleting one criterion", () => {
  const added = applyOrgRoleCriteriaEdits(completeCriteria, [
    {
      operation: "add",
      name: "Ownership",
      criteria: "모호한 문제를 끝까지 맡은 경험",
    },
  ]);
  assert.equal(added.criteria.length, 4);
  assert.equal(added.criteria.at(-1)?.name, "Ownership");

  const deleted = applyOrgRoleCriteriaEdits(added.criteria, [
    { operation: "delete", targetName: "Ownership" },
  ]);
  assert.deepEqual(deleted.criteria, completeCriteria);

  const cleared = applyOrgRoleCriteriaEdits(completeCriteria, [
    { operation: "delete", targetName: "Experience level" },
    { operation: "delete", targetName: "Founding-stage experience" },
    { operation: "delete", targetName: "Technical depth" },
  ]);
  assert.deepEqual(cleared.criteria, []);
});

test("rejects ambiguous targets, invalid edit shapes, and oversized results", () => {
  assert.throws(
    () =>
      applyOrgRoleCriteriaEdits(completeCriteria, [
        { operation: "update", targetName: "Missing", criteria: "새 내용" },
      ]),
    /찾을 수 없습니다/
  );
  assert.throws(
    () =>
      applyOrgRoleCriteriaEdits(completeCriteria, [
        {
          operation: "add",
          name: "Technical depth",
          criteria: "중복 이름",
        },
      ]),
    /이미 있습니다/
  );
  assert.throws(
    () =>
      applyOrgRoleCriteriaEdits(completeCriteria, [
        { operation: "update", targetName: "Technical depth" },
      ]),
    /name이나 criteria/
  );
  assert.throws(() =>
    applyOrgRoleCriteriaEdits(
      [
        ...completeCriteria,
        { name: "Ownership", criteria: "끝까지 맡은 경험" },
        { name: "Communication", criteria: "명확한 협업 경험" },
        { name: "Domain", criteria: "관련 도메인 경험" },
      ],
      [{ operation: "add", name: "Extra", criteria: "추가 기준" }]
    )
  );
});
