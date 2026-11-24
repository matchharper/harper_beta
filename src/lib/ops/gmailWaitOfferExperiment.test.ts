import assert from "node:assert/strict";
import test from "node:test";
import {
  assignGmailWaitOfferVariant,
  GMAIL_WAIT_OFFER_EXPERIMENT,
} from "@/lib/career/gmailWaitOfferExperiment";
import { buildGmailWaitOfferExperiment, type GmailWaitOfferOutcomes } from "./gmailWaitOfferExperiment";

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
const none = (): GmailWaitOfferOutcomes => ({ connections: [], submissions: [], emailCodeStops: [], reviewForms: [], formAnswers: [] });
const detail = (summary: ReturnType<typeof buildGmailWaitOfferExperiment>, side: 0 | 1, label: string) =>
  summary.variants[side].summaryMetrics?.find((metric) => metric.label === label)?.detail;

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
  // b2 connects 30 hours later: outside the 24-hour window.
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
  assert.deepEqual([a.primary.numerator, a.primary.denominator], [0, 2]);
  assert.deepEqual([b.primary.numerator, b.primary.denominator], [1, 2]);
  assert.equal(detail(summary, 1, "24시간 안 Gmail 연결"), "1 / 2명");
});

test("a person first exposed before the chosen range is left out, not counted from a later exposure", () => {
  const [b1, b2] = idsFor("card", 2);
  const outcomes = none();
  outcomes.connections.push({ userId: b1, at: at(49) });
  const summary = buildGmailWaitOfferExperiment({
    // b1 was first seen on day 0 and did not connect; seen again on day 2 inside a range that starts on day 1.
    exposures: [exposure(b1, 0), exposure(b1, 48), exposure(b2, 30)],
    outcomes,
    since: origin + DAY,
    now: origin + 4 * DAY,
  });
  assert.equal(summary.variants[1].sampleCount, 1);
  assert.deepEqual([summary.variants[1].primary.numerator, summary.variants[1].primary.denominator], [0, 1]);
});

test("each measure counts only people whose window has passed, and staff are left out", () => {
  const [a1] = idsFor("no_card", 1);
  const [b1, b2] = idsFor("card", 2);
  const outcomes = none();
  outcomes.connections.push({ userId: b1, at: at(1) }, { userId: b2, at: at(1) });
  outcomes.submissions.push({ userId: b1, at: at(2) });
  const early = buildGmailWaitOfferExperiment({
    exposures: [exposure(a1, 0), exposure(b1, 0), exposure(b2, 0)],
    outcomes,
    excludedUserIds: new Set([b2]),
    since: origin,
    now: origin + 2 * HOUR,
  });
  assert.equal(early.variants[1].sampleCount, 1);
  // Two hours in, no one's day or week has passed yet.
  assert.equal(detail(early, 1, "24시간 안 Gmail 연결"), "0 / 0명");
  assert.equal(detail(early, 1, "7일 안 웹 제출 성공"), "0 / 0명");
  const later = buildGmailWaitOfferExperiment({ exposures: [exposure(a1, 0), exposure(b1, 0)], outcomes, since: origin, now: origin + 8 * DAY });
  assert.equal(detail(later, 1, "24시간 안 Gmail 연결"), "1 / 1명");
  assert.equal(detail(later, 1, "7일 안 웹 제출 성공"), "1 / 1명");
  assert.equal(buildGmailWaitOfferExperiment({ exposures: [], outcomes: none(), since: origin, now: origin }).status, "awaiting_data");
});

test("a code stop counts only when nothing was submitted after it, and a form answer must name that form", () => {
  const [a1, a2] = idsFor("no_card", 2);
  const outcomes = none();
  // a1 stopped at a code at hour 5 and Harper finished the application at hour 6; a2 stopped and never finished.
  outcomes.emailCodeStops.push({ userId: a1, at: at(5) }, { userId: a2, at: at(5) });
  outcomes.submissions.push({ userId: a1, at: at(6) }, { userId: a2, at: at(1) });
  // a1 answered its review form; a2 only answered a different form after its review form arrived.
  outcomes.reviewForms.push({ userId: a1, at: at(1), formId: "10" }, { userId: a2, at: at(1), formId: "20" });
  outcomes.formAnswers.push({ userId: a1, at: at(2), formIds: ["10"] }, { userId: a2, at: at(2), formIds: ["99"] });
  const summary = buildGmailWaitOfferExperiment({ exposures: [exposure(a1, 0), exposure(a2, 0)], outcomes, since: origin, now: origin + 8 * DAY });
  assert.equal(detail(summary, 0, "메일 인증 코드에서 끝내 못 냄"), "1 / 2명");
  assert.equal(detail(summary, 0, "확인 폼에 답함"), "1 / 2명");
});
