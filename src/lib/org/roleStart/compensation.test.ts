import assert from "node:assert/strict";
import test from "node:test";
import { compensationChips } from "./compensation";

test("compensation offers five KRW ranges from 50M through 150M+, then 협의", () => {
  assert.deepEqual(compensationChips().map((chip) => chip.ko), [
    "연봉 5,000만~7,000만 원",
    "연봉 7,000만~9,000만 원",
    "연봉 9,000만~1억 2,000만 원",
    "연봉 1억 2,000만~1억 5,000만 원",
    "연봉 1억 5,000만 원 이상",
    "연봉 경력에 따라 협의",
  ]);
});

test("English compensation choices use USD rather than KRW", () => {
  assert.deepEqual(compensationChips().map((chip) => chip.en), [
    "USD 50,000–70,000 / year",
    "USD 70,000–90,000 / year",
    "USD 90,000–120,000 / year",
    "USD 120,000–150,000 / year",
    "USD 150,000+ / year",
    "Negotiable by experience",
  ]);
});
