import assert from "node:assert/strict";
import test from "node:test";

import type { TalentAdminClient } from "./admin";
import {
  generateTalentCallNoteForWrapup,
  updateTalentCallNoteForWrapup,
} from "./callNoteGeneration";

const CALL_ID = "9de379c1-b735-42a6-8e92-3939b12e87f0";
const SAVED_DOCUMENT = {
  id: CALL_ID,
  kind: "call_note" as const,
  fileName: "보상 기준",
  storagePath: null,
  contentType: null,
  sizeBytes: 123,
  isPublic: false as const,
  isPrimary: false as const,
  createdAt: "2026-09-06T01:01:06.000Z",
  updatedAt: "2026-09-06T01:01:06.000Z",
  originType: "career_realtime_call" as const,
  originId: CALL_ID,
  downloadUrl: null,
};
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
      return SAVED_DOCUMENT;
    },
  });

  assert.deepEqual(steps, ["analyze", "save"]);
  assert.deepEqual(result, {
    document: SAVED_DOCUMENT,
    status: "created",
  });
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
      return SAVED_DOCUMENT;
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
    save: async () => SAVED_DOCUMENT,
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

test("analyzes and updates an owned call note continuation", async () => {
  const steps: string[] = [];
  const previousCallNote = {
    schema_version: 2 as const,
    call_id: CALL_ID,
    conversation_id: "conversation-1",
    started_at: "2026-09-06T01:00:00.000Z",
    ended_at: "2026-09-06T01:01:00.000Z",
    duration_seconds: 60,
    title: "기존 제목",
    key_points: ["기존 요점"],
    entries: [{ role: "user" as const, text: "기존 발화", timestamp: null }],
  };
  const result = await updateTalentCallNoteForWrapup(
    {
      ...baseArgs,
      callId: "2bfffc34-329d-4cb0-b3b1-18bca7704dad",
      documentId: CALL_ID,
    },
    {
      fetch: async () => {
        steps.push("fetch");
        return {
          id: CALL_ID,
          file_name: "기존 제목",
          created_at: "2026-09-06T01:01:00.000Z",
          updated_at: "2026-09-06T01:01:00.000Z",
          size_bytes: 100,
          extracted_text: JSON.stringify(previousCallNote),
        };
      },
      analyze: async ({ previousCallNote: received }) => {
        steps.push("analyze");
        assert.deepEqual(received, previousCallNote);
        return {
          keyPoints: ["통합 요점"],
          shouldCreate: true,
          title: "갱신된 제목",
        };
      },
      update: async () => {
        steps.push("update");
        return { ...SAVED_DOCUMENT, updatedAt: "2026-09-10T01:00:00.000Z" };
      },
    }
  );

  assert.deepEqual(steps, ["fetch", "analyze", "update"]);
  assert.equal(result.status, "updated");
  assert.equal(result.status === "updated" && result.summaryUpdated, true);
});

test("appends a continuation while preserving its summary when the LLM declines a refresh", async () => {
  const updateArgs: { value: Record<string, unknown> | null } = { value: null };
  const previousCallNote = {
    schema_version: 2 as const,
    call_id: CALL_ID,
    conversation_id: "conversation-1",
    started_at: "2026-09-06T01:00:00.000Z",
    ended_at: "2026-09-06T01:01:00.000Z",
    duration_seconds: 60,
    title: "기존 제목",
    key_points: ["기존 요점"],
    entries: [{ role: "user" as const, text: "기존 발화", timestamp: null }],
  };
  const result = await updateTalentCallNoteForWrapup(
    {
      ...baseArgs,
      callId: "2bfffc34-329d-4cb0-b3b1-18bca7704dad",
      documentId: CALL_ID,
    },
    {
      fetch: async () => ({
        id: CALL_ID,
        file_name: "기존 제목",
        created_at: SAVED_DOCUMENT.createdAt,
        updated_at: SAVED_DOCUMENT.updatedAt,
        size_bytes: SAVED_DOCUMENT.sizeBytes,
        extracted_text: JSON.stringify(previousCallNote),
      }),
      analyze: async () => ({
        keyPoints: [],
        shouldCreate: false,
        title: "",
      }),
      update: async (args) => {
        updateArgs.value = args as unknown as Record<string, unknown>;
        return { ...SAVED_DOCUMENT, updatedAt: "2026-09-10T01:00:00.000Z" };
      },
    }
  );

  assert.equal(result.status, "updated");
  assert.equal(result.status === "updated" && result.summaryUpdated, false);
  assert.equal(updateArgs.value?.title, "기존 제목");
  assert.deepEqual(updateArgs.value?.keyPoints, ["기존 요점"]);
  assert.deepEqual(updateArgs.value?.transcript, baseArgs.transcript);
});

test("appends a continuation even when summary analysis fails", async () => {
  const analysisError = new Error("summary refresh failed");
  let updateCalls = 0;
  const result = await updateTalentCallNoteForWrapup(
    {
      ...baseArgs,
      callId: "2bfffc34-329d-4cb0-b3b1-18bca7704dad",
      documentId: CALL_ID,
    },
    {
      fetch: async () => ({
        id: CALL_ID,
        file_name: "기존 제목",
        created_at: SAVED_DOCUMENT.createdAt,
        updated_at: SAVED_DOCUMENT.updatedAt,
        size_bytes: SAVED_DOCUMENT.sizeBytes,
        extracted_text: JSON.stringify({
          schema_version: 2,
          call_id: CALL_ID,
          conversation_id: "conversation-1",
          started_at: "2026-09-06T01:00:00.000Z",
          ended_at: "2026-09-06T01:01:00.000Z",
          duration_seconds: 60,
          title: "기존 제목",
          key_points: ["기존 요점"],
          entries: [{ role: "user", text: "기존 발화", timestamp: null }],
        }),
      }),
      analyze: async () => {
        throw analysisError;
      },
      update: async (args) => {
        updateCalls += 1;
        assert.equal(args.title, "기존 제목");
        assert.deepEqual(args.keyPoints, ["기존 요점"]);
        return { ...SAVED_DOCUMENT, updatedAt: "2026-09-10T01:00:00.000Z" };
      },
    }
  );

  assert.equal(updateCalls, 1);
  assert.equal(result.status, "updated");
  assert.equal(result.status === "updated" && result.summaryUpdated, false);
  assert.equal(result.status === "updated" && result.warning, analysisError);
});

test("treats a repeated continuation call id as an idempotent update", async () => {
  let analyzeCalls = 0;
  let updateCalls = 0;
  const continuationCallId = "2bfffc34-329d-4cb0-b3b1-18bca7704dad";
  const result = await updateTalentCallNoteForWrapup(
    { ...baseArgs, callId: continuationCallId, documentId: CALL_ID },
    {
      fetch: async () => ({
        id: CALL_ID,
        file_name: "보상 기준",
        created_at: SAVED_DOCUMENT.createdAt,
        updated_at: SAVED_DOCUMENT.updatedAt,
        size_bytes: SAVED_DOCUMENT.sizeBytes,
        extracted_text: JSON.stringify({
          schema_version: 3,
          call_id: "2bfffc34-329d-4cb0-b3b1-18bca7704dad",
          conversation_id: "conversation-1",
          started_at: "2026-09-06T01:00:00.000Z",
          ended_at: "2026-09-06T01:01:00.000Z",
          duration_seconds: 60,
          title: "보상 기준",
          key_points: ["기본급을 우선한다."],
          entries: [{ role: "user", text: "기본급", timestamp: null }],
          sessions: [
            {
              call_id: continuationCallId,
              conversation_id: "conversation-1",
              started_at: "2026-09-06T01:00:00.000Z",
              ended_at: "2026-09-06T01:01:00.000Z",
              duration_seconds: 60,
              entry_start: 0,
              entry_count: 1,
            },
          ],
        }),
      }),
      analyze: async () => {
        analyzeCalls += 1;
        return null;
      },
      update: async () => {
        updateCalls += 1;
        return null;
      },
    }
  );

  assert.equal(result.status, "updated");
  assert.equal(analyzeCalls, 0);
  assert.equal(updateCalls, 0);
});
