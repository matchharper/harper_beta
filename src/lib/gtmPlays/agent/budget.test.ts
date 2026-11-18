import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_TALLY, budgetOptions, budgetPlanPrompt, budgetSearches, diceAllocations, gammaDraw, readBudgetAnswer, readStoredBudgetPlan,
  rollBudgetDice, searchBudgetNow, type BudgetPlan, type BudgetTally,
} from "./budget";

/** A seeded random (mulberry32), so the dice are the same on every run of the tests. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPTIONS = budgetOptions({ turnedOn: ["linkedin", "hn"], layoffSearch: true });
const tally = (patch: Partial<BudgetTally>): BudgetTally => ({ ...EMPTY_TALLY, runs: 5, ...patch });
const plan = (amounts: Record<string, number>, totalUsd = 2.4): BudgetPlan => ({
  at: "2026-11-18T00:00:00.000Z", totalUsd, dice: {}, note: "", by: "agent",
  allocations: OPTIONS.map((option) => ({ option: option.id, usd: amounts[option.id] ?? 0, why: "" })),
});

test("the options: each turned-on place, LinkedIn's layoff method when on, then the open web", () => {
  assert.deepEqual(OPTIONS.map((option) => option.id), ["linkedin", "linkedin:layoff", "hn", "explore"]);
  assert.deepEqual(OPTIONS.map((option) => option.search), ["linkedin", "linkedin", "hn", "explore"]);
  assert.deepEqual(budgetSearches(OPTIONS), ["linkedin", "hn", "explore"]);
  const noLayoff = budgetOptions({ turnedOn: ["linkedin", "explore", "okky"], layoffSearch: false });
  assert.deepEqual(noLayoff.map((option) => option.id), ["linkedin", "okky", "explore"]);
  assert.match(noLayoff[1].about, /OKKY/);
});

test("Gamma draws have the right mean", () => {
  const random = seeded(7);
  for (const [shape, rate] of [[1, 1], [3, 2], [0.5, 1], [21, 4]] as const) {
    const n = 20_000;
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += gammaDraw(shape, rate, random);
    assert.ok(Math.abs(sum / n - shape / rate) < 0.05 * (shape / rate) + 0.02, `${shape}/${rate}: ${sum / n}`);
  }
});

test("the dice: shares add up to 1, good numbers draw more, little data still wins sometimes", () => {
  const tallies = {
    linkedin: tally({ spentUsd: 10, fits: 30 }),
    "linkedin:layoff": tally({ spentUsd: 10, fits: 2 }),
    hn: tally({ spentUsd: 2, fits: 2 }),
  };
  const random = seeded(42);
  const rolls = Array.from({ length: 2_000 }, () => rollBudgetDice(OPTIONS, tallies, random));
  for (const roll of rolls.slice(0, 20)) {
    assert.ok(Math.abs(Object.values(roll).reduce((a, b) => a + b, 0) - 1) < 0.01);
  }
  const mean = (id: string) => rolls.reduce((sum, roll) => sum + roll[id], 0) / rolls.length;
  // 3 per dollar over $10 beats 0.2 per dollar over $10.
  assert.ok(mean("linkedin") > 3 * mean("linkedin:layoff"));
  // The open web has no data: it comes out on top on some days (tested), not on most.
  const topShare = rolls.filter((roll) => Object.entries(roll).sort((a, b) => b[1] - a[1])[0][0] === "explore").length / rolls.length;
  assert.ok(topShare > 0.02 && topShare < 0.5, String(topShare));
  // The layoff method's 2 for $10 is a lot of data saying "little": it seldom tops the day.
  const layoffTop = rolls.filter((roll) => Object.entries(roll).sort((a, b) => b[1] - a[1])[0][0] === "linkedin:layoff").length / rolls.length;
  assert.ok(layoffTop < 0.01, String(layoffTop));
});

test("the dice split in dollars never goes over the total", () => {
  const allocations = diceAllocations(OPTIONS, { linkedin: 0.5, "linkedin:layoff": 0.2, hn: 0.1, explore: 0.2 }, 2.4);
  assert.deepEqual(allocations.map((item) => item.usd), [1.2, 0.48, 0.24, 0.48]);
  assert.ok(allocations.reduce((sum, item) => sum + item.usd, 0) <= 2.4 + 1e-9);
});

test("the model's answer: unknown options dropped, missing ones 0, over the total scaled down, nothing usable is null", () => {
  const read = readBudgetAnswer({
    allocations: [
      { option: "linkedin", usd: 2, why: "잘 나와요" }, { option: "hn", usd: -1, why: "x" }, { option: "nowhere", usd: 5, why: "" },
      { option: "explore", usd: 2, why: "새 곳\n<시험>" },
    ],
    note: "오늘은 링크드인과 열린 웹",
  }, OPTIONS, 2.4);
  assert.ok(read);
  assert.deepEqual(read.allocations.map((item) => [item.option, item.usd]), [["linkedin", 1.2], ["linkedin:layoff", 0], ["hn", 0], ["explore", 1.2]]);
  assert.equal(read.allocations[3].why, "새 곳 ‹시험›");
  assert.equal(read.note, "오늘은 링크드인과 열린 웹");
  assert.equal(readBudgetAnswer({ allocations: [{ option: "linkedin", usd: 0, why: "" }], note: "" }, OPTIONS, 2.4), null);
  assert.equal(readBudgetAnswer("nope", OPTIONS, 2.4), null);
});

test("a kept split reads back; a malformed one is planned again", () => {
  const kept = { ...plan({ linkedin: 1, hn: 0.4 }), dice: { linkedin: 0.6, hn: 0.4 }, by: "dice", error: "timeout" };
  assert.deepEqual(readStoredBudgetPlan(JSON.parse(JSON.stringify(kept))), kept);
  assert.equal(readStoredBudgetPlan({ totalUsd: "x", allocations: [] }), null);
  assert.equal(readStoredBudgetPlan(null), null);
});

test("one search's budget: its options, plus its share of what finished searches left", () => {
  const split = plan({ linkedin: 0.8, "linkedin:layoff": 0.4, hn: 0.4, explore: 0.8 });
  // First search: nothing finished yet.
  assert.deepEqual(searchBudgetNow({ plan: split, options: OPTIONS, search: "linkedin", spent: {}, done: new Set() }), { usd: 1.2, layoffUsd: 0.4 });
  // LinkedIn used all of it; HN used $0.1 of $0.4: the open web gets the $0.3 too.
  const afterHn = { plan: split, options: OPTIONS, search: "explore", spent: { linkedin: 1.2, hn: 0.1 }, done: new Set(["linkedin", "hn"]) };
  assert.deepEqual(searchBudgetNow(afterHn), { usd: 1.1, layoffUsd: 0 });
  // HN first ($0.3 left), then LinkedIn took its share of it ($0.3 × 1.2/2.0 = $0.18); the open web gets the rest.
  assert.deepEqual(searchBudgetNow({ plan: split, options: OPTIONS, search: "linkedin", spent: { hn: 0.1 }, done: new Set(["hn"]) }),
    { usd: 1.38, layoffUsd: 0.46 });
  assert.deepEqual(searchBudgetNow({ plan: split, options: OPTIONS, search: "explore", spent: { hn: 0.1, linkedin: 1.38 }, done: new Set(["hn", "linkedin"]) }),
    { usd: 0.92, layoffUsd: 0 });
  // A search the split gave nothing gets nothing.
  assert.deepEqual(searchBudgetNow({ plan: plan({ linkedin: 2 }), options: OPTIONS, search: "hn", spent: {}, done: new Set() }), { usd: 0, layoffUsd: 0 });
});

test("the prompt: options, what their money brought (or no data yet), the last split, today's dice", () => {
  const text = budgetPlanPrompt({
    day: "2026-11-18", totalUsd: 2.4, options: OPTIONS,
    tallies: { linkedin: tally({ givenUsd: 6, spentUsd: 5.5, people: 40, fits: 12, sent: 9, clicked: 2, signedUp: 1 }) },
    dice: { linkedin: 0.5, "linkedin:layoff": 0.1, hn: 0.15, explore: 0.25 },
    lastPlan: { day: "2026-11-17", plan: { ...plan({ linkedin: 1.4, explore: 1 }), note: "링크드인 위주" } },
  });
  assert.match(text, /Total search budget: \$2\.40/);
  assert.match(text, /- linkedin: 5 runs · given \$6\.00 · spent \$5\.50 · people kept 40 · with a fitting posting 12 · mailed 9/);
  assert.match(text, /- hn: no data yet/);
  assert.match(text, /The last split \(2026-11-17, total \$2\.40\):\n- linkedin: \$1\.40/);
  assert.match(text, /Note: 링크드인 위주/);
  assert.match(text, /- explore: 25%/);
});
