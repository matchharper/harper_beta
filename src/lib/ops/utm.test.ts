import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpsUtmLandingComposition,
  buildOpsUtmUrlQuery,
  parseOpsUtmGranularity,
  parseOpsUtmPeriod,
  parseOpsUtmUrlState,
} from "@/lib/ops/utm";

test("UTM landing composition uses recorded country, device, and KST time", () => {
  const composition = buildOpsUtmLandingComposition([
    {
      countryLang: "KR_ko",
      createdAt: "2026-09-07T00:30:00.000Z",
      isMobile: true,
    },
    {
      countryLang: "KR_en",
      createdAt: "2026-09-07T01:30:00.000Z",
      isMobile: false,
    },
    {
      countryLang: "US_en",
      createdAt: "2026-09-07T10:30:00.000Z",
      isMobile: true,
    },
    {
      countryLang: "ZZ_en",
      createdAt: "invalid",
      isMobile: null,
    },
  ]);

  assert.deepEqual(
    composition.countries.map(({ count, key, rate }) => ({ count, key, rate })),
    [
      { count: 2, key: "KR", rate: 0.5 },
      { count: 1, key: "US", rate: 0.25 },
      { count: 1, key: "unknown", rate: 0.25 },
    ]
  );
  assert.deepEqual(
    composition.devices.map(({ count, key, rate }) => ({ count, key, rate })),
    [
      { count: 2, key: "mobile", rate: 0.5 },
      { count: 1, key: "desktop", rate: 0.25 },
      { count: 1, key: "unknown", rate: 0.25 },
    ]
  );
  assert.deepEqual(
    composition.timeRanges.map(({ count, key, rate }) => ({
      count,
      key,
      rate,
    })),
    [
      { count: 2, key: "09-11", rate: 0.5 },
      { count: 1, key: "18-20", rate: 0.25 },
      { count: 1, key: "unknown", rate: 0.25 },
    ]
  );
});

test("UTM date controls accept supported values", () => {
  assert.equal(parseOpsUtmPeriod("7d"), "7d");
  assert.equal(parseOpsUtmPeriod("12m"), "12m");
  assert.equal(parseOpsUtmGranularity("week"), "week");
});

test("UTM date controls fall back safely", () => {
  assert.equal(parseOpsUtmPeriod("forever"), "30d");
  assert.equal(parseOpsUtmGranularity("month"), "day");
});

test("UTM URL state preserves source and drill-down filters", () => {
  const state = parseOpsUtmUrlState({
    granularity: "week",
    period: "3m",
    source: "Threads",
    utm_campaign: "creator_collab",
    utm_content: ["contents06", "ignored"],
    utm_medium: "social",
  });

  assert.deepEqual(state, {
    filters: {
      utm_medium: "social",
      utm_campaign: "creator_collab",
      utm_content: "contents06",
    },
    granularity: "week",
    period: "3m",
    source: "threads",
  });
  assert.deepEqual(buildOpsUtmUrlQuery(state, "  thread  "), {
    granularity: "week",
    period: "3m",
    source: "threads",
    utm_medium: "social",
    utm_campaign: "creator_collab",
    utm_content: "contents06",
    q: "thread",
  });
});

test("UTM URL state drops invalid or oversized filter values", () => {
  const state = parseOpsUtmUrlState({
    source: "not valid!",
    utm_campaign: "x".repeat(121),
    utm_medium: "   ",
  });

  assert.equal(state.source, null);
  assert.deepEqual(state.filters, {});
});
