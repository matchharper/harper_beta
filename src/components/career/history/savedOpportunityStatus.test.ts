import assert from "node:assert/strict";
import test from "node:test";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import { getSavedOpportunityManagementStatus } from "./savedOpportunityStatus";
import { OpportunityType } from "@/lib/opportunityType";

const createOpportunity = (
  overrides: Partial<CareerHistoryOpportunity>
): CareerHistoryOpportunity =>
  ({
    isInternal: false,
    opportunityType: OpportunityType.ExternalJd,
    savedStage: null,
    sourceType: "external",
    ...overrides,
  }) as CareerHistoryOpportunity;

test("defaults accepted internal opportunities without a saved stage to connected", () => {
  assert.equal(
    getSavedOpportunityManagementStatus(
      createOpportunity({
        isInternal: true,
        opportunityType: OpportunityType.InternalRecommendation,
        sourceType: "internal",
      })
    ),
    "connected"
  );

  assert.equal(
    getSavedOpportunityManagementStatus(
      createOpportunity({ opportunityType: OpportunityType.IntroRequest })
    ),
    "connected"
  );

  assert.equal(
    getSavedOpportunityManagementStatus(
      createOpportunity({ isInternal: true, sourceType: "internal" })
    ),
    "connected"
  );
});

test("keeps external opportunities without a saved stage in interested", () => {
  assert.equal(
    getSavedOpportunityManagementStatus(createOpportunity({})),
    "saved"
  );
});

test("respects an explicit saved stage for internal opportunities", () => {
  assert.equal(
    getSavedOpportunityManagementStatus(
      createOpportunity({
        isInternal: true,
        opportunityType: OpportunityType.InternalRecommendation,
        savedStage: "saved",
        sourceType: "internal",
      })
    ),
    "saved"
  );
});
