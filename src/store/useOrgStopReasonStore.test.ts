import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ORG_STOP_REASONS,
  extractCustomOrgStopReasons,
  normalizeSavedOrgStopReasons,
} from "./useOrgStopReasonStore";

test("keeps unique custom stop reasons with at most 20 characters", () => {
  assert.deepEqual(
    normalizeSavedOrgStopReasons([
      "  기술 스택 불일치  ",
      "기술 스택 불일치",
      "너무 주니어",
      "123456789012345678901",
      "",
      null,
    ]),
    ["기술 스택 불일치"]
  );
});

test("extracts short line-based reasons not already offered as options", () => {
  assert.deepEqual(
    extractCustomOrgStopReasons(
      [
        "너무 시니어",
        "산업 경험 불일치",
        "산업 경험 불일치",
        "123456789012345678901",
      ].join("\n"),
      DEFAULT_ORG_STOP_REASONS
    ),
    ["산업 경험 불일치"]
  );
});

test("counts Unicode characters instead of UTF-16 code units", () => {
  assert.deepEqual(
    normalizeSavedOrgStopReasons(["😀".repeat(20), "😀".repeat(21)]),
    ["😀".repeat(20)]
  );
});
