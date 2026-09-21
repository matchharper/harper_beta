import assert from "node:assert/strict";
import test from "node:test";
import {
  ingestGtmResendDeliveryEvent,
  parseGtmResendDeliveryEvent,
} from "./resendDelivery";

const permanentBounce = {
  created_at: "2026-09-21T05:00:00.000Z",
  data: {
    bounce: {
      message: "Mailbox does not exist",
      subType: "General",
      type: "Permanent",
    },
    email_id: "resend-email-1",
    from: "Harper <harper@matchharper.com>",
    to: ["Creator <creator@example.com>"],
  },
  type: "email.bounced",
};

test("parses a permanent Resend bounce for the GTM sender", () => {
  assert.deepEqual(parseGtmResendDeliveryEvent(permanentBounce), {
    diagnosticCode: "Mailbox does not exist",
    eventType: "email.bounced",
    fromEmail: "harper@matchharper.com",
    occurredAt: "2026-09-21T05:00:00.000Z",
    permanent: true,
    providerMessageId: "resend-email-1",
    recipientEmail: "creator@example.com",
  });
});

test("ignores delivery events sent by another Resend product sender", async () => {
  let rpcCalled = false;
  const result = await ingestGtmResendDeliveryEvent({
    admin: {
      rpc: async () => {
        rpcCalled = true;
        return { data: null, error: null };
      },
    },
    event: {
      ...permanentBounce,
      data: { ...permanentBounce.data, from: "hello@matchharper.com" },
    },
    providerEventId: "evt-other",
  });
  assert.deepEqual(result, { ignored: true, reason: "different_sender" });
  assert.equal(rpcCalled, false);
});

test("records and notifies a matched GTM delivery failure idempotently", async () => {
  const calls: { args: Record<string, unknown>; name: string }[] = [];
  const notices: unknown[] = [];
  const result = await ingestGtmResendDeliveryEvent({
    admin: {
      rpc: async (name, args) => {
        calls.push({ args, name });
        if (name === "gtm_outreach_ingest_resend_delivery_event") {
          return {
            data: {
              activity_id: "activity-1",
              creator_id: "creator-1",
              creator_name: "Creator",
              creator_ref: 73,
              diagnostic_code: "Mailbox does not exist",
              dispatch_ref: 20,
              inserted: true,
              matched: true,
              notify_needed: true,
              permanent: true,
              recipient_email: "creator@example.com",
              status: "email.bounced",
              subject: "Proposal",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    },
    event: permanentBounce,
    notify: async (notice) => {
      notices.push(notice);
      return { channel: "C_FIXTURE", ts: "123.456" };
    },
    providerEventId: "evt-bounce-1",
  });

  assert.equal(result.ignored, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    args: {
      p_diagnostic_code: "Mailbox does not exist",
      p_event_type: "email.bounced",
      p_occurred_at: "2026-09-21T05:00:00.000Z",
      p_permanent: true,
      p_provider_event_id: "evt-bounce-1",
      p_provider_message_id: "resend-email-1",
      p_recipient_email: "creator@example.com",
    },
    name: "gtm_outreach_ingest_resend_delivery_event",
  });
  assert.equal(notices.length, 1);
  assert.equal((notices[0] as { creatorId: string }).creatorId, "creator-1");
  assert.equal(
    calls[1]?.name,
    "gtm_outreach_record_activity_slack_notification"
  );
});

test("asks Resend to retry when a GTM event races delivery recording", async () => {
  await assert.rejects(
    ingestGtmResendDeliveryEvent({
      admin: {
        rpc: async () => ({
          data: { inserted: false, matched: false },
          error: null,
        }),
      },
      event: permanentBounce,
      providerEventId: "evt-race",
    }),
    /does not match a dispatch yet/
  );
});
