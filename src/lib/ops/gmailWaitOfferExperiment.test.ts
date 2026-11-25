import assert from "node:assert/strict";
import test from "node:test";
import {
  assignGmailWaitOfferVariant,
  GMAIL_WAIT_OFFER_EXPERIMENT,
} from "@/lib/career/gmailWaitOfferExperiment";
import { buildGmailWaitOfferExperiment, GMAIL_WAIT_OFFER_METRICS, type GmailWaitOfferOutcomes } from "./gmailWaitOfferExperiment";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const origin = Date.parse("2026-11-24T00:00:00Z");
const at = (hour: number) => new Date(origin + hour * HOUR).toISOString();

/** The first ids that land on each side, so the test does not depend on a hard-coded hash. */
function idsFor(variant: "no_card" | "card", count: number) {
  const ids: string[] = [];
  for (let index = 0; ids.length < count; index += 1) {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    if (assignGmailWaitOfferVariant(id) === variant) ids.push(id);
  }
  return ids;
}
const exposure = (userId: string, hour: number, variant = assignGmailWaitOfferVariant(userId), experiment: string = GMAIL_WAIT_OFFER_EXPERIMENT) =>
  ({ user_id: userId, created_at: at(hour), meta_data: { experiment, variant } });
const none = (): GmailWaitOfferOutcomes => ({ connections: [], completions: [], actions: [] });
const detail = (summary: ReturnType<typeof buildGmailWaitOfferExperiment>, side: 0 | 1, label: string) =>
  summary.variants[side].summaryMetrics?.find((metric) => metric.label === label)?.detail;
const { completed, silent, connected } = GMAIL_WAIT_OFFER_METRICS;

test("each person keeps one side, and the two sides split about evenly", () => {
  const ids = Array.from({ length: 2000 }, (_, index) => `user-${index}`);
  assert.equal(assignGmailWaitOfferVariant("User-1 "), assignGmailWaitOfferVariant("user-1"));
  const cards = ids.filter((id) => assignGmailWaitOfferVariant(id) === "card").length;
  assert.ok(cards > 900 && cards < 1100, `card side got ${cards} of 2000`);
});

test("a person counts once from the first exposure ever, on their assigned side only", () => {
  const [a1, a2] = idsFor("no_card", 2);
  const [b1, b2, b3] = idsFor("card", 3);
  const outcomes = none();
  // b1 connects 2 hours after first seeing the card; the later exposure does not restart the clock.
  outcomes.connections.push({ userId: b1, at: at(2) });
  // b2 connects 30 hours later: there is no fixed window, so it still counts.
  outcomes.connections.push({ userId: b2, at: at(30) });
  // a1 connected before the exposure: not counted.
  outcomes.connections.push({ userId: a1, at: at(-1) });
  const summary = buildGmailWaitOfferExperiment({
    exposures: [
      exposure(a1, 0), exposure(a2, 0), exposure(b1, 0), exposure(b1, 10), exposure(b2, 0),
      // A row claiming the other side, or another experiment, is ignored.
      exposure(b3, 0, "no_card"), exposure(b3, 0, "card", "other_experiment"),
    ],
    outcomes,
    since: origin,
    now: origin + 2 * DAY,
  });
  const [a, b] = summary.variants;
  assert.equal(summary.status, "running");
  assert.deepEqual([a.sampleCount, b.sampleCount], [2, 2]);
  assert.equal(detail(summary, 0, connected), "0 / 2명");
  assert.equal(detail(summary, 1, connected), "2 / 2명");
  // Something after `now` is not counted yet.
  const early = buildGmailWaitOfferExperiment({ exposures: [exposure(b2, 0)], outcomes, since: origin, now: origin + DAY });
  assert.equal(detail(early, 1, connected), "0 / 1명");
});

test("a person first exposed before the chosen range is left out, not counted from a later exposure", () => {
  const [b1, b2] = idsFor("card", 2);
  const outcomes = none();
  outcomes.completions.push({ userId: b1, at: at(49) });
  const summary = buildGmailWaitOfferExperiment({
    // b1 was first seen on day 0; seen again on day 2 inside a range that starts on day 1.
    exposures: [exposure(b1, 0), exposure(b1, 48), exposure(b2, 30)],
    outcomes,
    since: origin + DAY,
    now: origin + 4 * DAY,
  });
  assert.equal(summary.variants[1].sampleCount, 1);
  assert.deepEqual([summary.variants[1].primary.numerator, summary.variants[1].primary.denominator], [0, 1]);
});

test("everyone counts from the start, the primary measure is a finished application, and staff are left out", () => {
  const [a1] = idsFor("no_card", 1);
  const [b1, b2] = idsFor("card", 2);
  const outcomes = none();
  outcomes.completions.push({ userId: b1, at: at(1) }, { userId: b2, at: at(1) });
  const summary = buildGmailWaitOfferExperiment({
    exposures: [exposure(a1, 0), exposure(b1, 0), exposure(b2, 0)],
    outcomes,
    excludedUserIds: new Set([b2]),
    since: origin,
    now: origin + 2 * HOUR,
  });
  assert.equal(summary.primaryMetricLabel, completed);
  assert.equal(summary.variants[1].sampleCount, 1);
  // Two hours in, both sides already have numbers.
  assert.equal(detail(summary, 0, completed), "0 / 1명");
  assert.equal(detail(summary, 1, completed), "1 / 1명");
  assert.deepEqual([summary.variants[1].primary.numerator, summary.variants[1].primary.denominator], [1, 1]);
  assert.equal(buildGmailWaitOfferExperiment({ exposures: [], outcomes: none(), since: origin, now: origin }).status, "awaiting_data");
});

test("a person left silently only when they did nothing and did not connect after the start", () => {
  const [a1, a2, a3, a4] = idsFor("no_card", 4);
  const outcomes = none();
  // a1 asked before the start only; a2 clicked "직접 지원" after it; a3 only connected Gmail; a4 did nothing.
  outcomes.actions.push({ userId: a1, at: at(-1) }, { userId: a2, at: at(3) });
  outcomes.connections.push({ userId: a3, at: at(5) });
  const summary = buildGmailWaitOfferExperiment({
    exposures: [exposure(a1, 0), exposure(a2, 0), exposure(a3, 0), exposure(a4, 0)],
    outcomes,
    since: origin,
    now: origin + 3 * DAY,
  });
  assert.equal(detail(summary, 0, silent), "2 / 4명");
});

test("each explanation names the count and how long each side has been watched", () => {
  const [a1] = idsFor("no_card", 1);
  const [b1] = idsFor("card", 1);
  const summary = buildGmailWaitOfferExperiment({
    exposures: [exposure(a1, 0), exposure(b1, 24)],
    outcomes: none(),
    since: origin,
    now: origin + 2 * DAY,
  });
  const text = summary.variants[0].summaryMetrics?.find((metric) => metric.label === silent)?.description ?? "";
  assert.match(text, /분모: 선택한 기간에 대신 지원을 처음 시작한 사람/);
  assert.match(text, /지켜본 기간: A 평균 2\.0일, B 평균 1\.0일/);
  // One side with no one yet is left out of the line rather than shown as zero.
  const one = buildGmailWaitOfferExperiment({ exposures: [exposure(a1, 0)], outcomes: none(), since: origin, now: origin + DAY });
  assert.match(one.variants[0].summaryMetrics?.[0].description ?? "", /지켜본 기간: A 평균 1\.0일 \(/);
});
