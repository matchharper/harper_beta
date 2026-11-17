import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOrgProcessClosureForCompanyAgent,
  isOrgProcessClosureNoticeUnresolved,
  readOrgCurrentProcessClosures,
  resolveOrgCurrentProcessClosure,
  resolveOrgProcessClosureNotification,
} from "./processClosureNotification";

test("keeps the board warning until recovery or a later stage change", () => {
  assert.equal(
    isOrgProcessClosureNoticeUnresolved({
      currentStageChangedAt: "2026-08-07T00:00:00.000Z",
      deliveredAt: "2026-08-10T00:00:00.000Z",
      savedStage: "closed",
    }),
    true
  );
  assert.equal(
    isOrgProcessClosureNoticeUnresolved({
      currentStageChangedAt: "2026-08-11T00:00:00.000Z",
      deliveredAt: "2026-08-10T00:00:00.000Z",
      savedStage: "closed",
    }),
    false
  );
  assert.equal(
    isOrgProcessClosureNoticeUnresolved({
      currentStageChangedAt: "2026-08-07T00:00:00.000Z",
      deliveredAt: "2026-08-10T00:00:00.000Z",
      savedStage: "accepted",
    }),
    false
  );
});

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

const withheldStop = {
  created_at: "2026-11-09T08:52:58.000Z",
  kind: "org_stage_change",
  metadata: { stage: "process_stopped", notifyCandidateOnClosure: false, stopNote: "private" },
  role_id: "role-1",
};

test("reports a closing note the company chose not to send", () => {
  const result = resolveOrgProcessClosureNotification({ auditRows: [], stopRows: [withheldStop] });
  assert.equal(result.status, "withheld");
  assert.equal(result.deliveredAt, null);
  assert.equal(result.stoppedAt, "2026-11-09T08:52:58.000Z");
});

test("a note that was delivered anyway stays reported as sent", () => {
  const result = resolveOrgProcessClosureNotification({
    auditRows: [{ created_at: "2026-11-10T01:55:00.000Z", kind: "internal_process_stopped_notified", metadata: { sentChannel: "career_chat" }, role_id: "role-1" }],
    stopRows: [withheldStop],
  });
  assert.equal(result.status, "sent");
  assert.equal(result.sentChannel, "career_chat");
});

test("a pair's closure counts only while the company's latest stage change ended it", () => {
  assert.equal(resolveOrgCurrentProcessClosure([withheldStop])?.status, "withheld");
  assert.equal(
    resolveOrgCurrentProcessClosure([
      withheldStop,
      { created_at: "2026-11-12T00:00:00.000Z", kind: "org_stage_change", metadata: { stage: "connected" }, role_id: "role-1" },
    ]),
    null
  );
  assert.equal(resolveOrgCurrentProcessClosure([]), null);
});

test("reads current closures only for the requested candidate and Role pairs", async () => {
  const calls: unknown[][] = [];
  const query = async (_sql: string, params?: unknown[]) => {
    calls.push(params ?? []);
    return [
      { ...withheldStop, talent_id: "talent-1" },
      { ...withheldStop, talent_id: "talent-2" },
      { ...withheldStop, role_id: "role-2", talent_id: "talent-1", metadata: { stage: "process_stopped" } },
    ];
  };
  const result = await readOrgCurrentProcessClosures(query, [
    { talentId: "talent-1", roleId: "role-1" },
    { talentId: "talent-1", roleId: "role-2" },
  ]);
  assert.deepEqual([...result.keys()].sort(), ["talent-1:role-1", "talent-1:role-2"]);
  assert.equal(result.get("talent-1:role-1")?.status, "withheld");
  assert.equal(result.get("talent-1:role-2")?.status, "not_sent");
  assert.deepEqual(calls, [[["talent-1"], ["role-1", "role-2"]]]);
  assert.equal((await readOrgCurrentProcessClosures(query, [])).size, 0);
  assert.equal(calls.length, 1);
});

test("tells the company agent the closure and the company's note choice without private notes", () => {
  const withheld = formatOrgProcessClosureForCompanyAgent({
    candidateName: "Candidate A",
    closure: resolveOrgProcessClosureNotification({ auditRows: [], stopRows: [withheldStop] }),
    roleId: "role-1",
  });
  assert.equal(
    withheld,
    "Company hiring decision: Candidate A for Role role-1 — the company ended the process 2026-11-09 17:52. Separate closing note to the candidate: the company chose not to have Harper send the candidate a separate closing note; the candidate's screen shows only the closed status."
  );
  assert.doesNotMatch(withheld, /private|notifyCandidateOnClosure|process_stopped/);
  assert.match(
    formatOrgProcessClosureForCompanyAgent({
      candidateName: null,
      closure: { deliveredAt: "2026-11-10T01:55:00.000Z", sentChannel: "email", status: "sent", stoppedAt: "2026-11-09T08:52:58.000Z" },
      roleId: "role-1",
    }),
    /this candidate .* Separate closing note to the candidate: delivered to the candidate 2026-11-10 10:55 \(email\)\.$/
  );
});
