import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";

const jobId = "00000000-0000-4000-8000-000000000001";
const inboundEventId = "00000000-0000-4000-8000-000000000002";
const dispatched: string[] = [];
let post: typeof import("./route").POST;

before(async () => {
  const mod = Module as any, load = mod._load;
  mod._load = function (name: string, parent: unknown, main: boolean) {
    if (name === "@/lib/email/security") return { verifyResendWebhookSignature: () => true };
    if (name === "@/lib/email/inbound") return {
      ingestResendInboundEvent: async () => ({ jobId, inboundEventId, inserted: true, queued: true }),
    };
    if (name === "@/lib/email/runtime/queue") return {
      dispatchInboundEmailReply: async (id: string) => { dispatched.push(id); },
    };
    if (name === "@/lib/email/openTracking") return {};
    if (name === "@/lib/contentsEngine/resendDelivery") return { isGtmResendDeliveryEventType: () => false };
    return load.call(this, name, parent, main);
  };
  try { post = (await import("./route")).POST; }
  finally { mod._load = load; }
});

test("received email always dispatches the created job, with no setting or a stale legacy setting", async () => {
  const previous = process.env.EMAIL_RUNTIME_TARGET;
  try {
    for (const value of [undefined, "legacy"]) {
      if (value === undefined) delete process.env.EMAIL_RUNTIME_TARGET;
      else process.env.EMAIL_RUNTIME_TARGET = value;
      dispatched.length = 0;
      const response = await post(new Request("http://localhost/api/internal/email/resend", {
        method: "POST", body: JSON.stringify({ type: "email.received", data: { email_id: "received-email" } }),
      }));
      assert.equal(response.status, 200);
      assert.deepEqual(dispatched, [jobId]);
    }
  } finally {
    if (previous === undefined) delete process.env.EMAIL_RUNTIME_TARGET;
    else process.env.EMAIL_RUNTIME_TARGET = previous;
  }
});
