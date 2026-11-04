import assert from "node:assert/strict";
import test from "node:test";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import { isCareerHistoryOpportunityExpired } from "@/components/career/history/opportunityPostingStatus";
import {
  deriveHistoryOpportunityCounts,
  normalizeHistoryOpportunities,
  getHistoryOpportunityBucket,
} from "@/hooks/career/careerSessionData";
import { OpportunityType } from "@/lib/opportunityType";

test("date-only appointments survive history normalization with no end time", () => {
  const item = createOpportunity({ id: "progress", roleId: "role", title: "Engineer", companyName: "Example", kind: "recommendation", feedback: "positive", savedStage: "offer", isAccepted: false, recommendedAt: "2026-11-03T00:00:00Z", employmentTypes: [], recommendationReasons: [], upcomingMeeting: { startAt: "2026-11-02T15:00:00Z", endAt: null, calendarDate: "2026-11-03", title: "면접" } });
  const result = normalizeHistoryOpportunities([item]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].upcomingMeeting, item.upcomingMeeting);
  assert.equal(deriveHistoryOpportunityCounts(result).savedStages.offer, 1);
});

const createOpportunity = (
  overrides: Partial<CareerHistoryOpportunity>
): CareerHistoryOpportunity =>
  ({
    feedback: null,
    isInternal: true,
    opportunityType: OpportunityType.InternalRecommendation,
    savedStage: null,
    sourceType: "internal",
    ...overrides,
  }) as CareerHistoryOpportunity;

test("unanswered hidden opportunities belong to the saved archive bucket", () => {
  const hidden = createOpportunity({ savedStage: "hidden" });

  assert.equal(getHistoryOpportunityBucket(hidden), "saved");
  assert.deepEqual(deriveHistoryOpportunityCounts([hidden]), {
    archived: 0,
    new: 0,
    newInternal: 0,
    newExternalUnread: 0,
    saved: 1,
    savedStages: {
      applied: 0,
      offer: 0,
      closed: 0,
      connected: 0,
      hidden: 1,
      saved: 0,
    },
    total: 1,
  });
});

test("negative feedback remains archived even if a stale hidden stage exists", () => {
  const archived = createOpportunity({
    feedback: "negative",
    savedStage: "hidden",
  });

  assert.equal(getHistoryOpportunityBucket(archived), "archived");
  assert.equal(deriveHistoryOpportunityCounts([archived]).saved, 0);
  assert.equal(deriveHistoryOpportunityCounts([archived]).archived, 1);
});

test("list membership can restore a rejected role while preserving saved progress separately", () => {
  const restored = createOpportunity({ feedback: "negative", listPosition: "current" });
  const priorSaved = createOpportunity({ feedback: "positive", savedStage: "applied", listPosition: "previous" });
  assert.equal(getHistoryOpportunityBucket(restored), "new");
  assert.equal(getHistoryOpportunityBucket(priorSaved), "archived");
  const counts = deriveHistoryOpportunityCounts([restored, priorSaved]);
  assert.equal(counts.new, 1);
  assert.equal(counts.newInternal, 0);
  assert.equal(counts.archived, 1);
  assert.equal(counts.saved, 1);
  assert.equal(counts.savedStages.applied, 1);
  assert.equal(counts.total, 2);
});

test("ended roles are rendered as past postings", () => {
  assert.equal(
    isCareerHistoryOpportunityExpired({
      expiresAt: null,
      isExpired: false,
      status: "ended",
    }),
    true
  );
});


test("counts only unread new external jobs, independently from Harper positions", () => {
  const external = { sourceType: "external" as const, isInternal: false, opportunityType: OpportunityType.ExternalJd };
  const counts = deriveHistoryOpportunityCounts([
    createOpportunity({ ...external, viewedAt: null }),
    createOpportunity({ ...external, viewedAt: "2026-10-13T00:00:00Z" }),
    createOpportunity({ ...external, feedback: "positive", viewedAt: null }),
    createOpportunity({ ...external, feedback: "negative", viewedAt: null }),
    createOpportunity({ ...external, savedStage: "hidden", viewedAt: null }),
    createOpportunity({ viewedAt: null }),
  ]);
  assert.equal(counts.new, 3);
  assert.equal(counts.newInternal, 1);
  assert.equal(counts.newExternalUnread, 1);
});

for (const feedback of ["positive", "keep"] as const) {
  test(`current membership with ${feedback} belongs only to saved`, () => {
    const saved = createOpportunity({ feedback, savedStage: "saved", listPosition: "current" });
    assert.equal(getHistoryOpportunityBucket(saved), "saved");
    const counts = deriveHistoryOpportunityCounts([saved]);
    assert.equal(counts.new, 0);
    assert.equal(counts.newExternalUnread, 0);
    assert.equal(counts.saved, 1);
    assert.equal(counts.savedStages.saved, 1);
  });
}
