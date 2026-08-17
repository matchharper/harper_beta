import assert from "node:assert/strict";
import test from "node:test";
import { resolveOrgProcessClosureNotification } from "./processClosureNotification";

test("reports a closure notice sent after the current company stop", () => {
  assert.deepEqual(
    resolveOrgProcessClosureNotification({
      auditRows: [
        {
          created_at: "2026-08-10T00:00:00.000Z",
          kind: "internal_process_stopped_notified",
          metadata: { sentChannel: "chat,email" },
          role_id: "role-1",
        },
      ],
      stopRows: [
        {
          created_at: "2026-08-07T00:00:00.000Z",
          kind: "org_stage_change",
          metadata: { stage: "process_stopped" },
          role_id: "role-1",
        },
      ],
    }),
    {
      deliveredAt: "2026-08-10T00:00:00.000Z",
      sentChannel: "chat,email",
      status: "sent",
      stoppedAt: "2026-08-07T00:00:00.000Z",
    }
  );
});

test("does not mistake an older notice for the current stopped process", () => {
  const result = resolveOrgProcessClosureNotification({
    auditRows: [
      {
        created_at: "2026-08-01T00:00:00.000Z",
        kind: "internal_process_stopped_notified",
        metadata: { sentChannel: "email" },
        role_id: "role-1",
      },
    ],
    stopRows: [
      {
        created_at: "2026-08-12T00:00:00.000Z",
        kind: "org_stage_change",
        metadata: { stage: "process_stopped" },
        role_id: "role-1",
      },
    ],
  });

  assert.equal(result.status, "not_sent");
  assert.equal(result.deliveredAt, null);
  assert.equal(result.stoppedAt, "2026-08-12T00:00:00.000Z");
});
