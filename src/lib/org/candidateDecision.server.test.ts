import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, test } from "node:test";

// The dispatcher with the write functions and the database replaced. Nothing
// is sent; each write function records what it was asked to do.
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
type Call = { fn: string; args: Record<string, any> };
const calls: Call[] = [];
const movedTo = (args: Record<string, any>) => ({
  ok: true,
  companyUpdateJobId: null,
  introEmailMessageId: null,
  roleId: args.roleId,
  stage: args.stage,
  talentId: args.talentId,
});
let stageResult: (args: Record<string, any>) => Record<string, any> = movedTo;
let failOn: ((call: Call) => Error | null) = () => null;
let inFlight = 0;
let maxInFlight = 0;
let describeFails = false;

// In-memory tables the dispatcher reads.
const tables: Record<string, Array<Record<string, any>>> = {};
function resetTables() {
  tables.company_intro_candidates = [
    { id: "card-1", company_workspace_id: "workspace", role_id: "role", talent_id: "talent-c1" },
    { id: "card-2", company_workspace_id: "workspace", role_id: "role", talent_id: "talent-c2" },
  ];
  tables.company_internal_roles = [
    {
      role_id: "role",
      criteria: [
        { id: "c-traffic", name: "대규모 트래픽", criteria: "..." },
        { name: "팀 리드 경험", criteria: "..." },
      ],
    },
  ];
  tables.company_decision_events = [];
  tables.company_workspace_credit_events = [];
}
const admin = {
  from(table: string) {
    if (describeFails && table !== "company_internal_roles" && table !== "company_intro_candidates")
      throw new Error("read failed");
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    let descending = false;
    const query: any = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return query;
      },
      order: (_column: string, options?: { ascending?: boolean }) => {
        descending = options?.ascending === false;
        return query;
      },
      limit: () => query,
      maybeSingle: async () => {
        const rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
        if (descending) rows.reverse();
        return { data: rows[0] ?? null, error: null };
      },
    };
    return query;
  },
};

function record(fn: string) {
  return async (args: Record<string, any>) => {
    const call = { fn, args };
    calls.push(call);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const error = failOn(call);
      if (error) throw error;
      if (fn === "pass") return { introCandidateId: args.introCandidateId, ok: true, status: "passed" };
      if (fn === "request")
        return { introCandidateId: args.introCandidateId, ok: true, status: "requested", newIntroCreated: true };
      if (fn === "save") return { ok: true, savedAt: args.saved ? "2026-11-07T00:00:00Z" : null };
      if (fn === "booking")
        return {
          bookingLinkIncluded: true,
          meeting: { scheduleId: "schedule" },
          payload: { ...stageResult(args.stage), introEmailMessageId: "intro-message" },
        };
      return stageResult(args);
    } finally {
      inFlight -= 1;
    }
  };
}

type Dispatcher = typeof import("./candidateDecision.server");
let dispatcher: Dispatcher;
before(async () => {
  const mod = Module as any;
  const original = mod._load;
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/server/candidateAccess": { getSupabaseAdmin: () => admin },
    "@/lib/org/server": {
      OrgHttpError: HttpError,
      assertOrgRoleAccess: async (args: Record<string, any>) => {
        calls.push({ fn: "access", args });
        if (args.roleId === "forbidden-role") throw new HttpError(404, "Role not found");
      },
      passOrgCompanyIntro: record("pass"),
      requestOrgCompanyIntro: record("request"),
      setOrgCandidateStage: record("stage"),
    },
    "@/lib/org/introBooking.server": {
      setOrgCandidateStageWithIntroBooking: record("booking"),
    },
    "@/lib/org/candidateSave.server": { setOrgCandidateSaved: record("save") },
  };
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request in mocks ? mocks[request] : original.call(this, request, parent, isMain);
  };
  try {
    dispatcher = await import("./candidateDecision.server");
  } finally {
    mod._load = original;
  }
});
beforeEach(() => {
  calls.length = 0;
  failOn = () => null;
  inFlight = maxInFlight = 0;
  describeFails = false;
  stageResult = movedTo;
  resetTables();
});

const actor = { id: "member", email: "member@example.invalid" } as any;
const rec = (talentId = "talent-1") => ({ recommendationId: `rec-${talentId}`, roleId: "role", talentId });
const writes = () => calls.filter((call) => call.fn !== "access");
const ctx = (channel: "web" | "chat" | "slack" | "email", sourceMessageId: number | null = null) => ({
  actor,
  baseUrl: "https://example.invalid",
  channel,
  sourceMessageId,
  workspaceId: "workspace",
});

test("mapping table x channel: each decision reaches its existing write function", async () => {
  for (const channel of ["web", "chat", "slack", "email"] as const) {
    const message = channel === "web" ? null : 77;
    const rows: Array<[Parameters<Dispatcher["decideOrgCandidate"]>[0]["item"], string]> = [
      [{ target: { introCandidateId: "card-1" }, to: "intro_requested", appeal: "분산 시스템 경험",
        connection: { introRecipientEmails: ["team@example.invalid"], nextStageId: "stage-1" } }, "request"],
      [{ target: { introCandidateId: "card-1" }, to: "passed", reason: { text: "연차 부족" } }, "pass"],
      [{ target: rec(), to: "connected", from: "pending_connection",
        connection: { introBooking: "if_ready", introEmails: ["team@example.invalid"] } }, "booking"],
      [{ target: rec(), to: "custom:stage-1", from: "pending_connection", connection: { introBooking: "required" } }, "booking"],
      [{ target: rec(), to: "connected", from: "pending_connection", connection: { introEmails: ["team@example.invalid"] } }, "stage"],
      [{ target: rec(), to: "process_stopped", from: "connected", notifyCandidateOnClosure: false }, "stage"],
      [{ target: rec(), to: "custom:stage-2", from: "connected" }, "stage"],
      [{ target: rec(), to: "saved" }, "save"],
      [{ target: { introCandidateId: "card-2" }, to: "unsaved" }, "save"],
    ];
    for (const [item, fn] of rows) {
      calls.length = 0;
      const outcome = await dispatcher.decideOrgCandidate({ ...ctx(channel, message), item });
      assert.deepEqual(writes().map((call) => call.fn), [fn], `${channel} ${item.to}`);
      const args = writes()[0].args;
      const stageArgs = fn === "booking" ? args.stage : args;
      if (fn === "request" || fn === "pass") {
        assert.equal(args.channel, channel);
        assert.equal(args.sourceMessageId, message);
        assert.equal(outcome.kind, "company_intro");
      } else if (fn === "save") {
        assert.equal(args.channel, channel);
        assert.equal(outcome.kind, "save");
      } else {
        assert.equal(stageArgs.decisionChannel, channel);
        assert.equal(stageArgs.sourceMessageId, message ?? undefined);
        assert.equal(stageArgs.stage, item.to);
        assert.equal(stageArgs.expectedPreviousStage, item.from);
        assert.equal(outcome.kind, "stage");
      }
      assert.equal(outcome.status, "applied");
    }
  }
  assert.equal(
    dispatcher.resolveOrgDecisionPath({ target: rec(), to: "process_stopped", connection: { introBooking: "required" } }),
    "stop",
    "a stop never goes through the booking helper"
  );
});

test("decisions that do not fit their target are refused before any write", async () => {
  for (const item of [
    { target: { introCandidateId: "card-1" }, to: "process_stopped" },
    { target: { introCandidateId: "card-1" }, to: "connected" },
    { target: rec(), to: "passed" },
    // A reason would be lost on these, and the appeal is not the reason.
    { target: { introCandidateId: "card-1" }, to: "intro_requested", appeal: "x", reason: { text: "내부 메모" } },
    { target: rec(), to: "saved", reason: { tags: ["c-traffic"] } },
  ] as const) {
    calls.length = 0;
    await assert.rejects(
      dispatcher.decideOrgCandidate({ ...ctx("web"), item: item as any }),
      (error: any) => error instanceof HttpError && error.status === 400
    );
    assert.deepEqual(writes(), []);
  }
});

test("candidate-facing input reaches the write functions exactly as given", async () => {
  // Intro request: the appeal (candidate sees it) and recipients as given; the
  // company's reason never becomes the appeal.
  await dispatcher.decideOrgCandidate({
    ...ctx("chat", 5),
    item: { target: { introCandidateId: "card-1" }, to: "intro_requested", appeal: "  분산 시스템 경험 ",
      connection: { introRecipientEmails: ["a@example.invalid", "b@example.invalid"], nextStageId: null } },
  });
  assert.deepEqual(writes()[0].args, {
    channel: "chat",
    companyAppeal: "  분산 시스템 경험 ",
    introCandidateId: "card-1",
    introRecipientEmails: ["a@example.invalid", "b@example.invalid"],
    nextStageId: null,
    sourceMessageId: 5,
    user: actor,
    workspaceId: "workspace",
  });

  // Stop: the closure notice choice and the note go as given.
  for (const notify of [true, false, undefined]) {
    calls.length = 0;
    await dispatcher.decideOrgCandidate({
      ...ctx("web"),
      item: { target: rec(), to: "process_stopped", from: "connected", notifyCandidateOnClosure: notify,
        reason: { text: "다른 후보로 결정" } },
    });
    const args = writes()[0].args;
    assert.equal(args.notifyCandidateOnClosure, notify);
    assert.equal(args.stopNote, "다른 후보로 결정");
    assert.equal("acceptReason" in args, false);
  }

  // Connect: intro email recipients, draft, contact choice and email mode go
  // as given; the reason is the acceptance reason, as on the web.
  calls.length = 0;
  const draft = { subject: "Intro", body: "Hello" };
  await dispatcher.decideOrgCandidate({
    ...ctx("web"),
    item: { target: rec(), to: "connected", from: "pending_connection", reason: { text: "좋은 경험" },
      connection: { contactDirectly: false, emailMode: "send_now", introEmailDraft: draft,
        introEmails: ["team@example.invalid"], reengagementActionId: "r1", reengagementResolution: "company_confirmed",
        scheduleInterview: false, skipAutomaticContact: false, candidateConsentRelayId: "relay" } },
  });
  const { user, ...connect } = writes()[0].args;
  assert.equal(user, actor);
  assert.deepEqual(JSON.parse(JSON.stringify(connect)), {
    acceptReason: "좋은 경험",
    candidateConsentRelayId: "relay",
    contactDirectly: false,
    decisionChannel: "web",
    emailMode: "send_now",
    expectedPreviousStage: "pending_connection",
    introEmailDraft: draft,
    introEmails: ["team@example.invalid"],
    recommendationId: "rec-talent-1",
    reengagementActionId: "r1",
    reengagementResolution: "company_confirmed",
    roleId: "role",
    scheduleInterview: false,
    skipAutomaticContact: false,
    stage: "connected",
    talentId: "talent-1",
    workspaceId: "workspace",
  });

  // Booking link: the helper gets its mode, meeting and the same stage input.
  calls.length = 0;
  const outcome = await dispatcher.decideOrgCandidate({
    ...ctx("slack", 9),
    item: { target: rec(), to: "connected", from: "pending_connection",
      connection: { introBooking: "if_ready", locale: "en", meeting: { title: "Intro call" }, introEmails: ["t@example.invalid"] } },
  });
  const booking = writes()[0].args;
  assert.equal(booking.booking, "if_ready");
  assert.equal(booking.baseUrl, "https://example.invalid");
  assert.equal(booking.locale, "en");
  assert.deepEqual(booking.meeting, { title: "Intro call" });
  assert.deepEqual(booking.stage.introEmails, ["t@example.invalid"]);
  assert.equal("introBookingLink" in booking.stage, false);
  assert.ok(outcome.kind === "stage" && outcome.booking?.linkIncluded === true);
});

test("reason tags are checked against the Role's criteria keys and the fixed categories before any write", async () => {
  await dispatcher.decideOrgCandidate({
    ...ctx("chat", 3),
    item: { target: { introCandidateId: "card-1" }, to: "passed", reason: { text: "x", tags: [" c-traffic ", "팀 리드 경험", "c-traffic"] } },
  });
  assert.deepEqual(calls.map((call) => call.fn), ["access", "pass"]);
  assert.equal(calls[0].args.roleId, "role");
  assert.deepEqual(calls[1].args.reasonTags, ["c-traffic", "팀 리드 경험"]);

  calls.length = 0;
  await dispatcher.decideOrgCandidate({
    ...ctx("web"),
    item: { target: rec(), to: "process_stopped", reason: { tags: ["c-traffic"] } },
  });
  assert.deepEqual(writes()[0].args.reasonTags, ["c-traffic"]);

  // The 4 fixed categories fit any Role.
  calls.length = 0;
  await dispatcher.decideOrgCandidate({
    ...ctx("web"),
    item: { target: rec(), to: "process_stopped", reason: { tags: ["c-traffic", "timing", "working_conditions"] } },
  });
  assert.deepEqual(writes()[0].args.reasonTags, ["c-traffic", "timing", "working_conditions"]);

  for (const tags of [["experience"], ["대규모 트래픽"], ["c-traffic", "unknown"]]) {
    calls.length = 0;
    await assert.rejects(
      dispatcher.decideOrgCandidate({ ...ctx("web"), item: { target: rec(), to: "process_stopped", reason: { tags } } }),
      (error: any) => error.status === 400 && /이유 태그/.test(error.message)
    );
    assert.deepEqual(writes(), []);
  }
  // No access to the Role: nothing about its criteria is read or written.
  calls.length = 0;
  await assert.rejects(
    dispatcher.decideOrgCandidate({
      ...ctx("web"),
      item: { target: { ...rec(), roleId: "forbidden-role" }, to: "process_stopped", reason: { tags: ["c-traffic"] } },
    }),
    (error: any) => error.status === 404
  );
  assert.deepEqual(writes(), []);
  // Without tags no criteria are read (the move checks access itself).
  calls.length = 0;
  await dispatcher.decideOrgCandidate({ ...ctx("web"), item: { target: rec(), to: "process_stopped" } });
  assert.deepEqual(calls.map((call) => call.fn), ["stage"]);
  assert.equal(writes()[0].args.reasonTags, undefined);
});

test("one decision rethrows the write function's error unchanged", async () => {
  const error = new HttpError(409, "Candidate is no longer awaiting a connection decision");
  failOn = () => error;
  await assert.rejects(
    dispatcher.decideOrgCandidate({ ...ctx("web"), item: { target: rec(), to: "connected", from: "pending_connection" } }),
    (thrown) => thrown === error
  );
});

test("bulk: per-item results, 3 at a time, one failure does not stop the others", async () => {
  const billing = Object.assign(new Error("workspace_credits_exhausted"), {});
  failOn = (call) =>
    call.args.talentId === "talent-2"
      ? new HttpError(409, "Candidate is no longer awaiting a connection decision")
      : call.args.introCandidateId === "card-2" && call.fn === "request"
        ? billing
        : call.args.talentId === "talent-3"
          ? new Error("socket hang up")
          : null;
  const items = [
    { target: rec("talent-1"), to: "connected", from: "pending_connection", idempotencyKey: "k1" },
    { target: rec("talent-2"), to: "connected", from: "pending_connection", idempotencyKey: "k2" },
    { target: { introCandidateId: "card-2" }, to: "intro_requested", appeal: "x", idempotencyKey: "k3" },
    { target: rec("talent-3"), to: "process_stopped", idempotencyKey: "k4" },
    ...Array.from({ length: 6 }, (_, n) => ({ target: rec(`talent-x${n}`), to: "custom:s", idempotencyKey: `x${n}` })),
  ] as any[];
  const results = await dispatcher.decideOrgCandidates({ ...ctx("web"), items });
  assert.equal(results.length, items.length);
  assert.deepEqual(results.map((result) => result.status), [
    "applied", "failed", "failed", "failed", ...Array(6).fill("applied"),
  ]);
  assert.deepEqual(results[1].error, { status: 409, message: "Candidate is no longer awaiting a connection decision" });
  assert.equal(results[2].error?.status, 409);
  assert.equal(results[2].error?.billingCode, "credits_exhausted");
  assert.equal(results[3].error?.status, 500);
  assert.match(results[3].error!.message, /바로 다시 시도하지 말고/);
  assert.ok(results.every((result) => result.undo === null));
  assert.ok(maxInFlight <= 3 && maxInFlight >= 2, `ran ${maxInFlight} at a time`);

  await assert.rejects(dispatcher.decideOrgCandidates({ ...ctx("web"), items: [] }), (e: any) => e.status === 400);
  const tooMany = Array.from({ length: 51 }, (_, n) => ({ target: rec(`t${n}`), to: "custom:s", idempotencyKey: `${n}` }));
  await assert.rejects(dispatcher.decideOrgCandidates({ ...ctx("web"), items: tooMany as any }), (e: any) => e.status === 400);
});

test("idempotency: a repeated key runs once in a request and is not run again later", async () => {
  // The decision record holds what the trigger recorded for this key.
  stageResult = (args) => {
    tables.company_decision_events.push({
      id: 500 + tables.company_decision_events.length,
      role_id: args.roleId,
      idempotency_key: `decision:${args.decisionKey}`,
      detail: { progressId: "progress-1" },
    });
    return { ok: true, companyUpdateJobId: null, introEmailMessageId: null, roleId: args.roleId, stage: args.stage, talentId: args.talentId };
  };
  const item = { target: rec(), to: "process_stopped", from: "connected", idempotencyKey: "same" } as any;
  const first = await dispatcher.decideOrgCandidates({ ...ctx("web"), items: [item, { ...item }] });
  assert.equal(writes().length, 1, "a repeat in the same request runs once");
  assert.equal(writes()[0].args.decisionKey, "member:talent-1:same");
  assert.deepEqual(first.map((result) => [result.status, result.decisionId]), [["applied", 500], ["applied", 500]]);

  calls.length = 0;
  const retry = await dispatcher.decideOrgCandidates({ ...ctx("web"), items: [item] });
  assert.deepEqual(writes(), [], "a retried request does not move or notify again");
  assert.deepEqual(retry[0], {
    decisionId: 500,
    effects: { candidateNotice: false, creditUsed: false, introEmail: false },
    status: "already_applied",
    undo: null,
  });

  // Another person's or another candidate's key is not the same decision.
  calls.length = 0;
  await dispatcher.decideOrgCandidates({
    ...ctx("web"),
    items: [{ ...item, target: rec("talent-9") }],
  });
  assert.equal(writes().length, 1);

  // Pass and intro requests are idempotent on the card; the repeat reports
  // unchanged with the earlier decision.
  calls.length = 0;
  tables.company_decision_events.push({ id: 900, company_workspace_id: "workspace", intro_candidate_id: "card-1", action: "pass" });
  failOn = () => null;
  const passed = await dispatcher.decideOrgCandidates({
    ...ctx("web"),
    items: [{ target: { introCandidateId: "card-1" }, to: "passed", idempotencyKey: "p" }],
  });
  assert.deepEqual([passed[0].status, passed[0].decisionId], ["applied", 900]);
});

test("effects: intro email, candidate notice and credit as each path reports them", async () => {
  tables.company_workspace_credit_events.push(
    { id: "credit-1", action_code: "connect", delta: -1 },
    { id: "credit-free", action_code: "connect", delta: 0 },
    { company_workspace_id: "workspace", action_code: "intro_request", business_key: "card-1", delta: -1 },
  );
  tables.company_decision_events.push(
    { id: 3, company_workspace_id: "workspace", intro_candidate_id: "card-1", action: "request_intro" },
  );
  // As the trigger does: each move is recorded under its key, and a paid
  // connection's progress row carries its credit event's id.
  stageResult = (args) => {
    tables.company_decision_events.push({
      id: 100 + tables.company_decision_events.length,
      role_id: args.roleId,
      idempotency_key: `decision:${args.decisionKey}`,
      detail: { progressId: args.talentId === "talent-1" ? "credit-1" : "credit-free" },
    });
    return { ...movedTo(args), introEmailMessageId: args.stage === "connected" ? "intro-1" : null };
  };
  const decide = async (item: any) => (await dispatcher.decideOrgCandidates({ ...ctx("web"), items: [item] }))[0];

  const paid = await decide({ target: rec("talent-1"), to: "connected", from: "pending_connection", idempotencyKey: "c" });
  assert.equal(paid.decisionId, 101);
  assert.deepEqual(paid.effects, { introEmail: true, candidateNotice: false, creditUsed: true });
  const free = await decide({ target: rec("talent-2"), to: "connected", from: "pending_connection", idempotencyKey: "c" });
  assert.deepEqual(free.effects, { introEmail: true, candidateNotice: false, creditUsed: false });
  const later = await decide({ target: rec("talent-2"), to: "custom:s", from: "connected", idempotencyKey: "m" });
  assert.deepEqual(later.effects, { introEmail: false, candidateNotice: false, creditUsed: false });

  const requested = await decide({ target: { introCandidateId: "card-1" }, to: "intro_requested", appeal: "x", idempotencyKey: "r" });
  assert.equal(requested.decisionId, 3);
  assert.deepEqual(requested.effects, { introEmail: false, candidateNotice: true, creditUsed: true });
  const passed = await decide({ target: { introCandidateId: "card-2" }, to: "passed", idempotencyKey: "p" });
  assert.deepEqual(passed.effects, { introEmail: false, candidateNotice: false, creditUsed: false });

  for (const [notify, expected] of [[undefined, true], [true, true], [false, false]] as const) {
    const stopped = await decide({ target: rec("talent-5"), to: "process_stopped", notifyCandidateOnClosure: notify, idempotencyKey: `s${notify}` });
    assert.equal(stopped.effects.candidateNotice, expected);
    assert.equal(stopped.effects.introEmail, false);
  }
});

test("when the earlier-decision check cannot be read, nothing moves", async () => {
  describeFails = true;
  const [result] = await dispatcher.decideOrgCandidates({
    ...ctx("web"), items: [{ target: rec("talent-6"), to: "custom:s", idempotencyKey: "u" }],
  });
  assert.equal(result.status, "failed");
  assert.deepEqual(writes(), []);
});

test("a describe read that fails after the move leaves the decision applied", async () => {
  let moved = false;
  stageResult = (args) => {
    moved = true;
    describeFails = true;
    return { ok: true, companyUpdateJobId: null, introEmailMessageId: null, roleId: args.roleId, stage: args.stage, talentId: args.talentId };
  };
  const [result] = await dispatcher.decideOrgCandidates({
    ...ctx("web"), items: [{ target: rec(), to: "custom:s", from: "pending_connection", idempotencyKey: "d" }],
  });
  assert.equal(moved, true);
  assert.equal(result.status, "applied");
  assert.equal(result.decisionId, null);
  assert.equal(result.effects.creditUsed, null);
});

test("the candidate must confirm first: reported as such, Harper asks them", async () => {
  stageResult = (args) => ({ ok: true, status: "candidate_reengagement_requested", requestId: "q", requestedStage: args.stage, roleId: args.roleId, talentId: args.talentId });
  const [result] = await dispatcher.decideOrgCandidates({
    ...ctx("web"), items: [{ target: rec(), to: "connected", from: "process_stopped", idempotencyKey: "q",
      connection: { reengagementResolution: "ask_candidate" } }],
  });
  assert.equal(result.status, "candidate_reengagement_requested");
  assert.equal(result.effects.candidateNotice, true);
});

test("the bulk route's item reader accepts web fields only", () => {
  const item = dispatcher.parseOrgDecisionItem({
    target: { recommendationId: "rec", roleId: "role", talentId: "talent" },
    to: "process_stopped",
    from: "connected",
    reason: { text: "메모", tags: ["c1"] },
    notifyCandidateOnClosure: false,
    idempotencyKey: "k",
    connection: { emailMode: "skip", introBooking: "if_ready", introEmails: ["a@example.invalid"] },
  });
  assert.equal(item.to, "process_stopped");
  assert.equal(item.notifyCandidateOnClosure, false);
  assert.deepEqual(item.reason, { text: "메모", tags: ["c1"] });
  assert.equal(item.connection?.introBooking, "if_ready");
  assert.deepEqual(item.connection?.introEmails, ["a@example.invalid"]);
  assert.deepEqual(
    dispatcher.parseOrgDecisionItem({ target: { introCandidateId: "card" }, to: "passed", idempotencyKey: "k" }).target,
    { introCandidateId: "card" }
  );
  for (const bad of [
    { target: { recommendationId: "rec" }, to: "connected", idempotencyKey: "k" },
    { target: { introCandidateId: "card" }, to: "passed" },
    { target: { introCandidateId: "card" }, to: "passed", idempotencyKey: "x".repeat(201) },
    { target: { introCandidateId: "card" }, to: "", idempotencyKey: "k" },
    { target: { introCandidateId: "card" }, to: "passed", idempotencyKey: "k", notifyCandidateOnClosure: "no" },
    // The interview invitation is prepared and sent by the stage route.
    { target: { recommendationId: "rec", roleId: "role", talentId: "t" }, to: "connected", idempotencyKey: "k", connection: { scheduleInterview: true } },
    { target: { recommendationId: "rec", roleId: "role", talentId: "t" }, to: "connected", idempotencyKey: "k", connection: { introBooking: "always" } },
    { target: { recommendationId: "rec", roleId: "role", talentId: "t" }, to: "connected", idempotencyKey: "k", connection: { introEmails: "a@b.c" } },
  ]) {
    assert.throws(() => dispatcher.parseOrgDecisionItem(bad), (error: any) => error.status === 400, JSON.stringify(bad));
  }
});
