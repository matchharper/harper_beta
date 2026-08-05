import assert from "node:assert/strict";
import test from "node:test";
import { getOrCreateOrgIntroCaptureThread } from "./introEmailCapture";

test("creates and persists a per-introduction capture address", async () => {
  const originalDomain = process.env.EMAIL_REPLY_DOMAIN;
  process.env.EMAIL_REPLY_DOMAIN = "reply.matchharper.com";
  const inserts: Array<Record<string, unknown>> = [];

  const admin = {
    from(table: string) {
      assert.equal(table, "org_intro_email_threads");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
        insert(payload: Record<string, unknown>) {
          inserts.push(payload);
          return {
            select() {
              return {
                async single() {
                  return {
                    data: {
                      capture_address: payload.capture_address,
                      id: "thread-1",
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  try {
    const result = await getOrCreateOrgIntroCaptureThread({
      admin,
      outboundMessageId: "message-1",
      participantEmails: [
        "candidate@example.com",
        "recruiter@example.com",
      ],
      recommendationId: "recommendation-1",
      roleId: "role-1",
      talentId: "talent-1",
      workspaceId: "workspace-1",
    });

    assert.match(
      result.address,
      /^intro\+[a-z0-9_-]{12,}@reply\.matchharper\.com$/
    );
    assert.equal(result.threadId, "thread-1");
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].capture_address, result.address);
    assert.deepEqual(inserts[0].participant_emails, [
      "candidate@example.com",
      "recruiter@example.com",
    ]);
  } finally {
    if (originalDomain === undefined) delete process.env.EMAIL_REPLY_DOMAIN;
    else process.env.EMAIL_REPLY_DOMAIN = originalDomain;
  }
});
