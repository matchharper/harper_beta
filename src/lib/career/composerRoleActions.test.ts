import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowCareerComposerRoleActions } from "./composerRoleActions";

test("composer role actions stay visible until the draft has two characters", () => {
  assert.equal(shouldShowCareerComposerRoleActions(""), true);
  assert.equal(shouldShowCareerComposerRoleActions(" 가 "), true);
  assert.equal(shouldShowCareerComposerRoleActions("가나"), false);
  assert.equal(shouldShowCareerComposerRoleActions("a b"), false);
});
