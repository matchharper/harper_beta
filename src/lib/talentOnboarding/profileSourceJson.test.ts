import assert from "node:assert/strict";
import test from "node:test";
import { parseProfileSourceJson } from "./profileSourceJson";

test("rejects truncated or unrelated JSON instead of saving an empty profile", () => {
  for (const raw of [
    '{"experiences":[',
    "{}",
    "[]",
    "null",
    '{"experiences":"failed","educations":[]}',
  ]) {
    assert.equal(parseProfileSourceJson(raw), null);
  }
});

test("accepts empty arrays and fenced profile output without imposing content requirements", () => {
  const profile = {
    experiences: [],
    educations: [],
    notes: "No work history supplied",
  };
  assert.deepEqual(
    parseProfileSourceJson(
      `  \n\`\`\`json\n${JSON.stringify(profile)}\n\`\`\``
    ),
    profile
  );
  assert.deepEqual(
    parseProfileSourceJson('{"talentExperiences":[],"talentEducations":[]}'),
    { talentExperiences: [], talentEducations: [] }
  );
});
