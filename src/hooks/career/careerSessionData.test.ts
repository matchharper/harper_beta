import assert from "node:assert/strict";
import test from "node:test";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import { isCareerHistoryOpportunityExpired } from "@/components/career/history/opportunityPostingStatus";
import {
  deriveHistoryOpportunityCounts,
  getHistoryOpportunityBucket,
} from "@/hooks/career/careerSessionData";
import { OpportunityType } from "@/lib/opportunityType";

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
    saved: 1,
    savedStages: {
      applied: 0,
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
