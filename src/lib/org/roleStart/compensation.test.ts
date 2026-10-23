import assert from "node:assert/strict";
import test from "node:test";
import { compensationChips } from "./compensation";

const years = (...values: number[]) => ({
  hardConditions: values.map((value, index) => ({ id: `y${index}`, kind: "min_years" as const, label: "", years: value })),
});

test("compensation chips follow the largest minimum years, then 협의", () => {
  assert.deepEqual(compensationChips({ hardConditions: [] }).map((chip) => chip.ko), [
    "연봉 3,500만~5,000만 원",
    "연봉 5,000만~7,000만 원",
    "연봉 7,000만 원 이상",
    "연봉 경력에 따라 협의",
  ]);
  assert.equal(compensationChips(years(2, 5))[0].ko, "연봉 5,000만~7,000만 원");
  assert.equal(compensationChips(years(6))[2].en, "KRW 90M+ / year");
  assert.equal(compensationChips(years(7))[2].ko, "연봉 1억 2,000만 원 이상");
});
