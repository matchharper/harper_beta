import assert from "node:assert/strict";
import test from "node:test";
import { shouldSyncMobileHistoryRoleId } from "@/lib/career/mobileHistoryNavigation";

const baseInput = {
  currentOpportunityRoleId: "role-1",
  jobsTab: "new" as const,
  requestedRoleId: "",
  routerReady: true,
  workspaceNavigationPending: false,
};

test("syncs the selected recommendation into an otherwise stable new-history URL", () => {
  assert.equal(shouldSyncMobileHistoryRoleId(baseInput), true);
});

test("does not restore the history URL while workspace navigation is leaving history", () => {
  assert.equal(
    shouldSyncMobileHistoryRoleId({
      ...baseInput,
      workspaceNavigationPending: true,
    }),
    false
  );
});

test("does not add a recommendation id outside the new-opportunity view", () => {
  assert.equal(
    shouldSyncMobileHistoryRoleId({
      ...baseInput,
      jobsTab: "saved",
    }),
    false
  );
});
