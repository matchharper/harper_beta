import assert from "node:assert/strict";
import test from "node:test";
import { buildJobsOneScreenExperiment, type JobsOneScreenBrowserRow } from "./jobsOneScreenExperiment";
import { JOBS_ONESCREEN_AB_SQL, JOBS_ONESCREEN_COMPANY_SQL } from "./jobsOneScreenExperiment.sql";

const row = (patch: Partial<JobsOneScreenBrowserRow>): JobsOneScreenBrowserRow => ({
  anonymous_id: "b1",
  arm: "A",
  first_at: "2026-11-26T01:00:00.000Z",
  talk_click: false,
  card_account: false,
  card_name: false,
  card_material: false,
  card_consent: false,
  card_submit_click: false,
  similar_open: false,
  signed_up: false,
  had_account: false,
  submitted: false,
  intro_new: false,
  intro_any: false,
  similar_requested: false,
  emails: [],
  ...patch,
});

const metric = (summary: ReturnType<typeof buildJobsOneScreenExperiment>, arm: 0 | 1, prefix: string) =>
  summary.variants[arm].summaryMetrics?.find((item) => item.label.startsWith(prefix));

test("each step shows who stayed and who left out of the step before, for both arms", () => {
  const summary = buildJobsOneScreenExperiment({
    companyName: "Acme",
    excludeEmail: () => false,
    rows: [
      row({ anonymous_id: "a1", talk_click: true, signed_up: true, submitted: true, intro_new: true, intro_any: true }),
      row({ anonymous_id: "a2", talk_click: true }),
      row({ anonymous_id: "a3" }),
      row({ anonymous_id: "a4", had_account: true, intro_any: true }),
      row({ anonymous_id: "b1", arm: "B", card_account: true, signed_up: true, submitted: true }),
      row({ anonymous_id: "b2", arm: "B", similar_requested: true, similar_open: true }),
    ],
  });
  assert.equal(summary.title, "Acme 링크드인 공고화면");
  // The member (a4) is not part of the sign-up funnel: a row of its own.
  assert.equal(summary.variants[0].sampleCount, 3);
  assert.equal(summary.variants[1].sampleCount, 2);
  assert.equal(metric(summary, 0, "1.")?.value, 3);
  assert.equal(metric(summary, 0, "1.")?.format, "count");
  assert.equal(metric(summary, 0, "2.")?.value, 2 / 3);
  assert.equal(metric(summary, 0, "2.")?.detail, "2 남음 · 1 빠짐 (33.3%)");
  assert.equal(metric(summary, 0, "3.")?.value, 0.5);
  assert.equal(metric(summary, 0, "3.")?.detail, "1 남음 · 1 빠짐 (50.0%)");
  assert.equal(metric(summary, 0, "5.")?.label, "5. Acme에 소개가 나감");
  assert.equal(metric(summary, 0, "5.")?.value, 1);
  assert.equal(metric(summary, 0, "따로: 이미 회원")?.value, 1);
  assert.equal(metric(summary, 0, "따로: 이미 회원")?.detail, "그중 소개 1");
  assert.deepEqual(summary.variants[0].primary, { numerator: 1, denominator: 3, rate: 1 / 3 });
  // B's card account button counts as pressing the sign-up button.
  assert.equal(metric(summary, 1, "2.")?.value, 0.5);
  assert.equal(metric(summary, 1, "따로: 비슷한")?.value, 0.5);
  assert.deepEqual(summary.variants[1].primary, { numerator: 1, denominator: 2, rate: 0.5 });
  assert.equal(summary.status, "running");
});

test("steps arm A does not have show 없음, never 0", () => {
  const summary = buildJobsOneScreenExperiment({ companyName: "Acme", excludeEmail: () => false, rows: [row({})] });
  const similar = metric(summary, 0, "따로: 비슷한");
  assert.equal(similar?.value, null);
  assert.equal(similar?.displayValue, "없음");
  assert.ok(summary.variants[0].metrics.every((item) => item.displayValue === "없음" && item.value === null));
  assert.ok(summary.variants[1].metrics.every((item) => item.displayValue === undefined));
  assert.equal(summary.status, "observing");
});

test("excluded addresses and unknown arms are left out", () => {
  const summary = buildJobsOneScreenExperiment({
    companyName: null,
    excludeEmail: (email) => email.endsWith("@staff.test"),
    rows: [
      row({ anonymous_id: "x1", emails: ["someone@staff.test"], signed_up: true }),
      row({ anonymous_id: "x2", arm: "C" }),
      row({ anonymous_id: "x3", first_at: "not a date" }),
    ],
  });
  assert.equal(summary.variants[0].sampleCount, 0);
  assert.equal(summary.variants[1].sampleCount, 0);
  assert.equal(summary.status, "awaiting_data");
  assert.equal(summary.title, "링크드인 공고화면 A/B");
});

test("the queries take the workspaces as a parameter and name no company", () => {
  for (const sql of [JOBS_ONESCREEN_AB_SQL, JOBS_ONESCREEN_COMPANY_SQL]) {
    assert.match(sql, /string_to_array\(\$1::text, ','\)::uuid\[\]/);
    assert.doesNotMatch(sql, /[0-9a-f]{8}-[0-9a-f]{4}-/);
  }
  assert.match(JOBS_ONESCREEN_AB_SQL, /\$2::timestamptz/);
  // A reserved word as a CTE name breaks the whole query.
  assert.doesNotMatch(JOBS_ONESCREEN_AB_SQL, /\bsimilar as \(/);
});

test("a one-screen account that never submitted still counts as a sign-up, timed by auth.users", () => {
  const first = "2026-11-26T01:00:00.000Z";
  const summary = buildJobsOneScreenExperiment({
    companyName: "Acme",
    excludeEmail: (email) => email.endsWith("@staff.test"),
    pendingAccounts: new Map([
      ["u-new", { createdAt: "2026-11-26T01:05:00.000Z", email: "new@example.com" }],
      ["u-old", { createdAt: "2026-10-01T00:00:00.000Z", email: "old@example.com" }],
      ["u-staff", { createdAt: "2026-11-26T01:05:00.000Z", email: "me@staff.test" }],
    ]),
    rows: [
      row({ anonymous_id: "b1", arm: "B", first_at: first, card_account: true, pending_user_ids: ["u-new"] }),
      row({ anonymous_id: "b2", arm: "B", first_at: first, pending_user_ids: ["u-old"] }),
      row({ anonymous_id: "b3", arm: "B", first_at: first, pending_user_ids: ["u-staff"] }),
      row({ anonymous_id: "b4", arm: "B", first_at: first, pending_user_ids: ["u-unknown"] }),
    ],
  });
  // b3 is left out by its auth address; b2 had an account before (a member); b4's account could not be read.
  assert.equal(summary.variants[1].sampleCount, 2);
  assert.equal(metric(summary, 1, "3.")?.detail, "1 남음 · 0 빠짐 (0.0%)");
  assert.equal(metric(summary, 1, "따로: 이미 회원")?.value, 1);
  assert.equal(metric(summary, 1, "따로: 이미 회원")?.detail, "그중 소개 0");
  // Without auth.users the same rows are viewers only.
  const without = buildJobsOneScreenExperiment({
    companyName: "Acme",
    excludeEmail: () => false,
    rows: [row({ anonymous_id: "b1", arm: "B", pending_user_ids: ["u-new"] })],
  });
  assert.equal(without.variants[1].primary.numerator, 0);
});

test("a later step reached without the earlier one recorded counts for both, so 남음 + 빠짐 is the step before", () => {
  const summary = buildJobsOneScreenExperiment({
    companyName: "Acme",
    excludeEmail: () => false,
    rows: [
      row({ anonymous_id: "a1", talk_click: true, signed_up: true }),
      row({ anonymous_id: "a2", talk_click: true }),
      row({ anonymous_id: "a3", signed_up: true }),
    ],
  });
  assert.equal(metric(summary, 0, "2.")?.detail, "3 남음 · 0 빠짐 (0.0%)");
  assert.equal(metric(summary, 0, "3.")?.detail, "2 남음 · 1 빠짐 (33.3%)");
  // An intro with no form recorded still sits inside 4 (and 3, 2).
  const intro = buildJobsOneScreenExperiment({
    companyName: "Acme",
    excludeEmail: () => false,
    rows: [row({ anonymous_id: "a1", intro_new: true }), row({ anonymous_id: "a2" })],
  });
  const kept = ["2.", "3.", "4.", "5."].map((step) => metric(intro, 0, step)?.detail);
  assert.deepEqual(kept, ["1 남음 · 1 빠짐 (50.0%)", "1 남음 · 0 빠짐 (0.0%)", "1 남음 · 0 빠짐 (0.0%)", "1 남음 · 0 빠짐 (0.0%)"]);
});

test("each summary row has one description for both arms, since the table shows the first arm's", () => {
  const summary = buildJobsOneScreenExperiment({
    companyName: "Acme",
    excludeEmail: () => false,
    rows: [row({ anonymous_id: "a1" }), row({ anonymous_id: "b1", arm: "B" })],
  });
  const [a, b] = summary.variants;
  assert.deepEqual(
    a.summaryMetrics?.map((item) => [item.label, item.description]),
    b.summaryMetrics?.map((item) => [item.label, item.description])
  );
  assert.match(metric(summary, 0, "따로: 비슷한")?.description ?? "", /B에만 있어요/);
  assert.match(summary.caveat ?? "", /4·5단계/);
});

test("the query folds a Safari hop into the first browser and reads every per-browser fact once", () => {
  assert.match(JOBS_ONESCREEN_AB_SQL, /metadata->>'fromVisitor'/);
  assert.match(JOBS_ONESCREEN_AB_SQL, /not exists \(select 1 from hops h where h\.alias = v\.anonymous_id\)/);
  assert.match(JOBS_ONESCREEN_AB_SQL, /o\.event_type in \('jobs_login_step', 'job_onescreen_step'\)/);
  assert.match(JOBS_ONESCREEN_AB_SQL, /pending_user_ids/);
  // No per-browser subqueries in the final select (they made the query grow with browsers squared).
  const finalSelect = JOBS_ONESCREEN_AB_SQL.slice(JOBS_ONESCREEN_AB_SQL.lastIndexOf("\nselect b.anonymous_id"));
  assert.doesNotMatch(finalSelect, /exists \(|array\(/);
});
