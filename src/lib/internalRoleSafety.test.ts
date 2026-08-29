import assert from "node:assert/strict";
import test from "node:test";

import { isTestOnlyInternalRole } from "./internalRoleSafety";

test("recognizes the canonical boolean testOnly marker", () => {
  assert.equal(
    isTestOnlyInternalRole({
      information: { testOnly: true },
      name: "Portfolio Operations Lead",
      source_type: "internal",
    }),
    true
  );
});

test("recognizes legacy E2E and QA markers", () => {
  assert.equal(
    isTestOnlyInternalRole({
      information: {},
      name: "[Codex E2E 2026-08-17] Pipeline validation",
      source_type: "internal",
    }),
    true
  );
  assert.equal(
    isTestOnlyInternalRole({
      information: {},
      name: "Role",
      source_job_id: "e2e:company-flow",
      source_type: "internal",
    }),
    true
  );
});

test("does not classify an ordinary internal role as test-only", () => {
  assert.equal(
    isTestOnlyInternalRole({
      information: {},
      name: "Communications Team Assistant Manager",
      source_provider: "manual_pdf",
      source_type: "internal",
    }),
    false
  );
});

test("does not apply internal test-role rules to external jobs", () => {
  assert.equal(
    isTestOnlyInternalRole({
      information: { testOnly: true },
      name: "[E2E] External role",
      source_type: "external",
    }),
    false
  );
});
