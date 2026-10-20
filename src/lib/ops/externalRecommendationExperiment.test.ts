import assert from "node:assert/strict";
import test from "node:test";
import {
  externalVariant,
  EXPERIMENT,
} from "../externalRecommendationsV2/contract";
import { EXTERNAL_MEASUREMENT_VERSION } from "../externalRecommendationsV2/measurement";
import {
  buildExternalRecommendationExperiment as build,
  type ExternalExperimentRun as Run,
  type ExternalExperimentRecommendation as Rec,
  type ExternalExperimentReceipt,
} from "./externalRecommendationExperiment";
const day = 86400000;
const now = Date.parse("2026-11-01T00:00:00Z");
const iso = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();
const users = (variant: string) =>
  Array.from({ length: 30 }, (_, i) => `synthetic-${i}`).filter(
    (id) => externalVariant(id) === variant
  );
const [a, a2, a3] = users("control");
const [b] = users("v2");
function run(
  id: string,
  user: string,
  ago = 10,
  patch: Partial<Run> = {}
): Run {
  return {
    id,
    talent_id: user,
    variant: externalVariant(user),
    experiment: EXPERIMENT,
    surface: "web",
    status: "completed",
    created_at: iso(ago),
    finished_at: new Date(now - ago * day + 20_000).toISOString(),
    metrics: { measurementVersion: EXTERNAL_MEASUREMENT_VERSION },
    ...patch,
  };
}
function rec(r: Run, clickAgo: number): Rec {
  return {
    id: `rec-${r.id}`,
    talent_id: r.talent_id,
    external_experiment_run_id: r.id,
    recommended_at: r.finished_at!,
    clicked_at: iso(clickAgo),
    viewed_at: iso(clickAgo),
    feedback: null,
    feedback_at: null,
  };
}
function summary(
  runs: Run[],
  recommendations: Rec[] = [],
  receipts: ExternalExperimentReceipt[] = [],
  excludedUserIds = new Set<string>()
) {
  return build({
    runs,
    recommendations,
    receipts,
    excludedUserIds,
    now,
    surface: "web",
  });
}
const metric = (s: ReturnType<typeof summary>, label: string) =>
  s.variants[0].metrics.find((m) => m.label === label)?.value;

test("one unit per user: repeat requests cannot rescue a failed first request; immature users wait", () => {
  const failed = run("failed", a, 10, { status: "failed" });
  const later = run("later", a, 9);
  const empty = run("empty", a2);
  const waiting = run("waiting", a3, 2);
  const v2 = run("v2", b);
  const s = summary(
    [later, failed, empty, waiting, v2],
    [rec(later, 8), rec(waiting, 1), rec(v2, 9)]
  );
  assert.deepEqual(s.variants[0].primary, {
    numerator: 0,
    denominator: 2,
    rate: 0,
  });
  assert.equal(s.variants[0].sampleCount, 3);
  assert.equal(s.variants[1].primary.rate, 1);
  assert.equal(s.conclusion.state, "descriptive");
  assert.equal(s.conclusion.leaderVariantId, null);
});
test("exclude old implementations, internal accounts, cross-surface and forced cohorts", () => {
  const s = summary(
    [
      run("old", a, 10, { metrics: {} }),
      run("internal", a2),
      run("worker", a3, 10, { surface: "worker" }),
      run("forced", b, 10, { variant: "control" }),
    ],
    [],
    [],
    new Set([a2])
  );
  assert.equal(s.status, "awaiting_data");
  assert.equal(s.variants[0].sampleCount, 0);
  assert.equal(s.variants[1].sampleCount, 0);
});
test("only first-run clicks inside seven days count, never foreign-user attribution", () => {
  const r = run("r", a);
  const r2 = run("r2", a2);
  const r3 = run("r3", a3);
  const s = summary(
    [r, r2, r3],
    [rec(r, 9), rec(r2, 2), { ...rec(r3, 9), talent_id: b }]
  );
  assert.equal(s.variants[0].primary.numerator, 1);
  assert.equal(s.variants[0].primary.denominator, 3);
});
test("unknown or absent costs stay missing, not free; priced Worker/API receipts combine once", () => {
  const r = run("r", a);
  const unknown = summary(
    [r],
    [],
    [{ request_id: "r", estimated_cost_usd: 0, cost_status: "unpriced" }]
  );
  assert.equal(metric(unknown, "API 비용 소계 · 확인 가능분"), null);
  assert.equal(metric(unknown, "가격 미확인 호출·시도"), 1);
  assert.equal(metric(summary([r]), "API 비용 소계 · 확인 가능분"), null);
  const combined = summary(
    [
      run("r", a, 10, {
        metrics: {
          measurementVersion: EXTERNAL_MEASUREMENT_VERSION,
          externalWorkerCostRecords: [
            { pricingAvailable: true, estimatedCostUsd: 0.03 },
            { pricingAvailable: false, estimatedCostUsd: 0 },
          ],
        },
      }),
    ],
    [],
    [{ request_id: "r", estimated_cost_usd: 0.02, cost_status: "estimated" }]
  );
  assert.equal(metric(combined, "API 비용 소계 · 확인 가능분"), 0.05);
  assert.equal(metric(combined, "가격 미확인 호출·시도"), 1);
});
test("latency includes terminal failures, incomplete runs are visible separately", () => {
  const s = summary([
    run("ok", a),
    run("fail", a2, 10, {
      status: "failed",
      finished_at: new Date(now - 10 * day + 60_000).toISOString(),
    }),
    run("stuck", a3, 10, { status: "running", finished_at: null }),
  ]);
  assert.equal(metric(s, "실행→종료 p95 · 실패 포함"), 60);
  assert.equal(metric(s, "진행 30분 초과"), 1);
  assert.equal(metric(s, "실패율 · 종료 실행 기준"), 0.5);
});

test("summary compares five metrics with terminal-run averages and recommendation feedback", () => {
  const done = run("done", a);
  const failed = run("failed", a2, 10, {
    status: "failed",
    finished_at: new Date(now - 10 * day + 60_000).toISOString(),
  });
  const active = run("active", a3, 10, {
    status: "running",
    finished_at: null,
  });
  const recommendations = ["like", "positive", "dislike", null].map(
    (feedback, i) => ({
      ...rec(done, 9),
      id: `feedback-${i}`,
      feedback,
    })
  );
  const result = summary([done, failed, active], recommendations, [
    { request_id: done.id, estimated_cost_usd: 0.02, cost_status: "priced" },
    { request_id: failed.id, estimated_cost_usd: 0.04, cost_status: "priced" },
    { request_id: active.id, estimated_cost_usd: 10, cost_status: "priced" },
  ]);
  const metrics = result.variants[0].summaryMetrics!;
  assert.equal(metrics.length, 5);
  assert.deepEqual(
    metrics.map((m) => m.value),
    [0.03, 40, 0.75, 2, 2]
  );
  assert.equal(metrics[3].displayValue, "2.00배");
  assert.deepEqual(
    result.variants[1].summaryMetrics!.map((m) => m.value),
    Array(5).fill(null)
  );
});

test("zero dislikes, absent receipts and empty completed runs are explicit", () => {
  const r = run("r", a);
  const empty = summary([r]).variants[0].summaryMetrics!;
  assert.deepEqual(
    empty.map((m) => m.value),
    [null, 20, null, null, 0]
  );
  const liked = summary([r], [{ ...rec(r, 9), feedback: "like" }]).variants[0]
    .summaryMetrics!;
  assert.equal(liked[2].value, 1);
  assert.equal(liked[3].value, null);
  assert.equal(liked[3].displayValue, "싫어요 없음");
});

test("all surfaces pool run metrics and feedback while counting each user once", () => {
  const web = run("web", a);
  const worker = run("worker", a, 9, { surface: "worker" });
  const daily = run("daily", b, 8, { surface: "daily" });
  const excluded = run("excluded", a2, 8, { surface: "daily" });
  const old = run("old", a3, 8, { surface: "worker", metrics: {} });
  const result = build({
    runs: [web, worker, daily, excluded, old],
    recommendations: [
      { ...rec(web, 9), feedback: "like" },
      { ...rec(worker, 8), feedback: "dislike" },
      { ...rec(daily, 7), feedback: "like" },
      { ...rec(excluded, 7), feedback: "like" },
      { ...rec(old, 7), feedback: "like" },
    ],
    receipts: [
      { request_id: web.id, estimated_cost_usd: 0.02, cost_status: "priced" },
      {
        request_id: worker.id,
        estimated_cost_usd: 0.04,
        cost_status: "priced",
      },
      { request_id: daily.id, estimated_cost_usd: 0.08, cost_status: "priced" },
    ],
    excludedUserIds: new Set([a2]),
    surface: "all",
    now,
  });
  assert.equal(result.title, "외부 공고 추천 · 전체 경로");
  assert.equal(result.variants[0].sampleCount, 1);
  assert.equal(result.variants[1].sampleCount, 1);
  assert.equal(metric(result, "전체 실행"), 2);
  assert.deepEqual(
    result.variants[0].summaryMetrics!.map((m) => m.value),
    [0.03, 20, 1, 1, 1]
  );
  assert.deepEqual(
    result.variants[1].summaryMetrics!.map((m) => m.value),
    [0.08, 20, 1, null, 1]
  );
});
