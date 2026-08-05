import assert from "node:assert/strict";
import test from "node:test";

import { buildProfileLinkReplyInstruction } from "./profileLinkReplyInstruction";

test("added profile links receive a substantive benefit explanation", () => {
  const instruction = buildProfileLinkReplyInstruction({
    addedCount: 1,
    deletedCount: 0,
  });

  assert.match(instruction, /do not stop at a terse registration/);
  assert.match(instruction, /improve future opportunity matching/);
  assert.match(instruction, /Harper internal company connection/);
  assert.doesNotMatch(instruction, /consent/i);
  assert.match(instruction, /user's benefit/);
});

test("deleted profile links explain the effect on future use", () => {
  const instruction = buildProfileLinkReplyInstruction({
    addedCount: 0,
    deletedCount: 1,
  });

  assert.match(instruction, /no longer use it as a saved source/);
  assert.match(instruction, /unless the user adds it again/);
  assert.doesNotMatch(instruction, /improve future opportunity matching/);
});

test("unchanged profile links add no reply instruction", () => {
  assert.equal(
    buildProfileLinkReplyInstruction({ addedCount: 0, deletedCount: 0 }),
    ""
  );
});
