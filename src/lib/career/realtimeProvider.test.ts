import assert from "node:assert/strict";
import test from "node:test";
import { resolveCareerRealtimeProvider } from "@/lib/career/realtimeProvider";

test("uses OpenAI for normal Career realtime calls", () => {
  const assignments = [
    {
      providerOverride: null,
      userCreatedAt: "2020-01-01T00:00:00.000Z",
      userId: "existing-user",
    },
    {
      providerOverride: undefined,
      userCreatedAt: null,
      userId: "",
    },
  ];

  for (const assignment of assignments) {
    assert.equal(resolveCareerRealtimeProvider(assignment), "openai");
  }
});

test("supports an explicit provider override from authorized dev controls", () => {
  assert.equal(
    resolveCareerRealtimeProvider({
      providerOverride: "xai",
      userCreatedAt: "2030-01-01T00:00:00.000Z",
      userId: "xai-dev-user",
    }),
    "xai"
  );
  assert.equal(
    resolveCareerRealtimeProvider({
      providerOverride: "openai",
      userCreatedAt: null,
      userId: "openai-dev-user",
    }),
    "openai"
  );
});
