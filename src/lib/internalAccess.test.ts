import assert from "node:assert/strict";
import test from "node:test";
import {
  canInspectCareerTranslations,
  canUseOrgDevControls,
  canViewOpsUtm,
  isInternalEmail,
} from "@/lib/internalAccess";

test("internal domain accounts retain full internal access", () => {
  assert.equal(isInternalEmail("operator@matchharper.com"), true);
  assert.equal(canViewOpsUtm("operator@matchharper.com"), true);
});

test("UTM viewer accounts are limited to the UTM access predicate", () => {
  assert.equal(isInternalEmail("khj605123@gmail.com"), false);
  assert.equal(canViewOpsUtm("khj605123@gmail.com"), true);
  assert.equal(canInspectCareerTranslations("khj605123@gmail.com"), false);
  assert.equal(canViewOpsUtm("unknown@gmail.com"), false);
});

test("organization dev controls stay limited to internal and allowlisted accounts", () => {
  assert.equal(canUseOrgDevControls("operator@matchharper.com"), true);
  assert.equal(canUseOrgDevControls("khj605123@gmail.com"), true);
  assert.equal(canUseOrgDevControls("unknown@gmail.com"), false);
});
