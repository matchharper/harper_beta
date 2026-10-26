import assert from "node:assert/strict";
import test from "node:test";
import { parseThinConditions, relaxations, thinConditions, thinNoticeText } from "./widen";

const brief = {
  summary: "",
  keywords: [],
  hardConditions: [
    { id: "h_years", kind: "min_years" as const, label: "UX 경력 3년 이상", years: 3 },
    { id: "h_loc", kind: "location" as const, label: "서울 근무", countries: ["KR"], cities: ["Seoul"], allowRelocation: false },
  ],
  criteria: [
    { id: "c_figma", name: "Figma 디자인 시스템", criteria: "figma", requirement: "must" as const },
    { id: "c_test", name: "사용성 테스트", criteria: "test", requirement: "preferred" as const },
  ],
};

test("conditions are ranked by how many candidates loosening each one adds", () => {
  // Pretend passing counts: now 2; loosening years adds 5, location adds 1, the must criterion adds 0.
  const passing = (candidate: typeof brief) => {
    let count = 2;
    const years = candidate.hardConditions.find((item) => item.id === "h_years");
    if (!years || (years.kind === "min_years" && years.years < 3)) count += 5;
    const location = candidate.hardConditions.find((item) => item.id === "h_loc");
    if (!location || (location.kind === "location" && !location.cities.length)) count += 1;
    return count;
  };
  const shown = thinConditions(brief, passing as never);
  assert.deepEqual(shown.map((item) => [item.id, item.band]), [["h_years", "big"], ["h_loc", "small"]]);
  assert.equal(shown[0]!.widen, "2년 이상으로 낮추기");
});

test("what leaves the server has names, bands and the loosening, never numbers of people", () => {
  const shown = thinConditions(brief, ((candidate: typeof brief) => (candidate === brief ? 2 : 4)) as never);
  const json = JSON.stringify(shown);
  assert.ok(shown.length > 0);
  for (const item of shown) assert.deepEqual(Object.keys(item).sort(), ["band", "id", "label", "widen"]);
  assert.ok(!/"(gain|count|now|share|passing)"/.test(json));
  const text = thinNoticeText(parseThinConditions(json));
  assert.match(text, /^지금 조건에 맞는 분이 많지 않아요\. 조건을 조금 넓혀 볼까요\?/);
  assert.ok(!/%/.test(text));
});

test("each loosening changes one condition one step; a required criterion becomes important", () => {
  const byId = Object.fromEntries(relaxations(brief).map((item) => [item.id, item]));
  const years = byId.h_years!.apply(brief).hardConditions.find((item) => item.id === "h_years");
  assert.ok(years && years.kind === "min_years" && years.years === 2 && years.label === "UX 경력 2년 이상");
  const location = byId.h_loc!.apply(brief).hardConditions.find((item) => item.id === "h_loc");
  assert.ok(location && location.kind === "location" && location.cities.length === 0);
  const figma = byId.c_figma!.apply(brief).criteria.find((item) => item.id === "c_figma");
  assert.equal(figma?.requirement, "preferred");
  assert.equal(figma?.importance, 2, "필수 → 중요");
  assert.equal(byId.c_figma!.widen, "필수 조건에서 평가 기준(중요)으로 옮기기");
  assert.equal(byId.c_test, undefined, "criteria that are not required are not offered");
});
