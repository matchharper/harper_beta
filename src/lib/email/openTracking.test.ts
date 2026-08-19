import assert from "node:assert/strict";
import test from "node:test";
import {
  parseResendEmailOpenedEvent,
  recordResendEmailOpenedEvent,
} from "./openTracking";

test("uses the webhook creation time and Resend email ID for the open RPC", async () => {
  const calls: Array<{ args: unknown; functionName: string }> = [];

  const result = await recordResendEmailOpenedEvent({
    admin: {
      async rpc(functionName, args) {
        calls.push({ args, functionName });
        return { data: null, error: null };
      },
    },
    event: {
      created_at: "2026-08-19T10:11:12.123Z",
      data: {
        created_at: "2026-08-19T09:00:00.000Z",
        email_id: "resend-email-123",
      },
      type: "email.opened",
    },
  });

  assert.deepEqual(result, {
    openedAt: "2026-08-19T10:11:12.123Z",
    resendEmailId: "resend-email-123",
  });
  assert.deepEqual(calls, [
    {
      args: {
        p_opened_at: "2026-08-19T10:11:12.123Z",
        p_resend_email_id: "resend-email-123",
      },
      functionName: "record_career_email_first_open_v1",
    },
  ]);
});

test("does not confuse the email creation time with the open time", () => {
  assert.deepEqual(
    parseResendEmailOpenedEvent({
      created_at: "2026-08-19T10:11:12.123Z",
      data: {
        created_at: "2026-08-19T09:00:00.000Z",
        email_id: "resend-email-123",
      },
      type: "email.opened",
    }),
    {
      openedAt: "2026-08-19T10:11:12.123Z",
      resendEmailId: "resend-email-123",
    }
  );
});

test("rejects opened events without a Resend email ID", () => {
  assert.throws(
    () =>
      parseResendEmailOpenedEvent({
        created_at: "2026-08-19T10:11:12.123Z",
        data: {},
        type: "email.opened",
      }),
    /missing data\.email_id/
  );
});

test("surfaces RPC failures so Resend can retry the webhook", async () => {
  await assert.rejects(
    () =>
      recordResendEmailOpenedEvent({
        admin: {
          async rpc() {
            return {
              data: null,
              error: { message: "database unavailable" },
            };
          },
        },
        event: {
          created_at: "2026-08-19T10:11:12.123Z",
          data: { email_id: "resend-email-123" },
          type: "email.opened",
        },
      }),
    /database unavailable/
  );
});
