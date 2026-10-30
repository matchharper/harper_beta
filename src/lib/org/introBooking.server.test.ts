import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, test } from "node:test";

// The real helper with its database-backed steps replaced; no mail is sent.
const calls: string[] = [];
let blocker: string | null = null;
let stagePayload: Record<string, unknown> = {};
let stageInput: Record<string, unknown> | null = null;
let stageError: Error | null = null;
let prepareInput: Record<string, unknown> | null = null;
let approvalLink: { url: string } | null = null;
const LINK = "https://example.invalid/meeting/token";

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
      prepareMeetingScheduleDraftForStage: async (
        input: Record<string, unknown>
      ) => {
        calls.push("prepare");
        prepareInput = input;
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
          invitationUrl: LINK,
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
    "@/lib/org/billing/connections": {
      findConnectionApproval: async () =>
        approvalLink
          ? { action_payload: { input: { introBookingLink: approvalLink } } }
          : null,
    },
    "@/lib/org/server": {
      OrgHttpError: class extends Error {},
      setOrgCandidateStage: async (input: Record<string, unknown>) => {
        calls.push("stage");
        stageInput = input;
        if (stageError) throw stageError;
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
  stageError = null;
  prepareInput = null;
  approvalLink = null;
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
    url: LINK,
  });
  assert.equal(prepareInput?.meetingPurpose, "서로를 알아 가는 첫 대화");
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

test("a failed move takes the link back so the candidate never sees it", async () => {
  stageError = new Error("Candidate is no longer awaiting a connection decision");
  await assert.rejects(
    helper.setOrgCandidateStageWithIntroBooking({
      baseUrl: "https://example.invalid",
      booking: "if_ready",
      stage: accept,
    })
  );
  assert.deepEqual(calls, ["prepare", "draft", "reserve", "stage", "released"]);
});

test("a failed email keeps the link its saved approval retries with", async () => {
  stageError = new Error("Resend failed");
  approvalLink = { url: LINK };
  await assert.rejects(
    helper.setOrgCandidateStageWithIntroBooking({
      baseUrl: "https://example.invalid",
      booking: "if_ready",
      stage: accept,
    })
  );
  assert.deepEqual(calls, ["prepare", "draft", "reserve", "stage"]);
});

test("an old screen re-sent after the connection sends nothing and releases the link", async () => {
  stagePayload = { introEmailMessageId: null, stage: "connected" };
  const result = await helper.setOrgCandidateStageWithIntroBooking({
    baseUrl: "https://example.invalid",
    booking: "if_ready",
    stage: accept,
  });
  assert.deepEqual(calls, ["prepare", "draft", "reserve", "stage", "released"]);
  assert.equal(result.bookingLinkIncluded, false);
});

test("a repeated click after an email that carried this link changes nothing", async () => {
  stagePayload = { stage: "connected" };
  approvalLink = { url: LINK };
  const result = await helper.setOrgCandidateStageWithIntroBooking({
    baseUrl: "https://example.invalid",
    booking: "if_ready",
    stage: accept,
  });
  assert.deepEqual(calls, ["prepare", "draft", "reserve", "stage"]);
  assert.equal(result.bookingLinkIncluded, true);
});

test("a custom stage keeps its own saved meeting topic", async () => {
  await helper.setOrgCandidateStageWithIntroBooking({
    baseUrl: "https://example.invalid",
    booking: "if_ready",
    stage: { ...accept, stage: "custom:stage-1" as never },
  });
  assert.equal(prepareInput?.meetingPurpose, undefined);
  assert.equal(prepareInput?.stageId, "stage-1");
});
