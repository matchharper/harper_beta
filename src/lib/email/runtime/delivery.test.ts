import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";

let processEmailContact: typeof import("./contact").processEmailContact;
let processEmailReply: typeof import("./reply").processEmailReply;
let processOnboardingReview: typeof import("./onboarding").processOnboardingReview;
let profileIngestionSucceeded: typeof import("./onboarding").profileIngestionSucceeded;
let deliverSavedReferral: typeof import("./special").deliverSavedReferral;
before(async () => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "unit",
    SUPABASE_SERVICE_ROLE_KEY: "unit",
    OPENAI_API_KEY: "unit",
    OPENROUTER_API_KEY: "unit",
  });
  const mod = Module as any,
    original = mod._load;
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request === "server-only"
      ? {}
      : original.call(this, request, parent, isMain);
  };
  try {
    ({ processEmailContact } = await import("./contact"));
    ({ processEmailReply } = await import("./reply"));
    ({ deliverSavedReferral } = await import("./special"));
    ({ processOnboardingReview, profileIngestionSucceeded } =
      await import("./onboarding"));
  } finally {
    mod._load = original;
  }
});
function fixture(
  tables: Record<string, any[]>,
  results: Record<string, unknown> = {}
) {
  const calls: string[] = [];
  const rpcArgs: Array<{ name: string; args: any }> = [];
  const admin: any = {
    from(table: string) {
      calls.push(table);
      let patch: any;
      const filters: Array<(row: any) => boolean> = [];
      const matches = () =>
        (tables[table] ?? []).filter((row) => filters.every((fn) => fn(row)));
      const run = () => {
        const rows = matches();
        if (patch) rows.forEach((row) => Object.assign(row, patch));
        return { data: rows, error: null };
      };
      return {
        select() {
          return this;
        },
        eq(key: string, value: unknown) {
          filters.push((row) => row[key] === value);
          return this;
        },
        not() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        update(value: any) {
          patch = value;
          return this;
        },
        async maybeSingle() {
          const result = run();
          return { ...result, data: result.data[0] ?? null };
        },
        then(resolve: any, reject: any) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
    },
    async rpc(name: string, args: any) {
      calls.push(name);
      rpcArgs.push({ name, args });
      return { data: results[name] ?? null, error: null };
    },
  };
  return { admin, calls, rpcArgs };
}
const delivery = {
  from: "hello@example.com",
  to: "candidate@example.com",
  subject: "Saved",
  text: "Body",
  html: "<p>Body</p>",
  replyTo: "reply@example.com",
};
const base = {
  id: "job",
  worker_target: "vercel_queue",
  status: "processing",
  locked_by: "owner",
  user_id: "talent",
  talent_id: "talent",
  conversation_id: "conversation",
};

test("a confirmed contact send is finalized even if account or schedule eligibility changed afterwards", async () => {
  const job = {
    ...base,
    type: "meeting_schedule_candidate_invitation",
    resend_email_id: "provider",
    payload: {
      runtimeDelivery: delivery,
      runtimeCopy: {
        body: "Body",
        conversationId: "conversation",
        mailType: "meeting_schedule_candidate_invitation",
      },
    },
  };
  const { admin, calls } = fixture({ contact_queue: [job] });
  await processEmailContact(admin, job, "owner");
  assert.ok(calls.includes("finalize_email_contact_delivery_v1"));
  assert.ok(!calls.includes("talent_users"));
  assert.ok(!calls.includes("meeting_schedules"));
});

test("reply recovery uses its saved response and provider checkpoint without receiving or generating again", async () => {
  const job = {
    ...base,
    resend_email_id: "provider",
    assistant_message_id: 1,
    metadata: { delivery, mailType: "auto_reply" },
  };
  const { admin, calls } = fixture({
    email_reply_jobs: [job],
    talent_messages: [
      {
        id: "1",
        user_id: "talent",
        conversation_id: "conversation",
        content: "Saved response",
      },
    ],
    talent_conversations: [{ id: "conversation" }],
  });
  await processEmailReply(admin, job, "owner");
  assert.equal(job.status, "sent");
  assert.ok(calls.includes("record_email_runtime_audit_v1"));
  assert.ok(!calls.includes("email_inbound_events"));
  assert.ok(!calls.includes("talent_users"));
});

test("review recovery finalizes a confirmed provider send before rechecking or ingesting profile", async () => {
  const lead = {
    id: "lead",
    worker_target: "vercel_queue",
    status: "active",
    step: "profile_review_pending",
    review_locked_by: "owner",
    metadata: { reviewProviderId: "provider", reviewDelivery: delivery },
  };
  const { admin, calls } = fixture({ career_email_onboarding_leads: [lead] });
  await processOnboardingReview(admin, lead, "owner");
  assert.ok(calls.includes("finalize_email_onboarding_review_v1"));
  assert.ok(!calls.includes("talent_users"));
});

test("a superseded meeting invitation is cancelled before sending even when the body was already frozen", async () => {
  const job: any = {
    ...base,
    type: "meeting_schedule_candidate_invitation",
    payload: {
      meetingScheduleRoundId: "round",
      meetingScheduleId: "schedule",
      to: delivery.to,
      runtimeDelivery: delivery,
      runtimeCopy: {
        body: "Body",
        conversationId: "conversation",
        allowCompleted: true,
      },
    },
  };
  const round: any = {
    id: "round",
    schedule_id: "schedule",
    delivery_queue_id: "job",
    status: "queued",
    invitation_expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
  const schedule = {
    id: "schedule",
    talent_id: "talent",
    active_round_id: "new-round",
    status: "awaiting_talent",
  };
  const { admin } = fixture({
    contact_queue: [job],
    talent_users: [{ user_id: "talent", email: delivery.to }],
    talent_setting: [{ user_id: "talent", is_onboarding_done: true }],
    meeting_schedule_rounds: [round],
    meeting_schedules: [schedule],
  });
  await processEmailContact(admin, job, "owner");
  assert.equal(job.status, "cancelled");
  assert.equal(job.last_error, "meeting_invitation_not_sendable");
  assert.equal(round.status, "delivery_failed");
});

test("ingestion needs actual extracted profile evidence, not only an HTTP success", () => {
  assert.equal(
    profileIngestionSucceeded({ ok: true, stats: { experiencesSaved: 0 } }),
    false
  );
  assert.equal(
    profileIngestionSucceeded({ ok: true, stats: { educationsFromLlm: 1 } }),
    true
  );
  assert.equal(
    profileIngestionSucceeded({
      ok: true,
      linkedinUrl: "https://linkedin.com/in/example",
    }),
    true
  );
  assert.equal(
    profileIngestionSucceeded({ ok: false, stats: { experiencesSaved: 1 } }),
    false
  );
});

test("partial referral delivery retries only the recipient that has no provider checkpoint", async () => {
  const job: any = {
    ...base,
    kind: "referral_intro",
    metadata: {
      referralDeliveries: {
        items: [
          {
            key: "candidate",
            delivery: { ...delivery, to: "candidate@example.com" },
          },
          {
            key: "referrer",
            delivery: { ...delivery, to: "referrer@example.com" },
          },
        ],
      },
    },
  };
  const { admin } = fixture({ email_reply_jobs: [job] });
  const recipients: string[] = [];
  await assert.rejects(
    () =>
      deliverSavedReferral(admin, job, "owner", async (mail) => {
        recipients.push(mail.to);
        if (mail.to === "referrer@example.com")
          throw new Error("temporary send failure");
        return "candidate-provider";
      }),
    /temporary/
  );
  assert.equal(
    job.metadata.referralProviderIds.candidate,
    "candidate-provider"
  );
  await deliverSavedReferral(admin, job, "owner", async (mail) => {
    recipients.push(mail.to);
    return "referrer-provider";
  });
  assert.deepEqual(recipients, [
    "candidate@example.com",
    "referrer@example.com",
    "referrer@example.com",
  ]);
  assert.equal(job.status, "sent");
  assert.equal(job.resend_email_id, "candidate-provider");
});

test("candidate contact preserves its approved message and idempotency key, with the Career CTA only in email transport", async () => {
  process.env.EMAIL_REPLY_FROM_EMAIL = "Harper <hello@example.com>";
  const original = "The exact approved company message.";
  const job: any = {
    ...base,
    type: "company_request_candidate_delivery",
    company_talent_request_id: "request",
    payload: {
      delivery: {
        chatText: original,
        subject: "Approved subject",
        replyTo: "reply@example.com",
        conversationId: "conversation",
        idempotencyKey: "company-talent-request/request",
      },
    },
  };
  const request = {
    id: "request",
    talent_id: "talent",
    role_id: "role",
    workflow_status: "queued",
    expires_at: "infinity",
    created_at: "2000-01-01T00:00:00Z",
  };
  const { admin, rpcArgs } = fixture(
    {
      contact_queue: [job],
      talent_users: [{ user_id: "talent", email: delivery.to }],
      talent_setting: [
        { user_id: "talent", preferred_locale: "en", is_onboarding_done: true },
      ],
      talent_conversations: [{ id: "conversation", user_id: "talent" }],
      company_talent_requests: [request],
    },
    { company_talent_request_target_is_active_v1: true }
  );
  let sent: any;
  await processEmailContact(admin, job, "owner", async (message) => {
    sent = message;
    return "provider";
  });
  assert.equal(sent.idempotencyKey, "company-talent-request/request");
  assert.equal(sent.subject, "Approved subject");
  assert.match(sent.text, /exact approved company message/);
  assert.match(sent.html, /https:\/\/matchharper.com\/career/);
  const finalize = rpcArgs.find(
    (r) => r.name === "finalize_email_contact_delivery_v1"
  )!;
  assert.equal(finalize.args.p_copy.body, original);
  assert.equal(job.resend_email_id, "provider");
});
