import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOrgRoleEmploymentType,
  parseOrgRoleWorkMode,
} from "@/lib/org/roleFieldValues";

test("normalizes canonical and user-visible work-mode labels", () => {
  for (const [input, expected] of [
    ["remote", "remote"],
    ["원격 근무", "remote"],
    ["HYBRID", "hybrid"],
    ["하이브리드 근무", "hybrid"],
    ["on-site", "onsite"],
    ["오피스 근무", "onsite"],
  ] as const) {
    assert.equal(parseOrgRoleWorkMode(input), expected);
  }
});

test("does not infer a work mode from a longer condition", () => {
  assert.equal(parseOrgRoleWorkMode("주 2회 출근"), null);
  assert.equal(parseOrgRoleWorkMode("서울 또는 원격"), null);
  assert.equal(parseOrgRoleWorkMode(null), null);
});

test("normalizes canonical and user-visible employment-type labels", () => {
  for (const [input, expected] of [
    ["full_time", "full_time"],
    ["정규직", "full_time"],
    ["part-time", "part_time"],
    ["파트타임", "part_time"],
    ["인턴", "internship"],
    ["계약직", "contract"],
  ] as const) {
    assert.equal(parseOrgRoleEmploymentType(input), expected);
  }
});

test("does not coerce a company-specific employment type", () => {
  assert.equal(parseOrgRoleEmploymentType("프로젝트 계약"), null);
  assert.equal(parseOrgRoleEmploymentType("freelance"), null);
});
