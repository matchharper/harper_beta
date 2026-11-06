import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, test } from "node:test";
import type { NextRequest } from "next/server";

// POST /api/org/decisions with the real dispatcher and the write functions,
// database and Harper wake-up replaced. Nothing is sent.
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const writes: Array<{ fn: string; args: Record<string, any> }> = [];
const wakes: Array<Record<string, any>> = [];
let authenticated = true;
let companyUpdateJobId: string | null = null;
const tables: Record<string, Array<Record<string, any>>> = {};
const admin = {
  from(table: string) {
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    const query: any = {
      select: () => query,
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), query),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), query),
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: (tables[table] ?? []).find((row) => filters.every((f) => f(row))) ?? null, error: null }),
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))), error: null }),
    };
    return query;
  },
};
const write = (fn: string) => async (args: Record<string, any>) => {
  writes.push({ fn, args });
  if (args.talentId === "talent-late" || args.stage?.talentId === "talent-late")
    throw new HttpError(409, "Candidate is no longer awaiting a connection decision");
  if (fn === "pass") return { introCandidateId: args.introCandidateId, ok: true, status: "passed" };
  if (fn === "request")
    return { introCandidateId: args.introCandidateId, ok: true, status: "requested", newIntroCreated: true, stageTag: null, candidateAcceptedAt: null };
  if (fn === "save") return { ok: true, savedAt: "2026-11-07T00:00:00Z" };
  const input = fn === "booking" ? args.stage : args;
  const payload = {
    ok: true,
    companyUpdateJobId: input.stage === "process_stopped" ? companyUpdateJobId : null,
    closureNotificationDelivered: false,
    introEmailMessageId: fn === "booking" ? "intro" : null,
    roleId: input.roleId,
    stage: input.stage,
    talentId: input.talentId,
  };
  return fn === "booking" ? { bookingLinkIncluded: true, meeting: { scheduleId: "schedule" }, payload } : payload;
};

let POST: typeof import("./route").POST;
before(async () => {
  const mod = Module as any;
  const original = mod._load;
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/server/candidateAccess": {
      requireAuthenticatedUser: async () => {
        if (!authenticated) throw new Error("Unauthorized");
        return { id: "member", email: "member@example.invalid" };
      },
      getSupabaseAdmin: () => admin,
    },
    "@/lib/org/server": {
      OrgHttpError: HttpError,
      assertOrgRoleAccess: async () => undefined,
      passOrgCompanyIntro: write("pass"),
      requestOrgCompanyIntro: write("request"),
      setOrgCandidateStage: write("stage"),
    },
    "@/lib/org/introBooking.server": { setOrgCandidateStageWithIntroBooking: write("booking") },
    "@/lib/org/candidateSave.server": { setOrgCandidateSaved: write("save") },
    "@/lib/org/agent/webActionTurn": {
      enqueueOrgAgentWebActionTurn: async (args: Record<string, any>) => {
        wakes.push(args);
        return { jobId: `job:${args.actionName}` };
      },
    },
    "@/lib/siteUrl": { getPublicSiteUrlFromRequest: () => "https://example.invalid" },
  };
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request in mocks ? mocks[request] : original.call(this, request, parent, isMain);
  };
  try {
    ({ POST } = await import("./route"));
  } finally {
    mod._load = original;
  }
});
beforeEach(() => {
  writes.length = 0;
  wakes.length = 0;
  authenticated = true;
  companyUpdateJobId = null;
  tables.company_intro_candidates = [
    { id: "card-1", company_workspace_id: "workspace", role_id: "role-a", talent_id: "talent-c1" },
    { id: "card-2", company_workspace_id: "workspace", role_id: "role-a", talent_id: "talent-c2" },
  ];
  tables.company_internal_roles = [{ role_id: "role-a", criteria: [{ id: "c1", name: "트래픽", criteria: "x" }] }];
  tables.company_decision_events = [];
  tables.company_workspace_credit_events = [];
});

function submit(body: Record<string, unknown>) {
  return POST(
    new Request("https://example.invalid/api/org/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "workspace", ...body }),
    }) as NextRequest
  );
}
const rec = (talentId: string) => ({ recommendationId: `rec-${talentId}`, roleId: "role-a", talentId });

test("one request decides many candidates, each with its own result", async () => {
  const items = [
    { target: { introCandidateId: "card-1" }, to: "passed", reason: { text: "연차 부족", tags: ["c1"] }, idempotencyKey: "k1" },
    { target: { introCandidateId: "card-2" }, to: "intro_requested", appeal: "분산 시스템", connection: { introRecipientEmails: ["t@example.invalid"] }, idempotencyKey: "k2" },
    { target: rec("talent-1"), to: "connected", from: "pending_connection", connection: { introBooking: "if_ready", introEmails: ["t@example.invalid"] }, idempotencyKey: "k3" },
    { target: rec("talent-late"), to: "connected", from: "pending_connection", idempotencyKey: "k4" },
    { target: rec("talent-2"), to: "process_stopped", from: "connected", notifyCandidateOnClosure: false, idempotencyKey: "k5" },
    { target: rec("talent-3"), to: "saved", idempotencyKey: "k6" },
  ];
  const response = await submit({ items });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.ok, true);
  assert.deepEqual(
    json.results.map((r: any) => [r.idempotencyKey, r.status, r.undo, Object.keys(r.effects).sort()]),
    items.map((item, index) => [
      item.idempotencyKey,
      index === 3 ? "failed" : "applied",
      null,
      ["candidateNotice", "creditUsed", "introEmail"],
    ])
  );
  assert.deepEqual(json.results[3].error, { status: 409, message: "Candidate is no longer awaiting a connection decision" });
  assert.equal(json.results[2].effects.introEmail, true);
  assert.equal(json.results[4].effects.candidateNotice, false);
  assert.ok(json.results.every((r: any) => !("outcome" in r)), "internal results stay on the server");

  // Every write is a web decision; Pass carries its tags.
  for (const { fn, args } of writes) {
    const input = fn === "booking" ? args.stage : args;
    assert.equal(fn === "stage" || fn === "booking" ? input.decisionChannel : input.channel, "web", fn);
  }
  assert.deepEqual(writes.find((w) => w.fn === "pass")!.args.reasonTags, ["c1"]);

  // Harper wakes once per decision that took effect, in the batched kinds;
  // the save and the failed move do not wake it.
  assert.deepEqual(
    wakes.map((wake) => [wake.actionName, wake.roleId]),
    [
      ["company_intro_decision", "role-a"],
      ["company_intro_decision", "role-a"],
      ["candidate_stage_changed", "role-a"],
      ["candidate_stage_changed", "role-a"],
    ]
  );
  assert.equal(wakes[2].actionContext.meetingScheduleId, "schedule");
  assert.equal(wakes[3].idempotencyKey, "org-web:workspace:member:candidate-stage:role-a:talent-2:process_stopped:k5");
  assert.deepEqual(json.agentJobIds.sort(), ["job:candidate_stage_changed", "job:company_intro_decision"]);
});

test("a decision that already queued its company update does not wake Harper again", async () => {
  companyUpdateJobId = "update-job";
  const response = await submit({ items: [{ target: rec("talent-2"), to: "process_stopped", idempotencyKey: "k" }] });
  const json = await response.json();
  assert.deepEqual(json.agentJobIds, ["update-job"]);
  assert.equal(wakes.length, 0);
});

test("at most 50 items, each with a key; bad input changes nothing", async () => {
  const item = (n: number) => ({ target: rec(`talent-${n}`), to: "custom:s", idempotencyKey: `k${n}` });
  for (const body of [
    { items: Array.from({ length: 51 }, (_, n) => item(n)) },
    { items: [] },
    { items: "all" },
    { items: [item(1), { ...item(2), idempotencyKey: "" }] },
    { items: [{ ...item(1), connection: { scheduleInterview: true } }] },
    { workspaceId: "", items: [item(1)] },
  ]) {
    writes.length = 0;
    const response = await submit(body);
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 80));
    assert.deepEqual(writes, []);
  }
  const fifty = await submit({ items: Array.from({ length: 50 }, (_, n) => item(n)) });
  assert.equal(fifty.status, 200);
  assert.equal(writes.length, 50);
});

test("an unknown reason tag fails that item only", async () => {
  const response = await submit({
    items: [
      { target: rec("talent-1"), to: "process_stopped", reason: { tags: ["not-a-tag"] }, idempotencyKey: "a" },
      { target: rec("talent-2"), to: "process_stopped", reason: { tags: ["c1"] }, idempotencyKey: "b" },
    ],
  });
  const json = await response.json();
  assert.deepEqual(json.results.map((r: any) => r.status), ["failed", "applied"]);
  assert.equal(json.results[0].error.status, 400);
  assert.deepEqual(writes.map((w) => w.args.talentId), ["talent-2"]);
});

test("the same sign-in check as the other decision routes", async () => {
  authenticated = false;
  const response = await submit({ items: [{ target: rec("talent-1"), to: "custom:s", idempotencyKey: "k" }] });
  assert.equal(response.status, 401);
  assert.deepEqual(writes, []);
});
