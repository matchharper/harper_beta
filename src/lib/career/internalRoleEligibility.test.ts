import assert from "node:assert/strict";
import test from "node:test";

import {
  hasPendingInternalRoleReconsideration,
  isInternalRoleCandidateReadable,
  isInternalRoleCandidateVisible,
  isInternalRoleReconsiderationEligible,
} from "./internalRoleEligibility";

test("candidate-visible eligibility excludes candidate unfit from every fallback", () => {
  for (const fit of [
    { candidate_fit: "unfit", label: "fit" },
    { candidate_fit: "unfit", recommend: true },
    {
      candidate_fit: "unfit",
      company_fit: "fit",
      human_label: "fit",
      role_fit: "fit",
    },
  ]) {
    assert.equal(isInternalRoleCandidateVisible(fit), false);
  }
});

test("candidate-visible eligibility accepts recommend, legacy fit, or A/C fit with B middle", () => {
  assert.equal(isInternalRoleCandidateVisible({ recommend: true }), true);
  assert.equal(isInternalRoleCandidateVisible({ label: "fit" }), true);
  assert.equal(
    isInternalRoleCandidateVisible({
      candidate_fit: "middle",
      company_fit: "fit",
      role_fit: "fit",
    }),
    true
  );
  assert.equal(
    isInternalRoleCandidateVisible({
      candidate_fit: "middle",
      company_fit: "ambiguous",
      role_fit: "fit",
    }),
    false
  );
});

test("reconsideration is limited to automatic hold or A/C fit with B middle", () => {
  assert.equal(isInternalRoleReconsiderationEligible({ label: "hold" }), true);
  assert.equal(
    isInternalRoleReconsiderationEligible({
      candidate_fit: "middle",
      company_fit: "fit",
      role_fit: "fit",
    }),
    true
  );
  assert.equal(
    isInternalRoleReconsiderationEligible({
      candidate_fit: "unfit",
      company_fit: "fit",
      role_fit: "fit",
    }),
    false
  );
  assert.equal(
    isInternalRoleReconsiderationEligible({
      candidate_fit: "unfit",
      label: "hold",
    }),
    false
  );
  assert.equal(
    isInternalRoleReconsiderationEligible({
      human_label: "hold",
      label: "hold",
    }),
    false
  );
});

test("pending reconsideration is derived from unchecked saved evidence", () => {
  assert.equal(
    hasPendingInternalRoleReconsideration({
      label: "hold",
      reevaluation_checked_at: null,
      reevaluation_criteria: { new_information: "Open to this scope now" },
    }),
    true
  );
  assert.equal(
    hasPendingInternalRoleReconsideration({
      label: "hold",
      reevaluation_checked_at: "2026-09-03T00:00:00Z",
      reevaluation_criteria: { new_information: "Open to this scope now" },
    }),
    false
  );
  assert.equal(
    isInternalRoleCandidateReadable({
      label: "hold",
      reevaluation_checked_at: null,
      reevaluation_criteria: { new_information: "Open to this scope now" },
    }),
    true
  );
  assert.equal(
    isInternalRoleCandidateReadable({
      candidate_fit: "unfit",
      label: "hold",
      reevaluation_checked_at: null,
      reevaluation_criteria: { new_information: "Open to this scope now" },
    }),
    false
  );
});
