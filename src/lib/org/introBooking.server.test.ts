import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, test } from "node:test";

// The real helper with its database-backed steps replaced; no mail is sent.
const calls: string[] = [];
let blocker: string | null = null;
let stagePayload: Record<string, unknown> = {};
let stageInput: Record<string, unknown> | null = null;

type Helper = typeof import("./introBooking.server");
let helper: Helper;

before(async () => {
  const mod = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const original = mod._load;
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/meetings/scheduleDraftServer": {
      prepareMeetingScheduleDraftForStage: async () => {
        calls.push("prepare");
        return { draft: { draftBlocker: blocker } };
      },
      createMeetingScheduleDraft: async () => {
        calls.push("draft");
        return { scheduleId: "schedule" };
      },
    },
    "@/lib/meetings/invitationServer": {
      reserveMeetingInvitationForIntro: async () => {
        calls.push("reserve");
        return {
          invitationUrl: "https://example.invalid/meeting/token",
          linkLabel: "인터뷰 가능 시간 선택하기",
          queueId: "queue",
          roundId: "round",
        };
      },
      markMeetingInvitationSentInIntro: async () => {
        calls.push("delivered");
      },
      releaseMeetingInvitationHeldForIntro: async () => {
        calls.push("released");
      },
    },
    "@/lib/org/server": {
      OrgHttpError: class extends Error {},
      setOrgCandidateStage: async (input: Record<string, unknown>) => {
        calls.push("stage");
        stageInput = input;
        return stagePayload;
      },
    },
    "@/lib/org/stageTiming.server": {
      traceStageStep: (_label: string, run: () => Promise<unknown>) => run(),
    },
  };
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request in mocks
      ? mocks[request]
      : original.call(this, request, parent, isMain);
  };
  try {
    helper = await import("./introBooking.server");
  } finally {
    mod._load = original;
  }
});

beforeEach(() => {
  calls.length = 0;
  blocker = null;
  stageInput = null;
  stagePayload = { introEmailMessageId: "message", stage: "connected" };
});

const accept = {
  expectedPreviousStage: "pending_connection" as const,
  introEmails: ["team@example.invalid"],
  recommendationId: "recommendation",
  roleId: "role",
  stage: "connected" as const,
  talentId: "talent",
  user: { email: "team@example.invalid", id: "member" },
  workspaceId: "workspace",
} as Parameters<Helper["setOrgCandidateStageWithIntroBooking"]>[0]["stage"];

test("a ready Calendar puts the booking link in the intro email", async () => {
  const result = await helper.setOrgCandidateStageWithIntroBooking({
    baseUrl: "https://example.invalid",
    booking: "if_ready",
    stage: accept,
  });
  assert.deepEqual(calls, [
    "prepare",
    "draft",
    "reserve",
    "stage",
    "delivered",
  ]);
  assert.equal(result.bookingLinkIncluded, true);
  assert.deepEqual(stageInput?.introBookingLink, {
    label: "인터뷰 가능 시간 선택하기",
    url: "https://example.invalid/meeting/token",
  });
});

test("without Calendar or open times the intro goes without a link", async () => {
  blocker = "calendar_connection_missing";
  const result = await helper.setOrgCandidateStageWithIntroBooking({
    baseUrl: "https://example.invalid",
    booking: "if_ready",
    stage: accept,
  });
  assert.deepEqual(calls, ["prepare", "stage"]);
  assert.equal(result.bookingLinkIncluded, false);
  assert.equal(stageInput?.introBookingLink, undefined);
});

test("a candidate who must first confirm gets nothing, and the link is released", async () => {
  stagePayload = { status: "candidate_reengagement_required" };
  const result = await helper.setOrgCandidateStageWithIntroBooking({
    baseUrl: "https://example.invalid",
    booking: "if_ready",
    stage: accept,
  });
  assert.deepEqual(calls, ["prepare", "draft", "reserve", "stage", "released"]);
  assert.equal(result.bookingLinkIncluded, false);
});

test("rejecting or contacting directly never reserves a link", async () => {
  await helper.setOrgCandidateStageWithIntroBooking({
    baseUrl: "https://example.invalid",
    booking: "if_ready",
    stage: { ...accept, stage: "process_stopped" },
  });
  await helper.setOrgCandidateStageWithIntroBooking({
    baseUrl: "https://example.invalid",
    booking: "if_ready",
    stage: { ...accept, contactDirectly: true },
  });
  assert.deepEqual(calls, ["stage", "stage"]);
});
