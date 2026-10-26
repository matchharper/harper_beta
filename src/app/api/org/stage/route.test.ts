import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import type { NextRequest } from "next/server";

// Exercise the actual handler with isolated dependencies; no database or mail.
const calls: string[] = [];
let setupFails = false,
  previewFails = false,
  queueFails = false;
let scheduleStatus = "preparing";
let companyUpdateJobId: string | null = null;
let queued: any, stageArgs: any;
class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
let POST: typeof import("./route").POST;
before(async () => {
  const mod = Module as any,
    original = mod._load;
  const mocks: Record<string, unknown> = {
    "@/lib/org/billing/http": { billingErrorResponse: () => null },
    "@/lib/server/candidateAccess": {
      requireAuthenticatedUser: async () => ({ id: "member" }),
    },
    "@/lib/org/server": {
      OrgHttpError: HttpError,
      setOrgCandidateStage: async (args: any) => {
        calls.push("accept");
        stageArgs = args;
        return {
          ok: true,
          companyUpdateJobId,
          stage: "connected",
          roleId: "role",
          talentId: "talent",
        };
      },
    },
    "@/lib/org/agent/webActionTurn": {
      enqueueOrgAgentWebActionTurn: async () => {
        calls.push("notify");
        return { jobId: "job" };
      },
    },
    "@/lib/siteUrl": {
      getPublicSiteUrlFromRequest: () => "https://example.invalid",
    },
    "@/lib/meetings/scheduleDraftServer": {
      prepareMeetingScheduleDraftForStage: async () => {
        calls.push("setup");
        if (setupFails) throw new HttpError(400, "Calendar required");
        return {};
      },
      createMeetingScheduleDraft: async (args: any) => {
        calls.push("draft");
        assert.equal(args.sourceCompanyMessageId, null);
        assert.equal(args.webRequestKey, "initial-connection");
        return { scheduleId: "meeting" };
      },
      fetchMeetingScheduleDetail: async () => ({
        schedule: { status: scheduleStatus, version: 1, round: {} },
      }),
    },
    "@/lib/meetings/invitationServer": {
      prepareMeetingInvitationPreview: async () => {
        calls.push("preview");
        if (previewFails) throw new HttpError(400, "No available slots");
        return {
          email: {
            subject: "Interview",
            body: "Choose a time",
            candidateMessage: "Candidate note",
          },
        };
      },
      queueMeetingInvitation: async (args: any) => {
        calls.push("send");
        queued = args;
        if (queueFails) throw new Error("Delivery unavailable");
      },
    },
  };
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request in mocks
      ? mocks[request]
      : original.call(this, request, parent, isMain);
  };
  try {
    ({ POST } = await import("./route"));
  } finally {
    mod._load = original;
  }
});
async function submit(overrides: Record<string, unknown> = {}) {
  return POST(
    new Request("https://example.invalid/api/org/stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: "workspace",
        roleId: "role",
        recommendationId: "recommendation",
        talentId: "talent",
        stage: "connected",
        sourceStage: "pending_connection",
        scheduleInterview: true,
        ...overrides,
      }),
    }) as NextRequest
  );
}
function reset() {
  calls.length = 0;
  setupFails = previewFails = queueFails = false;
  scheduleStatus = "preparing";
  queued = stageArgs = null;
}
test("interview prepares before accepting, then sends once without a second confirmation", async () => {
  reset();
  const response = await submit();
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    "setup",
    "draft",
    "preview",
    "accept",
    "send",
    "notify",
  ]);
  assert.equal(stageArgs.scheduleInterview, true);
  assert.equal(queued.sendImmediately, true);
  assert.equal(queued.candidateMessage, "Candidate note");
});
test("missing setup or available slots does not accept or email the candidate", async () => {
  for (const blocker of ["setup", "preview"]) {
    reset();
    setupFails = blocker === "setup";
    previewFails = blocker === "preview";
    assert.equal((await submit()).status, 400);
    assert.ok(!calls.includes("accept"));
    assert.ok(!calls.includes("send"));
  }
});
test("an already requested interview is not sent twice", async () => {
  reset();
  scheduleStatus = "awaiting_talent";
  assert.equal((await submit()).status, 409);
  assert.ok(!calls.includes("send"));
});
test("connection-only retains the existing path", async () => {
  reset();
  assert.equal((await submit({ scheduleInterview: false })).status, 200);
  assert.deepEqual(calls, ["accept", "notify"]);
  assert.equal(stageArgs.scheduleInterview, false);
});
test("delivery failure reports the completed connection without claiming email success", async () => {
  reset();
  queueFails = true;
  const response = await submit();
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /연결은 완료/);
  assert.ok(!calls.includes("notify"));
});
test("rejects incompatible stage or contact choices before side effects", async () => {
  for (const overrides of [
    { stage: "process_stopped" },
    { sourceStage: "connected" },
    { contactDirectly: true },
  ]) {
    reset();
    assert.equal((await submit(overrides)).status, 400);
    assert.deepEqual(calls, []);
  }
});


test("a durable company decision event is returned without queuing a duplicate turn", async () => {
  companyUpdateJobId = "decision-event";
  calls.length = 0;
  try {
    const response = await submit({ scheduleInterview: false });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).agentJobId, "decision-event");
    assert.equal(calls.includes("notify"), false);
  } finally { companyUpdateJobId = null; }
});
