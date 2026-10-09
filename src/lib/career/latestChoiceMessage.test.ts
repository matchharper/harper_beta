import test from "node:test";
import assert from "node:assert/strict";
import type { CareerMessage } from "@/components/career/types";
import { latestChoiceMessageIndex } from "./latestChoiceMessage";
const user = { id: 1, role: "user", content: "Switch roles" } as CareerMessage;
const answer = {
  id: 2,
  role: "assistant",
  content: "Shall we wrap up?",
} as CareerMessage;
test("latest answer choices stay available after simulation state and cards", () => {
  for (const key of [
    "simulationSession",
    "simulationAction",
    "simulation",
    "applicationStartOffer",
  ]) {
    const extra = {
      id: 3,
      role: "assistant",
      content: "",
      [key]: {},
    } as CareerMessage;
    assert.equal(latestChoiceMessageIndex([user, answer, extra]), 1);
    assert.equal(latestChoiceMessageIndex([user, answer, extra, user]), -1);
  }
  assert.equal(
    latestChoiceMessageIndex([user, answer, { ...answer, id: 4 }]),
    2
  );
  assert.equal(latestChoiceMessageIndex([]), -1);
});
