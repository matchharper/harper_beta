import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPANY_TERMS } from "./terms";
import {
  allowedReasonTags,
  FIXED_REASON_TAGS,
  normalizeReasonTags,
  ORG_REASON_TAG_LIMIT,
  unknownReasonTags,
} from "./reasonTags";

test("allowed tags are the Role's criteria keys, then the 4 fixed categories", () => {
  const criteria = [
    { id: "c-traffic", name: "대규모 트래픽", criteria: "x" },
    { name: "팀 리드 경험", criteria: "y" },
    { id: "  ", name: "  ", criteria: "z" },
    { id: "c-traffic", name: "다시", criteria: "w" },
  ];
  const fixed = ["experience_skills", "role_fit", "working_conditions", "timing"];
  assert.deepEqual(allowedReasonTags({ criteria }), ["c-traffic", "팀 리드 경험", ...fixed]);
  assert.deepEqual(allowedReasonTags({ criteria: null }), fixed);
  assert.deepEqual(allowedReasonTags({ criteria: "not a list" }), fixed);
  assert.deepEqual([...FIXED_REASON_TAGS], fixed);
  for (const tag of FIXED_REASON_TAGS) {
    assert.ok(COMPANY_TERMS.reasonTag[tag].ko, tag);
    assert.ok(COMPANY_TERMS.reasonTag[tag].en, tag);
  }
});

test("tags are trimmed and kept once, in order; bad input is refused", () => {
  assert.deepEqual(normalizeReasonTags([" a ", "b", "a", ""]), ["a", "b"]);
  assert.deepEqual(normalizeReasonTags(undefined), []);
  assert.deepEqual(normalizeReasonTags(null), []);
  assert.throws(() => normalizeReasonTags("a"), TypeError);
  assert.throws(() => normalizeReasonTags([1]), TypeError);
  assert.throws(
    () => normalizeReasonTags(Array.from({ length: ORG_REASON_TAG_LIMIT + 1 }, (_, n) => `t${n}`)),
    RangeError
  );
  assert.deepEqual(unknownReasonTags(["a", "x", "b"], ["a", "b"]), ["x"]);
});
