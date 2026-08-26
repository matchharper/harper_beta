import assert from "node:assert/strict";
import test from "node:test";

import { appendRealtimeInitialResponseInstruction } from "./realtimeInitialResponse";

test("first-response guidance is appended without replacing the session contract", () => {
  const instructions = appendRealtimeInitialResponseInstruction({
    instructions:
      "Company: Wonderful\nRole: Forward Deployed Engineer\nAsk the stored role questions.",
    initialResponseInstruction:
      "Mention Wonderful and ask the current required question.",
  });

  assert.match(instructions, /Company: Wonderful/);
  assert.match(instructions, /Ask the stored role questions/);
  assert.match(instructions, /One-time instruction for the first/);
  assert.match(instructions, /Mention Wonderful/);
  assert.match(instructions, /Keep every other session instruction active/);
});

test("empty first-response guidance leaves session instructions unchanged", () => {
  assert.equal(
    appendRealtimeInitialResponseInstruction({
      instructions: "base session contract",
      initialResponseInstruction: "   ",
    }),
    "base session contract"
  );
});
