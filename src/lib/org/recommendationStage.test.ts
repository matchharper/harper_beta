import assert from "node:assert/strict";
import test from "node:test";
import { getOrgImplicitAcceptanceStage } from "@/lib/org/recommendationStage";

test("shows positive internal recommendation feedback in the accepted stage", () => {
  assert.equal(
    getOrgImplicitAcceptanceStage({
      connectedByOrgAction: false,
      feedback: "like",
      includeInternalAccepted: true,
      isInternalRecommendation: true,
      savedStage: null,
    }),
    "accepted"
  );
  assert.equal(
    getOrgImplicitAcceptanceStage({
      connectedByOrgAction: false,
      feedback: "POSITIVE",
      includeInternalAccepted: true,
      isInternalRecommendation: true,
      savedStage: null,
    }),
    "accepted"
  );
  assert.equal(
    getOrgImplicitAcceptanceStage({
      connectedByOrgAction: false,
      feedback: null,
      includeInternalAccepted: true,
      isInternalRecommendation: true,
      savedStage: "accepted",
    }),
    "accepted"
  );
});

test("keeps company-connected recommendations in the connected stage", () => {
  assert.equal(
    getOrgImplicitAcceptanceStage({
      connectedByOrgAction: true,
      feedback: "like",
      includeInternalAccepted: true,
      isInternalRecommendation: true,
      savedStage: null,
    }),
    "connected"
  );
});

test("does not expose implicit internal acceptances to company accounts", () => {
  assert.equal(
    getOrgImplicitAcceptanceStage({
      connectedByOrgAction: false,
      feedback: "like",
      includeInternalAccepted: false,
      isInternalRecommendation: true,
      savedStage: null,
    }),
    null
  );
  assert.equal(
    getOrgImplicitAcceptanceStage({
      connectedByOrgAction: false,
      feedback: null,
      includeInternalAccepted: true,
      isInternalRecommendation: true,
      savedStage: null,
    }),
    null
  );
  assert.equal(
    getOrgImplicitAcceptanceStage({
      connectedByOrgAction: false,
      feedback: "like",
      includeInternalAccepted: true,
      isInternalRecommendation: false,
      savedStage: null,
    }),
    null
  );
});
