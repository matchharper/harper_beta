import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDebugRecommendationStats,
  type DebugApplicationAttempt,
} from "./dailyDebugRecommendations";
const startIso = "2026-11-09T15:00:00Z",
  endIso = "2026-11-10T15:00:00Z",
  at = "2026-11-10T03:00:00Z";
const base = () => ({
  startIso,
  endIso,
  recommendations: [],
  progress: [],
  clicks: [],
  internalAcceptances: [],
  applications: [],
  evidenceMessages: [],
});
const rec = (id: string, type: string, user = "one") => ({
  id,
  talent_id: user,
  role_id: id,
  opportunity_type: type,
  created_at: at,
  viewed_at: at,
  clicked_at: null,
});
test("external/internal counts and unique people are independent; old recommendations keep the day's immutable reactions", () => {
  const stats = buildDebugRecommendationStats({
    ...base(),
    recommendations: [
      rec("ext", "external"),
      rec("ext2", "external"),
      {
        ...rec("int", "internal_recommendation", "two"),
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
    progress: [
      {
        id: "a",
        talent_id: "one",
        role_id: "ext",
        recommendation_id: "ext",
        kind: "candidate_opportunity_feedback_changed",
        feedback: "like",
        savedStage: null,
        created_at: at,
      },
      {
        id: "b",
        talent_id: "one",
        role_id: "ext2",
        recommendation_id: "ext2",
        kind: "candidate_opportunity_feedback_changed",
        feedback: "positive",
        savedStage: null,
        created_at: at,
      },
      {
        id: "c",
        talent_id: "two",
        role_id: "int",
        recommendation_id: "int",
        kind: "candidate_opportunity_feedback_changed",
        feedback: "keep",
        savedStage: null,
        created_at: at,
      },
      {
        id: "d",
        talent_id: "two",
        role_id: "int",
        recommendation_id: "int",
        kind: "saved_stage_changed",
        feedback: null,
        savedStage: "saved",
        created_at: at,
      },
      {
        id: "e",
        talent_id: "two",
        role_id: "int",
        recommendation_id: "int",
        kind: "candidate_opportunity_feedback_changed",
        feedback: "negative",
        savedStage: null,
        created_at: endIso,
      },
    ],
  });
  assert.deepEqual(stats.external.recommended, { count: 2, users: 1 });
  assert.deepEqual(stats.external.likes, { count: 2, users: 1 });
  assert.deepEqual(stats.internal.recommended, { count: 0, users: 0 });
  assert.deepEqual(stats.internal.kept, { count: 1, users: 1 });
  assert.deepEqual(stats.internal.saved, { count: 1, users: 1 });
  assert.deepEqual(stats.internal.dislikes, { count: 0, users: 0 });
});
test("direct requests count only newly created internal recommendations and distinct users", () => {
  const requested = [{ source: "candidate_request" }];
  const stats = buildDebugRecommendationStats({
    ...base(),
    recommendations: [
      { ...rec("requested-1", "internal_recommendation"), evidence: requested },
      { ...rec("requested-2", "internal_recommendation"), evidence: requested },
      rec("agent-selected", "internal_recommendation", "two"),
      {
        ...rec("old-request", "internal_recommendation", "two"),
        created_at: "2026-11-09T14:59:59Z",
        evidence: requested,
      },
      { ...rec("external", "external"), evidence: requested },
    ],
  });
  assert.deepEqual(stats.internal.recommended, { count: 3, users: 2 });
  assert.deepEqual(stats.internal.candidateRequested, { count: 2, users: 1 });
  assert.deepEqual(stats.external.candidateRequested, { count: 0, users: 0 });
});

test("button clicks, requests, approvals and verified submissions are different facts", () => {
  const attempt: DebugApplicationAttempt = {
    id: "verified",
    status: "succeeded",
    startedAt: at,
    updatedAt: at,
    managed: { authorizedReviewFingerprint: "review" },
    approval: { approved: true, executed: true },
    result: { evidence: "Confirmation receipt" },
  };
  const stats = buildDebugRecommendationStats({
    ...base(),
    clicks: [
      "career_click_history_external_apply",
      "career_click_history_external_apply",
      "career_click_apply_with_harper",
      "career_click_history_external_apply_with_harper",
      "career_click_history_external_apply_directly",
    ].map((type, i) => ({
      id: String(i),
      type,
      user_id: "one",
      created_at: at,
    })),
    applications: [
      {
        user_id: "one",
        attempts: [
          attempt,
          { ...attempt, id: "failed", status: "failed" },
          { ...attempt, id: "no-receipt", result: undefined },
          { ...attempt, id: "tomorrow", updatedAt: endIso },
          attempt,
        ],
      },
    ],
  });
  assert.deepEqual(stats.external.applyClicks, { count: 2, users: 1 });
  assert.deepEqual(stats.external.applyRequests, { count: 1, users: 1 });
  assert.deepEqual(stats.external.directApplyClicks, { count: 1, users: 1 });
  assert.deepEqual(stats.external.confirmed, { count: 4, users: 1 });
  assert.deepEqual(stats.external.submitted, { count: 1, users: 1 });
  assert.equal(
    stats.externalSubmissionCoverage,
    "recorded_application_flow_only"
  );
});
test("insert-time feedback is counted once and only on its recorded reaction date", () => {
  const inserted = {
    ...rec("insert", "external"),
    feedback: "positive",
    feedback_at: at,
  };
  const stats = buildDebugRecommendationStats({
    ...base(),
    recommendations: [
      inserted,
      { ...rec("unknown-time", "external"), feedback: "positive" },
      {
        ...rec("tomorrow", "external"),
        feedback: "negative",
        feedback_at: endIso,
      },
    ],
    progress: [
      {
        id: "event",
        talent_id: "one",
        role_id: "insert",
        recommendation_id: "insert",
        kind: "candidate_opportunity_feedback_changed",
        created_at: at,
        feedback: "positive",
        savedStage: null,
      },
    ],
  });
  assert.deepEqual(stats.external.likes, { count: 1, users: 1 });
  assert.deepEqual(stats.external.dislikes, { count: 0, users: 0 });
  assert.deepEqual(
    buildDebugRecommendationStats({ ...base(), recommendations: [inserted] })
      .external.likes,
    { count: 1, users: 1 }
  );
});
test("internal acceptance excludes follow-up messages and imported legacy correspondence", () => {
  const acceptance = {
    id: "root",
    root_id: "root",
    talent_id: "one",
    role_id: "role",
    created_at: at,
    direction: "to_company",
    material_id: "pin",
    legacyCorrespondence: null,
  };
  const stats = buildDebugRecommendationStats({
    ...base(),
    internalAcceptances: [
      acceptance,
      { ...acceptance, id: "followup" },
      {
        ...acceptance,
        id: "legacy",
        root_id: "legacy",
        legacyCorrespondence: "true",
      },
    ],
  });
  assert.deepEqual(stats.internal.confirmed, { count: 1, users: 1 });
  assert.deepEqual(stats.internal.submitted, { count: 1, users: 1 });
});
