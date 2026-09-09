import assert from "node:assert/strict";
import test from "node:test";

import type { TalentAdminClient } from "./admin";
import { generateTalentCallNoteForWrapup } from "./callNoteGeneration";

const CALL_ID = "9de379c1-b735-42a6-8e92-3939b12e87f0";
const baseArgs = {
  admin: {} as TalentAdminClient,
  callId: CALL_ID,
  conversationId: "conversation-1",
  durationSeconds: 65,
  onboardingCompletedAtStart: true,
  preferredLocale: "ko",
  transcript: [{ role: "user" as const, text: "기본급이 중요해요." }],
  userId: "user-1",
};

test("analyzes and saves a meaningful call before reporting creation", async () => {
  const steps: string[] = [];
  const result = await generateTalentCallNoteForWrapup(baseArgs, {
    analyze: async () => {
      steps.push("analyze");
      return {
        keyPoints: ["기본급을 우선한다."],
        shouldCreate: true,
        title: "보상 기준",
      };
    },
    save: async () => {
      steps.push("save");
      return {};
    },
  });

  assert.deepEqual(steps, ["analyze", "save"]);
  assert.deepEqual(result, { status: "created" });
});

test("skips ineligible and non-meaningful calls without saving", async () => {
  let analyzeCalls = 0;
  let saveCalls = 0;
  const dependencies = {
    analyze: async () => {
      analyzeCalls += 1;
      return { keyPoints: [], shouldCreate: false, title: "" };
    },
    save: async () => {
      saveCalls += 1;
      return {};
    },
  };

  const ineligible = await generateTalentCallNoteForWrapup(
    { ...baseArgs, onboardingCompletedAtStart: false },
    dependencies
  );
  const notMeaningful = await generateTalentCallNoteForWrapup(
    baseArgs,
    dependencies
  );

  assert.deepEqual(ineligible, { reason: "ineligible", status: "skipped" });
  assert.deepEqual(notMeaningful, {
    reason: "not_meaningful",
    status: "skipped",
  });
  assert.equal(analyzeCalls, 1);
  assert.equal(saveCalls, 0);
});

test("reports analysis and save failures without claiming creation", async () => {
  const analysisError = new Error("analysis failed");
  const analysisFailure = await generateTalentCallNoteForWrapup(baseArgs, {
    analyze: async () => {
      throw analysisError;
    },
    save: async () => ({}),
  });
  assert.deepEqual(analysisFailure, {
    error: analysisError,
    status: "failed",
  });

  const saveError = new Error("save failed");
  const saveFailure = await generateTalentCallNoteForWrapup(baseArgs, {
    analyze: async () => ({
      keyPoints: ["기본급을 우선한다."],
      shouldCreate: true,
      title: "보상 기준",
    }),
    save: async () => {
      throw saveError;
    },
  });
  assert.deepEqual(saveFailure, { error: saveError, status: "failed" });
});
