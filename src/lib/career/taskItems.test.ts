import assert from "node:assert/strict";
import test from "node:test";
import {
  getCareerTaskSectionOrder,
  getCareerWaitingConnection,
} from "./taskItems";

const accepted = {
  companyLogoUrl: null,
  companyName: "Fixture team",
  companyRequestIntroProgress: null,
  feedback: "positive" as const,
  id: "recommendation-1",
  internalProgress: null,
  roleId: "role-1",
  savedStage: "connected" as const,
  sourceType: "internal" as const,
  status: "active",
  title: "Engineer",
};

const progress = (
  stage:
    | "accepted"
    | "pending_connection"
    | "connected"
    | "process_stopped"
    | "archived"
) => ({
  acceptedAt: "2025-01-01T00:00:00Z",
  code: "no_company_response_closed" as const,
  daysSinceAccepted: 600,
  daysSinceStageChanged: 400,
  message: "Legacy time-based display copy is not a lifecycle fact",
  stage,
  stageChangedAt: "2025-01-01T00:00:00Z",
  stageTag: null,
});

test("decisions move first only when there is a current decision", () => {
  assert.deepEqual(getCareerTaskSectionOrder(true), [
    "decisions",
    "suggestions",
    "working",
  ]);
  assert.deepEqual(getCareerTaskSectionOrder(false), [
    "working",
    "suggestions",
  ]);
});

test("old accepted recommendations stay pending without inferring sharing or a company response", () => {
  assert.equal(
    getCareerWaitingConnection({
      ...accepted,
      internalProgress: progress("accepted"),
    })?.stage,
    "preparing"
  );
  assert.equal(getCareerWaitingConnection(accepted)?.stage, "preparing");
  assert.equal(
    getCareerWaitingConnection({ ...accepted, isExpired: true })?.stage,
    "preparing"
  );
});

test("a verified pending-connection stage displays company response waiting", () => {
  assert.equal(
    getCareerWaitingConnection({
      ...accepted,
      internalProgress: progress("pending_connection"),
    })?.stage,
    "awaiting_company"
  );
});

test("a next process or explicit closure removes the waiting item", () => {
  for (const stage of ["connected", "process_stopped", "archived"] as const) {
    assert.equal(
      getCareerWaitingConnection({
        ...accepted,
        internalProgress: progress(stage),
      }),
      null
    );
  }
  assert.equal(
    getCareerWaitingConnection({ ...accepted, status: "ended" }),
    null
  );
  assert.equal(
    getCareerWaitingConnection({ ...accepted, savedStage: "closed" }),
    null
  );
  assert.equal(
    getCareerWaitingConnection({ ...accepted, feedback: "negative" }),
    null
  );
  assert.equal(
    getCareerWaitingConnection({ ...accepted, sourceType: "external" }),
    null
  );
});

test("company-requested intros wait only while the introduction is unfinished", () => {
  const intro = {
    canRelayToCompany: true,
    connectedAt: null,
    connectionId: "intro-1",
    latestCandidateRelayAt: null,
    latestCandidateRelayStatus: null,
    latestCompanyContactAt: null,
    origin: "company_request_intro" as const,
    requestedAt: "2026-09-25T00:00:00Z",
    status: "connecting",
    talentAcceptedAt: "2026-09-26T00:00:00Z",
  };
  assert.equal(
    getCareerWaitingConnection({
      ...accepted,
      companyRequestIntroProgress: intro,
    })?.stage,
    "preparing"
  );
  assert.equal(
    getCareerWaitingConnection({
      ...accepted,
      companyRequestIntroProgress: { ...intro, status: "connected" },
    }),
    null
  );
});
