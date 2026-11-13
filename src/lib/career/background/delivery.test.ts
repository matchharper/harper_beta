import assert from "node:assert/strict";
import test from "node:test";
import {
  CAREER_DELIVERY_TOOLS,
  deliverCareerEmailReceipt,
  formatCareerEmailReceipt,
} from "./delivery";

function fixture(
  options: {
    later?: boolean;
    staleSource?: boolean;
    busy?: boolean;
    sent?: boolean;
    auditFailure?: boolean;
    attemptBlocked?: "cancelled" | "sending";
    receiptWriteError?: "before" | "after";
    laterOnRead?: number;
    setting?: Record<string, unknown>;
    talent?: Record<string, unknown>;
    contactScope?: string;
    meetingVersion?: number;
  } = {}
) {
  const calls: string[] = [];
  let messageReads = 0;
  const receipt: any = {
    id: "delivery",
    talent_id: "owner",
    discovery_run_id: "run",
    status: options.sent ? "sent" : "retry",
    payload: {
      conversationId: "conversation",
      parentReplyId: "reply",
      sourceMessageCursor: 42,
      runContract: "career_agent_v1",
      bodyMarkdown: "Frozen body",
      ...(options.meetingVersion !== undefined ? { meetingScheduleVersions: { appointment: 1 } } : {}),
      ...(options.sent ? { resendEmailId: "provider-receipt" } : {}),
      emailPayload: {
        to: "test@example.invalid",
        subject: "Frozen subject",
        text: "Frozen body",
        html: "Frozen body",
        idempotencyKey: "fixed",
      },
    },
  };
  const run: any = {
    id: "run",
    talent_id: "owner",
    status: "handed_off",
    trigger_payload: {
      contactScope: options.contactScope,
      agentInvocation: { replyId: "reply", sourceMessageCursor: 42 },
      sourceEvents: options.staleSource
        ? [
            {
              sourceKind: "schedule",
              sourceId: "cancelled-schedule",
              revision: 1,
            },
          ]
        : [],
    },
  };
  const admin: any = {
    async rpc(name: string, args: any) {
      calls.push(name);
      if (name === "claim_career_invocations") return { data: [], error: null };
      if (name === "career_daily_source_current") return { data: true, error: null };
      if (name === "reserve_career_agent_email") {
        receipt.payload = { ...receipt.payload, ...args.p_payload };
        return { data: structuredClone(receipt), error: null };
      }
      if (name === "claim_career_agent_email") {
        if (options.busy) return { data: null, error: null };
        if (!options.sent) { receipt.status = "sending"; receipt.payload.claimId = args.p_claim_id; }
        return { data: structuredClone(receipt), error: null };
      }
      if (name === "begin_career_agent_email_attempt") {
        if (options.attemptBlocked) { receipt.status = options.attemptBlocked; receipt.payload.claimId = 'new-sender'; return { data: false, error: null }; }
        receipt.payload.firstProviderAttemptAt ??= new Date().toISOString();
        return { data: true, error: null };
      }
      if (name === "record_career_agent_email_receipt") {
        assert.equal(args.p_idempotency_key, receipt.payload.emailPayload.idempotencyKey);
        if (options.receiptWriteError === 'before') return { data: null, error: new Error('Receipt store unavailable') };
        receipt.status = 'sent'; receipt.payload.resendEmailId = args.p_provider_id;
        if (options.receiptWriteError === 'after') return { data: null, error: new Error('Receipt response lost') };
        return { data: structuredClone(receipt), error: null };
      }
      if (name === "control_career_agent_email") {
        assert.equal(
          run.status,
          "handed_off",
          "a retired invocation cannot use the active control RPC"
        );
        assert.equal(args.p_user_id, "owner");
        return { data: structuredClone(receipt), error: null };
      }
      if (name === "cancel_career_background_run") run.status = "cancelled";
      else if (name === "finish_career_agent_email" && options.auditFailure)
        return { data: null, error: new Error("secondary audit unavailable") };
      else if (name === "finish_career_agent_email") { receipt.status = 'sent'; receipt.payload.auditCompletedAt = new Date().toISOString(); }
      else assert.fail(`Unexpected RPC ${name}`);
      return { data: null, error: null };
    },
    from(table: string) {
      if (table === "email_reply_aliases") return { insert: async () => ({ error: null }) };
      let mutation: any;
      const predicates: Record<string, unknown> = {};
      const resolve = () => {
        calls.push(`${table}:${mutation ? "update" : "read"}`);
        if (mutation) {
          assert.equal(table, "talent_opportunity_delivery");
          if (predicates['payload->>claimId'] && predicates['payload->>claimId'] !== receipt.payload.claimId) return { data: null, error: null };
          Object.assign(receipt, mutation);
          return { data: structuredClone(receipt), error: null };
        }
        const rows: Record<string, unknown> = {
          opportunity_discovery_run: run,
          talent_setting: options.setting ?? {},
          talent_users: { email: "test@example.invalid", deleted_at: null, ...options.talent },
          talent_external_operations: [],
          talent_agent_runtime: null,
          talent_agent_schedules: null,
          talent_opportunity_delivery: receipt,
          meeting_schedules: options.meetingVersion === undefined ? [] : [{ id: 'appointment', version: options.meetingVersion, title: 'Interview', status: 'cancelled', timezone: 'Asia/Seoul', scheduling_source: 'external', source_refs: {} }],
          talent_messages:
            (options.later || (options.laterOnRead && messageReads + 1 >= options.laterOnRead)) && Number(predicates["gt:id"] ?? 0) < 44
              ? [
                  {
                    id: 44,
                    content: "오늘은 연락하지 마",
                    created_at: "2026-10-30T01:02:03Z",
                  },
                ]
              : [],
        };
        if (table === 'talent_messages') messageReads += 1;
        assert.ok(table in rows, `Unexpected table ${table}`);
        return { data: structuredClone(rows[table]), error: null };
      };
      const query: any = {
        select: () => query,
        order: () => query,
        limit: () => query,
        neq: () => query,
        in: () => query,
        eq: (key: string, value: unknown) => {
          predicates[key] = value;
          return query;
        },
        gt: (key: string, value: unknown) => {
          predicates[`gt:${key}`] = value;
          return query;
        },
        update: (value: unknown) => {
          mutation = value;
          return query;
        },
        single: async () => resolve(),
        maybeSingle: async () => resolve(),
        then: (ok: any, fail: any) => Promise.resolve(resolve()).then(ok, fail),
      };
      return query;
    },
  };
  return { admin, receipt, run, calls };
}

test("a recovered send checks the sealed message cursor before contacting the provider", async () => {
  const { admin, receipt, calls } = fixture({ later: true });
  const result = await deliverCareerEmailReceipt(admin, receipt.id);
  assert.equal(result.status, "context_changed");
  assert.equal(result.careerContinuation, undefined);
  assert.equal(receipt.status, "context_changed");
  assert.equal(receipt.payload.sourceMessageCursor, 42);
  assert.equal(receipt.payload.bodyMarkdown, "Frozen body");
  assert.ok(
    calls.includes("talent_agent_runtime:read"),
    "return control to the exact original parent"
  );
  assert.ok(!calls.includes("finish_career_agent_email"));
});

test("a busy provider claim suspends the parent on the existing delivery", async () => {
  const result = await deliverCareerEmailReceipt(
    fixture({ busy: true }).admin,
    "delivery"
  );
  assert.equal(result.status, "queued");
  assert.deepEqual(result.careerContinuation, {
    kind: "email_delivery",
    id: "delivery",
  });
});

test("source cancellation retires the parent and still returns its authorized receipt", async () => {
  const { admin, run, receipt, calls } = fixture({ staleSource: true });
  const result: any = await CAREER_DELIVERY_TOOLS.deliver_career_email.execute!(
    { action: "retry" },
    {
      admin,
      userId: "owner",
      conversationId: "conversation",
      resumeRequestId: "reply",
      agentClaimId: "claim",
      backgroundInvocation: { runId: "run", sourceMessageCursor: 42 },
    }
  );
  assert.equal(run.status, "cancelled");
  assert.equal(result.status, "cancelled");
  assert.equal(receipt.status, "cancelled");
  assert.ok(result.modelOutput.includes("Frozen body"));
  assert.equal(
    calls.filter((name) => name === "control_career_agent_email").length,
    1
  );
});

test("a known provider receipt remains sent even when secondary audit recovery is pending", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const { admin } = fixture({ sent: true, auditFailure: true });
  const result = await deliverCareerEmailReceipt(admin, "delivery");
  assert.equal(result.status, "sent");
  assert.equal(result.careerContinuation, undefined);
});

test("email model projection contains sealed text and human dates without internal payloads", () => {
  const { receipt } = fixture({ sent: true });
  receipt.sent_at = "2026-10-30T01:02:03.000Z";
  receipt.payload.claimId = "PRIVATE_CLAIM";
  const text = formatCareerEmailReceipt(receipt);
  assert.ok(text.includes("Frozen subject"));
  assert.ok(text.includes("Frozen body"));
  assert.ok(text.includes("2026-10-30 10:02"));
  assert.ok(text.includes("provider-receipt"));
  assert.ok(!text.includes("PRIVATE_CLAIM"));
  assert.ok(!text.includes("2026-10-30T"));
});

function provider(t: any, send: (request: RequestInit) => Promise<Response>) {
  const key = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'synthetic-test-key';
  t.after(() => { if (key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = key; });
  return t.mock.method(globalThis, 'fetch', async (_url: unknown, request: RequestInit) => send(request));
}

test('a changed appointment prevents a queued reminder from reaching the email provider', async (t) => {
  const send = provider(t, async () => { assert.fail('Stale reminder reached provider'); });
  const { admin, receipt } = fixture({ meetingVersion: 2 });
  const result = await deliverCareerEmailReceipt(admin, receipt.id);
  assert.equal(result.status, 'context_changed');
  assert.equal(receipt.status, 'context_changed');
  assert.equal(send.mock.callCount(), 0);
});

test('the delivery tool returns changed appointment facts before attempting to retry', async (t) => {
  const send = provider(t, async () => { assert.fail('Stale reminder reached provider'); });
  const { admin, receipt } = fixture({ meetingVersion: 2 });
  const result: any = await CAREER_DELIVERY_TOOLS.deliver_career_email.execute!(
    { action: 'retry' },
    { admin, userId: 'owner', conversationId: 'conversation', resumeRequestId: 'reply', agentClaimId: 'claim', backgroundInvocation: { runId: 'run', sourceMessageCursor: 42, meetingScheduleVersions: { appointment: 1 } } },
  );
  assert.equal(result.status, 'context_changed');
  assert.match(result.modelOutput, /cancelled/);
  assert.equal(receipt.status, 'retry');
  assert.equal(send.mock.callCount(), 0);
});

test('provider response loss retries the identical sealed payload and idempotency key', async (t) => {
  const { admin, receipt } = fixture();
  const attempts: RequestInit[] = [];
  const mock = provider(t, async request => { attempts.push(request); if (attempts.length === 1) throw new Error('Response lost after acceptance'); return new Response('{"id":"same-provider-receipt"}', { status: 200 }); });
  assert.equal((await deliverCareerEmailReceipt(admin, 'delivery')).status, 'retry');
  assert.equal(receipt.payload.resendEmailId, undefined);
  assert.equal((await deliverCareerEmailReceipt(admin, 'delivery')).status, 'sent');
  assert.equal(mock.mock.callCount(), 2);
  assert.equal(attempts[0].body, attempts[1].body);
  assert.equal((attempts[0].headers as any)['Idempotency-Key'], 'fixed');
  assert.equal((attempts[1].headers as any)['Idempotency-Key'], 'fixed');
  assert.equal(receipt.payload.bodyMarkdown, 'Frozen body');
});

test('a newly stored provider receipt wins over audit failure and ambiguous receipt-write response', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const sent = provider(t, async () => new Response('{"id":"actual-receipt"}', { status: 200 }));
  for (const option of [{ auditFailure: true }, { receiptWriteError: 'after' as const }]) {
    const { admin, receipt } = fixture(option);
    assert.equal((await deliverCareerEmailReceipt(admin, 'delivery')).status, 'sent');
    assert.equal(receipt.status, 'sent'); assert.equal(receipt.payload.resendEmailId, 'actual-receipt');
  }
  assert.equal(sent.mock.callCount(), 2);
});

test('receipt persistence failure remains retryable without changing the prepared message', async (t) => {
  provider(t, async () => new Response('{"id":"provider-receipt-not-yet-stored"}', { status: 200 }));
  const { admin, receipt } = fixture({ receiptWriteError: 'before' });
  const result = await deliverCareerEmailReceipt(admin, 'delivery');
  assert.equal(result.status, 'retry');
  assert.equal(receipt.payload.emailPayload.idempotencyKey, 'fixed');
  assert.equal(receipt.payload.bodyMarkdown, 'Frozen body');
  assert.equal(receipt.payload.resendEmailId, undefined);
});

test('cancellation and a newer sender claim at the provider boundary prevent stale attempts', async (t) => {
  const sent = provider(t, async () => { assert.fail('No provider request is allowed'); });
  for (const state of ['cancelled', 'sending'] as const) {
    const { admin, receipt } = fixture({ attemptBlocked: state });
    assert.equal((await deliverCareerEmailReceipt(admin, 'delivery')).status, state);
    assert.equal(receipt.payload.bodyMarkdown, 'Frozen body');
    assert.equal(receipt.payload.firstProviderAttemptAt, undefined);
  }
  assert.equal(sent.mock.callCount(), 0);
});

test('a user message arriving between the tool and provider checks returns to the original agent', async (t) => {
  const sent = provider(t, async () => { assert.fail('New context must be interpreted first'); });
  const { admin, receipt } = fixture({ laterOnRead: 2 });
  const result: any = await CAREER_DELIVERY_TOOLS.deliver_career_email.execute!({ action: 'retry' }, {
    admin, userId: 'owner', conversationId: 'conversation', resumeRequestId: 'reply', agentClaimId: 'claim',
    backgroundInvocation: { runId: 'run', sourceMessageCursor: 42 },
  });
  assert.equal(result.status, 'context_changed');
  assert.equal(receipt.payload.sourceMessageCursor, 42); assert.equal(receipt.payload.bodyMarkdown, 'Frozen body');
  assert.equal(sent.mock.callCount(), 0);
});

test('recipient deletion or changes stop delivery while stopped external scope does not suppress delegated work', async (t) => {
  const sent = provider(t, async () => new Response('{"id":"delegated-receipt"}', { status: 200 }));
  for (const option of [
    { talent: { deleted_at: '2026-10-30T00:00:00Z' } },
    { talent: { email: 'changed@example.invalid' } },
    { contactScope: 'external_recommendations', setting: { status: 'stopped' } },
    { contactScope: 'matching', setting: { profile_visibility: 'dont_share' } },
    { contactScope: 'career_check_in', setting: { profile_visibility: 'dont_share', status: 'stopped' } },
    { contactScope: 'career_check_in', setting: { get_internal_recommendation: false, get_external_recommendation: false } },
  ]) assert.equal((await deliverCareerEmailReceipt(fixture(option).admin, 'delivery')).status, 'cancelled');
  assert.equal(sent.mock.callCount(), 0);
  const explicit = fixture({ contactScope: 'delegated_work', setting: { status: 'stopped', profile_visibility: 'dont_share' } });
  assert.equal((await deliverCareerEmailReceipt(explicit.admin, 'delivery')).status, 'sent');
  assert.equal(sent.mock.callCount(), 1);
});


test("a new email can omit sourceIds without claiming that pending daily updates were communicated", async (t) => {
  const sent = provider(t, async (request) => {
    const body = JSON.parse(String(request.body));
    assert.equal(body.subject, "A separate update");
    return Response.json({ id: "separate-update-receipt" });
  });
  const { admin, run, receipt, calls } = fixture();
  run.trigger_payload.sourceEvents = [{ sourceKind: "role_closure", dailySourceId: "pending-closure" }];
  const result: any = await CAREER_DELIVERY_TOOLS.deliver_career_email.execute!({
    subject: "A separate update", body: "An update unrelated to the pending closure.",
  }, {
    admin, userId: "owner", conversationId: "conversation", resumeRequestId: "reply", agentClaimId: "claim",
    backgroundInvocation: { runId: "run", sourceMessageCursor: 42 },
  });
  assert.equal(result.status, "sent");
  assert.deepEqual(receipt.payload.sourceIds, []);
  assert.equal(receipt.payload.resendEmailId, "separate-update-receipt");
  assert.equal(receipt.payload.emailPayload.idempotencyKey, "career-agent/run");
  assert.ok(calls.includes("reserve_career_agent_email"));
  assert.equal(sent.mock.callCount(), 1);
  assert.doesNotMatch(result.modelOutput, /pending-closure/);
});

for (const lookup of ["valid", "missing", "error"] as const) test(`scheduled email sends with ${lookup} opportunity link lookup`, async t => {
  const roleId = "10000000-0000-4000-8000-000000000001";
  const { admin, receipt } = fixture();
  const from = admin.from.bind(admin);
  admin.from = (table: string) => {
    if (!["company_roles", "talent_opportunity_recommendation"].includes(table)) return from(table);
    const q: any = { select: () => q, eq: () => q, in: async () => ({
      data: lookup === "valid" ? [{ role_id: roleId }] : [],
      error: lookup === "error" ? new Error("read unavailable") : null,
    }) };
    return q;
  };
  const sent = provider(t, async request => {
    const payload = JSON.parse(String(request.body));
    assert.ok(payload.text.includes("추천입니다. 공고를 확인해 보세요."));
    if (lookup === "valid") assert.ok(payload.html.includes(roleId));
    else assert.ok(!payload.html.includes(roleId) && !payload.text.includes(roleId));
    return Response.json({ id: "confirmed-send" });
  });
  const result: any = await CAREER_DELIVERY_TOOLS.deliver_career_email.execute!({
    subject: "추천 기회", body: `추천입니다. 공고를 확인해 보세요.\n\n[자세한 공고](${roleId})\n\n감사합니다.`,
  }, { admin, userId: "owner", conversationId: "conversation", resumeRequestId: "reply", agentClaimId: "claim",
    backgroundInvocation: { runId: "run", scheduledWork: true, sourceMessageCursor: 42 } });
  assert.equal(result.status, "sent");
  assert.equal(sent.mock.callCount(), 1);
  assert.equal(receipt.payload.bodyMarkdown.includes(roleId), lookup === "valid", "Career history uses the same safe body");
});

for (const lookup of ["found", "error"] as const) test(`a new email records the recommendations its links show (${lookup} lookup)`, async t => {
  const first = "10000000-0000-4000-8000-000000000001", second = "10000000-0000-4000-8000-000000000002";
  const { admin, receipt } = fixture();
  const from = admin.from.bind(admin);
  const reads: unknown[][] = [];
  admin.from = (table: string) => {
    if (table !== "talent_opportunity_recommendation") return from(table);
    const q: any = { select: () => q, eq: (key: string, value: unknown) => { reads.push([key, value]); return q; },
      in: async (key: string, values: unknown) => {
        reads.push([key, values]);
        return lookup === "error"
          ? { data: null, error: new Error("read unavailable") }
          : { data: [{ id: "rec-first", role_id: first, recommended_at: "2026-11-12T00:00:00Z" }, { id: "rec-second", role_id: second, recommended_at: "2026-11-11T00:00:00Z" }], error: null };
      } };
    return q;
  };
  const sent = provider(t, async () => Response.json({ id: `receipt-${lookup}` }));
  const result: any = await CAREER_DELIVERY_TOOLS.deliver_career_email.execute!({
    subject: "추천 기회", body: `두 공고예요.\n\n[두 번째](${second}) · [첫 번째](${first}) · [다시 두 번째](${second})`,
  }, { admin, userId: "owner", conversationId: "conversation", resumeRequestId: "reply", agentClaimId: "claim",
    backgroundInvocation: { runId: "run", sourceMessageCursor: 42 } });
  assert.equal(result.status, "sent", "the lookup never stops the email");
  assert.equal(sent.mock.callCount(), 1);
  assert.deepEqual(reads, [["talent_id", "owner"], ["role_id", [second, first]]]);
  // What the delivery presentation trigger reads once the email is sent.
  assert.deepEqual(receipt.payload.recommendationIds, lookup === "found" ? ["rec-second", "rec-first"] : []);
});
