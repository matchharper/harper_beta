import assert from "node:assert/strict";
import test from "node:test";
import { canPreviewCompanyCandidate, isOrgCandidateProfilePreview } from "./candidatePreview";

const shared = { deletedAt: null, companyNames: ["Harper", "Published name"], setting: {
  is_onboarding_done: true, profile_visibility: "open_to_matches", get_internal_recommendation: true,
  blocked_companies: [] as string[],
} };

test("new profile previews respect consent, account deletion and both company names", () => {
  assert.equal(canPreviewCompanyCandidate(shared), true);
  for (const setting of [null, { ...shared.setting, is_onboarding_done: false },
    { ...shared.setting, get_internal_recommendation: false },
    { ...shared.setting, profile_visibility: "exceptional_only" },
    { ...shared.setting, profile_visibility: "dont_share" },
    { ...shared.setting, blocked_companies: ["  HARPER  "] },
    { ...shared.setting, blocked_companies: ["Published Name"] },
  ]) assert.equal(canPreviewCompanyCandidate({ ...shared, setting }), false);
  assert.equal(canPreviewCompanyCandidate({ ...shared, deletedAt: "2026-10-22" }), false);
  assert.equal(canPreviewCompanyCandidate({ ...shared, setting: { ...shared.setting, get_internal_recommendation: null } }), true);
  assert.equal(isOrgCandidateProfilePreview(undefined), false);
});
