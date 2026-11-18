import assert from "node:assert/strict";
import test from "node:test";
import {
  agentDailyRows, averageScore, costPerContact, gradedCount, periodDaysNewestFirst, postingQuality, runSearchCounts, searchCostPerContactable,
  type AgentDayPerson, type AgentDayPosting,
} from "./daily";

const person = (foundDay: string, patch: Partial<AgentDayPerson> = {}): AgentDayPerson => ({
  foundDay, source: "linkedin", status: "found", excludeReason: null, channel: null, sentAt: null, signalAt: null,
  clickedAt: null, signedUpAt: null, repliedAt: null, interested: false, connected: false, costUsd: 0, ...patch,
});

test("every day of the period gets a row, newest first (a quiet day shows as zeros)", () => {
  assert.deepEqual(periodDaysNewestFirst("2026-11-15", "2026-11-17"), ["2026-11-17", "2026-11-16", "2026-11-15"]);
  assert.deepEqual(periodDaysNewestFirst("2026-11-17", "2026-11-17"), ["2026-11-17"]);
});

test("검색 N곳 = the sites a run searched (attempted or paid for), less the ones skipped for the cap", () => {
  assert.deepEqual(
    runSearchCounts({ search_attempts_linkedin: 1, signal_cost_velog: 0.1, signal_cost_explore: 0.2, skipped_budget_x: 1, searched_x: 1, searched_member: 1 }),
    { searched: 3, skippedBudget: 1, searches: 0, newPeople: 0, knownPeople: 0 },
  );
  assert.deepEqual(runSearchCounts({}), { searched: 0, skippedBudget: 0, searches: 0, newPeople: 0, knownPeople: 0 });
  assert.deepEqual(
    runSearchCounts({ searches_linkedin: 12, searches_velog: 8, signal_found_linkedin: 3, signal_known_linkedin: 5 }),
    { searched: 0, skippedBudget: 0, searches: 20, newPeople: 3, knownPeople: 5 },
  );
});

test("days add up to the 합계, with 수치's own columns, and 비용 is the sum of its steps", () => {
  const { total, days } = agentDailyRows({
    from: "2026-11-16", to: "2026-11-17",
    people: [
      person("2026-11-17", { status: "sent", channel: "email", sentAt: "2026-11-17T02:00:00Z", clickedAt: "2026-11-17T05:00:00Z" }),
      person("2026-11-17", { status: "excluded", excludeReason: "no_email", lookupTried: true }),
      person("2026-11-17", { status: "excluded", excludeReason: "member", lookupTried: true, lookupFound: true }),
      person("2026-11-16", { status: "sent", channel: "email", sentAt: "2026-11-16T02:00:00Z", signedUpAt: "2026-11-17T01:00:00Z" }),
      // Outside the period: not counted.
      person("2026-11-10", { status: "sent", channel: "email", sentAt: "2026-11-10T02:00:00Z" }),
    ],
    spend: [
      { day: "2026-11-17", step: "lookup", usd: 0.12 }, { day: "2026-11-17", step: "match", usd: 0.01 },
      { day: "2026-11-16", step: "compose", usd: 0.002 }, { day: "2026-11-16", step: "search", usd: 9 },
    ],
    runs: [
      { day: "2026-11-17", kind: "daily", counts: { search_attempts_linkedin: 1, signal_cost_linkedin: 0.5 }, searchCostUsd: 0.5 },
      { day: "2026-11-17", kind: "import", counts: {}, searchCostUsd: 0 },
    ],
    searchPeople: [{ day: "2026-11-17", found: 2, contactable: 1 }, { day: "2026-11-10", found: 9, contactable: 9 }],
  });
  assert.deepEqual(days.map((row) => row.day), ["2026-11-17", "2026-11-16"]);
  const [today, yesterday] = days;
  assert.equal(today.numbers.found, 3);
  assert.equal(today.numbers.excluded, 2);
  assert.deepEqual(today.lookups, { tried: 2, found: 1 });
  assert.deepEqual(today.search, { found: 2, contactable: 1 });
  assert.equal(searchCostPerContactable(today), 0.5);
  assert.equal(searchCostPerContactable(yesterday_placeholder()), null);
  assert.equal(today.numbers.contacted, 1);
  assert.equal(today.numbers.clicked, 1);
  assert.deepEqual(today.costBy, { search: 0.5, lookup: 0.12, match: 0.01 });
  assert.equal(today.numbers.costUsd, 0.63);
  assert.deepEqual(today.run, { searchedSources: 1, skippedBudget: 0, files: 1, searches: 0, newPeople: 0, knownPeople: 0 });
  // A search step in the people's spend is ignored (searches come from the runs).
  assert.deepEqual(yesterday.costBy, { compose: 0.002 });
  assert.equal(yesterday.numbers.signedUp, 1);
  assert.equal(total.day, null);
  assert.equal(total.numbers.found, 4);
  assert.deepEqual(total.lookups, { tried: 2, found: 1 });
  assert.equal(total.numbers.contacted, 2);
  assert.equal(total.numbers.costUsd, 0.632);
  assert.deepEqual(total.search, { found: 2, contactable: 1 });
  assert.deepEqual(total.run, { searchedSources: 1, skippedBudget: 0, files: 1, searches: 0, newPeople: 0, knownPeople: 0 });
});

function yesterday_placeholder() {
  return { costBy: { search: 1 }, search: { found: 3, contactable: 0 } };
}

test("연락 1명당 비용 only when someone was contacted", () => {
  assert.equal(costPerContact({ costUsd: 0.63, contacted: 3 }), 0.21);
  assert.equal(costPerContact({ costUsd: 0.63, contacted: 0 }), null);
});

test("추천 품질: only mailed postings count, with the average score, the grader's reads and Ops's calls by day", () => {
  const at = "2026-11-17T05:00:00Z";
  const graded = (grade: "good" | "unsure" | "poor", value?: "right" | "wrong", score?: number): AgentDayPosting => ({
    score, review: { grade, reason: "", at }, verdict: value ? { value, by: "user-1", at } : undefined,
  });
  const sent = (foundDay: string, postings: AgentDayPosting[], patch: Partial<AgentDayPerson> = {}) =>
    person(foundDay, { status: "sent", channel: "email", sentAt: `${foundDay}T02:00:00Z`, postings, ...patch });
  const { total, days } = agentDailyRows({
    from: "2026-11-16", to: "2026-11-17",
    people: [
      sent("2026-11-17", [graded("good", "right", 80), graded("poor", "wrong", 60), graded("unsure", "right", 71)], { interested: true }),
      // Picked before scores and grades were kept: counted as a mailed posting only.
      sent("2026-11-17", [{}, {}]),
      sent("2026-11-16", [graded("good", "wrong", 90), graded("good", undefined, 70)], { connected: true }),
      // Not mailed (waiting, or never): its postings are not in 보낸 공고.
      person("2026-11-17", { status: "approved", postings: [graded("poor", "wrong", 10)] }),
      person("2026-11-16", { status: "no_fit" }),
    ],
    spend: [{ day: "2026-11-17", step: "review", usd: 0.004 }], runs: [],
  });
  const [today, yesterday] = days;
  assert.deepEqual(today.quality, {
    postings: 5, scored: 3, scoreSum: 211, graded: { good: 1, unsure: 1, poor: 1 }, verdicts: { right: 2, wrong: 1 }, compared: 2, agreed: 2,
  });
  assert.equal(averageScore(today.quality), 70);
  assert.equal(gradedCount(today.quality), 3);
  assert.deepEqual(today.costBy, { review: 0.004 });
  assert.equal(today.numbers.interested, 1);
  assert.deepEqual(yesterday.quality, {
    postings: 2, scored: 2, scoreSum: 160, graded: { good: 2, unsure: 0, poor: 0 }, verdicts: { right: 0, wrong: 1 }, compared: 1, agreed: 0,
  });
  // The 합계 is the days together.
  assert.deepEqual(total.quality, {
    postings: 7, scored: 5, scoreSum: 371, graded: { good: 3, unsure: 1, poor: 1 }, verdicts: { right: 2, wrong: 2 }, compared: 3, agreed: 2,
  });
  assert.equal(averageScore(total.quality), 74);
  assert.equal(total.numbers.connected, 1);
});

test("추천 품질 with nothing mailed: no postings, no average", () => {
  const quality = postingQuality([person("2026-11-17", { status: "approved", postings: [{ score: 90 }] })]);
  assert.equal(quality.postings, 0);
  assert.equal(averageScore(quality), null);
  assert.equal(gradedCount(quality), 0);
  // Stored JSON may carry anything: a score that is not a number and an unknown grade are left out.
  const odd = postingQuality([person("2026-11-17", {
    status: "sent", channel: "email", sentAt: "2026-11-17T02:00:00Z",
    postings: [{ score: Number.NaN, review: { grade: "great" as never, reason: "", at: "" } }],
  })]);
  assert.deepEqual({ postings: odd.postings, scored: odd.scored, graded: gradedCount(odd) }, { postings: 1, scored: 0, graded: 0 });
});
