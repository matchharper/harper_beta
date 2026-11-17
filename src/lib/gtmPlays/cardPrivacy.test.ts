import assert from "node:assert/strict";
import test from "node:test";
import { isSameOrg, normalizeOrgName } from "./cardPrivacy";

test("organisation names compare without legal suffixes, (주) or punctuation", () => {
  assert.equal(normalizeOrgName("Clarus Securities, Inc."), "clarus securities");
  assert.equal(normalizeOrgName("(주)비바리퍼블리카"), "비바리퍼블리카");
  assert.equal(normalizeOrgName("Costco"), "costco");
});

test("the posting company matches its current employee's employer name", () => {
  assert.ok(isSameOrg("Sierra", "Sierra Technologies, Inc."));
  assert.ok(isSameOrg("(주)토스", "토스"));
  assert.ok(!isSameOrg("AI", "AI Labs"));
  assert.ok(!isSameOrg("Toss", "Tossup Games"));
  assert.ok(!isSameOrg("", "Toss"));
});
