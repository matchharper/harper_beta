import assert from "node:assert/strict";
import test from "node:test";
import { buildReadTalentResponseGuide } from "./talentResponseGuide";

test("builds the exact talent marker for a read_talent result", () => {
  assert.deepEqual(
    buildReadTalentResponseGuide({
      name: "김호진",
      talentId: "4fcc61fe-4282-4b4b-b0bc-49f35e297901",
    }),
    {
      candidateReference:
        "[김호진](talent:4fcc61fe-4282-4b4b-b0bc-49f35e297901)",
      instruction:
        "이 특정 후보자에 대해 답변할 때 이름은 항상 candidateReference 값을 그대로 사용한다.",
    }
  );
});

test("keeps generated markers parseable for unusual candidate names", () => {
  assert.deepEqual(
    buildReadTalentResponseGuide({
      name: " [Alex]\nKim ",
      talentId: " talent-id ",
    }).candidateReference,
    "[Alex Kim](talent:talent-id)"
  );
});
