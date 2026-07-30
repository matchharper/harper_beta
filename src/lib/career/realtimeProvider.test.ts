import assert from "node:assert/strict";
import test from "node:test";
import {
  CAREER_REALTIME_ROLLOUT_STARTED_AT,
  resolveCareerRealtimeProvider,
} from "@/lib/career/realtimeProvider";

const EXISTING_USER_CREATED_AT = new Date(
  Date.parse(CAREER_REALTIME_ROLLOUT_STARTED_AT) - 1
).toISOString();
const NEW_USER_CREATED_AT = CAREER_REALTIME_ROLLOUT_STARTED_AT;

test("keeps every existing user on OpenAI", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.equal(
      resolveCareerRealtimeProvider({
        providerOverride: null,
        userCreatedAt: EXISTING_USER_CREATED_AT,
        userId: `existing-user-${index}`,
      }),
      "openai"
    );
  }
});

test("defaults conservatively to OpenAI without valid signup data", () => {
  assert.equal(
    resolveCareerRealtimeProvider({
      providerOverride: null,
      userCreatedAt: null,
      userId: "user-without-created-at",
    }),
    "openai"
  );
  assert.equal(
    resolveCareerRealtimeProvider({
      providerOverride: null,
      userCreatedAt: "invalid",
      userId: "user-with-invalid-created-at",
    }),
    "openai"
  );
  assert.equal(
    resolveCareerRealtimeProvider({
      providerOverride: null,
      userCreatedAt: NEW_USER_CREATED_AT,
      userId: "",
    }),
    "openai"
  );
});

test("supports an explicit provider override for local xAI testing", () => {
  assert.equal(
    resolveCareerRealtimeProvider({
      providerOverride: "xai",
      userCreatedAt: EXISTING_USER_CREATED_AT,
      userId: "existing-test-user",
    }),
    "xai"
  );
});

test("assigns new users across both providers and keeps each assignment stable", () => {
  const assignments = Array.from({ length: 1_000 }, (_, index) =>
    resolveCareerRealtimeProvider({
      providerOverride: null,
      userCreatedAt: NEW_USER_CREATED_AT,
      userId: `new-user-${index}`,
    })
  );

  assert.ok(assignments.includes("openai"));
  assert.ok(assignments.includes("xai"));
  const openaiCount = assignments.filter(
    (provider) => provider === "openai"
  ).length;
  assert.ok(
    openaiCount >= 450 && openaiCount <= 550,
    `expected an approximately even split, got ${openaiCount}/1000 OpenAI`
  );

  for (let index = 0; index < assignments.length; index += 1) {
    assert.equal(
      resolveCareerRealtimeProvider({
        providerOverride: null,
        userCreatedAt: NEW_USER_CREATED_AT,
        userId: `new-user-${index}`,
      }),
      assignments[index]
    );
  }
});
