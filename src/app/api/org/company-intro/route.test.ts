import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import type { NextRequest } from "next/server";

// The route with its database and Harper steps replaced. Checks that Pass and
// intro requests keep their request and response shapes and reach the same
// write functions with the same input (S2: the route now goes through the
// decision dispatcher).
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const calls: Array<[string, Record<string, unknown>]> = [];
const wakes: Record<string, unknown>[] = [];
let failWith: Error | null = null;
const card = {
  role_id: "role",
  talent_id: "talent",
  status: "passed",
  requested_at: null,
  candidate_sent_at: null,
  talent_decision_at: null,
  close_reason: "company_passed",
  company_appeal: null,
  next_stage_id: null,
  updated_at: "2026-11-06T00:00:00Z",
};
const admin = {
  from(table: string) {
    assert.equal(table, "company_intro_candidates");
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: card, error: null }),
    };
    return query;
  },
};
let POST: typeof import("./route").POST;
before(async () => {
  const mod = Module as any;
  const original = mod._load;
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/org/billing/http": { billingErrorResponse: () => null },
    "@/lib/server/candidateAccess": {
      requireAuthenticatedUser: async () => ({ id: "member", email: "m@example.invalid" }),
      getSupabaseAdmin: () => admin,
    },
    "@/lib/org/server": {
      OrgHttpError: HttpError,
      passOrgCompanyIntro: async (args: Record<string, unknown>) => {
        calls.push(["pass", args]);
        if (failWith) throw failWith;
        return { introCandidateId: "card", ok: true, status: "passed" };
      },
      requestOrgCompanyIntro: async (args: Record<string, unknown>) => {
        calls.push(["request", args]);
        if (failWith) throw failWith;
        return {
          candidateAcceptedAt: null,
          stageTag: null,
          newIntroCreated: true,
          deliveryRunId: "run",
          introCandidateId: "card",
          ok: true,
          status: "requested",
        };
      },
    },
    "@/lib/org/agent/webActionTurn": {
      enqueueOrgAgentWebActionTurn: async (args: Record<string, unknown>) => {
        wakes.push(args);
        return { jobId: "job" };
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

function submit(body: Record<string, unknown>) {
  return POST(
    new Request("https://example.invalid/api/org/company-intro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "workspace", introCandidateId: "card", ...body }),
    }) as NextRequest
  );
}
function reset() {
  calls.length = 0;
  wakes.length = 0;
  failWith = null;
}
// A missing source message is what the route always sent.
function comparable(args: Record<string, unknown>) {
  const { user, ...rest } = args;
  return {
    user: (user as { id: string }).id,
    ...Object.fromEntries(
      Object.entries(rest).filter(
        ([, value]) => value !== undefined && value !== null
      )
    ),
  };
}

test("Pass keeps its input, response and Harper wake-up", async () => {
  reset();
  const response = await submit({ action: "pass", reason: "  연봉 기대가 높아요 ", agentActionId: "a1" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    introCandidateId: "card",
    ok: true,
    status: "passed",
    agentJobId: "job",
    candidateUpdate: {
      roleId: "role",
      talentId: "talent",
      status: "passed",
      requestedAt: null,
      candidateSentAt: null,
      talentDecisionAt: null,
      closeReason: "company_passed",
      companyAppeal: null,
      nextStageId: null,
      updatedAt: "2026-11-06T00:00:00Z",
    },
  });
  assert.equal(calls.length, 1);
  const [name, args] = calls[0];
  assert.equal(name, "pass");
  const { reasonTags, ...rest } = args as Record<string, unknown> & { reasonTags?: unknown };
  assert.ok(reasonTags === undefined || (Array.isArray(reasonTags) && reasonTags.length === 0));
  assert.deepEqual(comparable(rest), {
    user: "member",
    channel: "web",
    introCandidateId: "card",
    reason: "연봉 기대가 높아요",
    workspaceId: "workspace",
  });
  assert.equal(wakes.length, 1);
  assert.equal(wakes[0].actionName, "company_intro_decision");
  assert.equal(wakes[0].idempotencyKey, "org-web:workspace:member:company-intro:card:pass:a1");
  // Harper's wake says where the decision came from and the reason it already has.
  assert.deepEqual(wakes[0].actionContext, { decision: "pass", introCandidateId: "card", status: "passed", channel: "web", reasonText: "연봉 기대가 높아요" });
});

test("a Pass without a reason sends none", async () => {
  reset();
  assert.equal((await submit({ action: "pass" })).status, 200);
  assert.equal(calls[0][1].reason, undefined);
  assert.deepEqual(wakes[0].actionContext, { decision: "pass", introCandidateId: "card", status: "passed", channel: "web" });
});

test("an intro request keeps its input (the appeal goes as given) and response", async () => {
  reset();
  const response = await submit({
    action: "request",
    companyAppeal: "분산 시스템 경험",
    introRecipientEmails: ["team@example.invalid"],
    nextStageId: " stage ",
    agentActionId: "a2",
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.status, "requested");
  assert.equal(json.newIntroCreated, true);
  assert.equal(json.deliveryRunId, "run");
  assert.equal(json.agentJobId, "job");
  const [name, args] = calls[0];
  assert.equal(name, "request");
  assert.deepEqual(comparable(args), {
    user: "member",
    channel: "web",
    companyAppeal: "분산 시스템 경험",
    introCandidateId: "card",
    introRecipientEmails: ["team@example.invalid"],
    nextStageId: "stage",
    workspaceId: "workspace",
  });
  assert.equal(wakes[0].idempotencyKey, "org-web:workspace:member:company-intro:card:request:a2");
  assert.equal((wakes[0].actionContext as Record<string, unknown>).nextStageId, "stage");
  assert.equal((wakes[0].actionContext as Record<string, unknown>).channel, "web");
});

test("errors keep their status and message", async () => {
  reset();
  failWith = new HttpError(409, "이미 처리되었거나 답변을 기다리는 후보자입니다.");
  const response = await submit({ action: "request", companyAppeal: "x" });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "이미 처리되었거나 답변을 기다리는 후보자입니다." });
  assert.equal(wakes.length, 0);
  reset();
  assert.equal((await submit({ action: "other" })).status, 400);
  assert.equal(calls.length, 0);
});
