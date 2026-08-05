import assert from "node:assert/strict";
import test from "node:test";
import { classifyInboundEmailJob } from "./inbound";

test("classifies per-thread organization introduction addresses as capture-only", () => {
  const originalDomain = process.env.EMAIL_REPLY_DOMAIN;
  process.env.EMAIL_REPLY_DOMAIN = "reply.matchharper.com";

  try {
    assert.deepEqual(
      classifyInboundEmailJob({
        ccAddresses: [
          "Harper capture <intro+abc_def-123456@reply.matchharper.com>",
        ],
        toAddresses: ["candidate@example.com"],
      }),
      {
        kind: "org_intro_capture",
        metadata: {
          orgIntroCapture: {
            matchedAddresses: [
              "intro+abc_def-123456@reply.matchharper.com",
            ],
            source: "inbound_email",
          },
        },
      }
    );
  } finally {
    if (originalDomain === undefined) {
      delete process.env.EMAIL_REPLY_DOMAIN;
    } else {
      process.env.EMAIL_REPLY_DOMAIN = originalDomain;
    }
  }
});

test("does not classify lookalike organization capture addresses on another domain", () => {
  assert.deepEqual(
    classifyInboundEmailJob({
      ccAddresses: [],
      toAddresses: ["intro+abc_def-123456@example.com"],
    }),
    { kind: "reply", metadata: {} }
  );
});
