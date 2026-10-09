import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  createCareerCapabilityTurn,
  readCareerCapabilityLeases,
  isCareerCapabilityTurn,
} from "./server";
import { initialCareerCapabilityPayload } from "./lease";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentMessageRow } from "@/lib/talentOnboarding/models";

const now = "2026-10-09T12:00:00Z";
const source = {
  id: 20,
  user_id: "user-a",
  conversation_id: "conversation-a",
  role: "user",
  message_type: "chat",
  content: "hello",
  created_at: now,
  payload: initialCareerCapabilityPayload("progressive"),
} as TalentMessageRow;
const promptArgs = {
  channel: "chat" as const,
  isOnboardingDone: true,
  careerCoachingActivity: null,
  profile: null,
  structuredProfileText: "",
  talentContextSection: "",
};

test("scoped lease query reads latest source rows before completion filtering; CAS preserves concurrent payload writers", async () => {
  let payload: Record<string, unknown> = {
      ...(source.payload as object),
      upload: "keep",
    },
    patches = 0,
    historyReads = 0;
  const admin = createClient("https://test.invalid", "test-key", {
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get("user_id"), "eq.user-a");
        assert.equal(
          url.searchParams.get("conversation_id"),
          "eq.conversation-a"
        );
        assert.equal(url.searchParams.get("role"), "eq.user");
        if (init?.method === "PATCH") {
          patches++;
          assert.equal(
            url.searchParams.get("payload"),
            `eq.${JSON.stringify(payload)}`
          );
          if (patches === 1) {
            payload = { ...payload, concurrentField: "preserve too" };
            return Response.json([]);
          }
          payload = JSON.parse(String(init.body)).payload;
          return Response.json([{ id: source.id }]);
        }
        if (url.searchParams.get("id") === "eq.20")
          return Response.json({ ...source, payload });
        historyReads++;
        assert.equal(url.searchParams.get("id"), "lt.20");
        assert.equal(url.searchParams.get("limit"), "3");
        assert.equal(url.searchParams.get("order"), "id.desc");
        assert.equal(
          url.searchParams.get("payload->careerCapabilityTurn"),
          "not.is.null"
        );
        assert.ok(!String(url).includes("completed"));
        return Response.json([
          {
            created_at: "2026-10-09T11:59:00Z",
            payload: {
              careerCapabilityTurn: {
                version: 1,
                mode: "progressive",
                status: "completed",
                activated: ["documents"],
                used: [],
              },
            },
          },
        ]);
      },
    },
  }) as TalentAdminClient;
  const turn = await createCareerCapabilityTurn({
    admin,
    userId: "user-a",
    conversationId: "conversation-a",
    sourceMessage: source,
    mode: "progressive",
    promptArgs,
    eligibleTools: [
      {
        type: "function",
        function: {
          name: "read_document",
          description: "Read",
          parameters: { type: "object", properties: {} },
        },
      },
    ],
  });
  assert.ok(turn.runtime.loaded.has("documents"));
  await turn.complete();
  await turn.complete();
  assert.equal(patches, 2);
  assert.equal(historyReads, 1);
  assert.equal(payload.upload, "keep");
  assert.equal(payload.concurrentField, "preserve too");
  assert.deepEqual(payload.careerCapabilityTurn, {
    version: 1,
    status: "completed",
    mode: "progressive",
    activated: [],
    used: [],
  });
  await assert.rejects(
    createCareerCapabilityTurn({
      admin,
      userId: "user-b",
      conversationId: "conversation-a",
      sourceMessage: source,
      mode: "progressive",
      promptArgs,
      eligibleTools: [],
    }),
    /Invalid Career capability source/
  );
});

test("lease read/persistence failure is cold and never turns successful business work into a retry", async () => {
  const admin = createClient("https://test.invalid", "test-key", {
    global: {
      fetch: async () =>
        Response.json({ message: "synthetic offline" }, { status: 500 }),
    },
  }) as TalentAdminClient;
  assert.equal(
    (
      await readCareerCapabilityLeases({
        admin,
        userId: "user-a",
        conversationId: "conversation-a",
        beforeId: 20,
        currentCreatedAt: now,
      })
    ).size,
    0
  );
  const turn = await createCareerCapabilityTurn({
    admin,
    userId: "user-a",
    conversationId: "conversation-a",
    sourceMessage: source,
    mode: "progressive",
    promptArgs,
    eligibleTools: [],
  });
  await assert.doesNotReject(turn.complete());
});

test("only ordinary post-onboarding text turns participate; tool-free, voice and onboarding are excluded", () => {
  assert.equal(
    isCareerCapabilityTurn({ channel: "chat", isOnboardingDone: true }),
    true
  );
  assert.equal(
    isCareerCapabilityTurn({ channel: "voice", isOnboardingDone: true }),
    false
  );
  assert.equal(
    isCareerCapabilityTurn({ channel: "chat", isOnboardingDone: false }),
    false
  );
  assert.equal(
    isCareerCapabilityTurn({
      channel: "chat",
      isOnboardingDone: true,
      allowedToolNames: [],
    }),
    false
  );
});

test("a verified coaching end receipt wins over the old active prompt even when rereading fails", async () => {
  const admin = createClient("https://test.invalid", "test-key", {
    global: {
      fetch: async () =>
        Response.json({ message: "synthetic offline" }, { status: 500 }),
    },
  }) as TalentAdminClient;
  const activity = {
    activityId: "activity",
    messageId: 1,
    revision: 1,
    status: "active" as const,
    topic: "Career",
    agenda: ["Options"],
    channel: "chat" as const,
    plannedMinutes: 10,
    suggestedMinutes: 10,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    endedAt: null,
  };
  const turn = await createCareerCapabilityTurn({
    admin,
    userId: "user-a",
    conversationId: "conversation-a",
    sourceMessage: source,
    mode: "progressive",
    promptArgs: {
      ...promptArgs,
      careerCoachingActivity: activity,
      conversationMode: "career_coaching",
    },
    eligibleTools: [
      {
        type: "function",
        function: {
          name: "manage_career_coaching_activity",
          description: "Manage",
          parameters: { type: "object", properties: {} },
        },
      },
    ],
  });
  const before = turn.runtime.resolveStep();
  await turn.runtime.recordResult(
    "manage_career_coaching_activity",
    {
      ok: true,
      status: "ended",
      activityMessage: {
        coachingActivity: {
          ...activity,
          status: "ended",
          revision: 2,
          endedAt: now,
        },
      },
    },
    before
  );
  const after = turn.runtime.resolveStep();
  assert.ok(
    after.systemBlocks.some(
      (block) => block.key === "post_onboarding_conversation_guide"
    )
  );
  assert.ok(
    !after.systemBlocks.some((block) =>
      block.text.includes("## Active focused career-coaching conversation")
    )
  );
});
