import assert from "node:assert/strict";
import test from "node:test";
import {
  compactOrgAgentThinkingLogs,
  upsertOrgAgentThinkingLog,
} from "@/lib/org/agent/thinkingLogs";

test("updates one identified tool row from running to done", () => {
  const running = upsertOrgAgentThinkingLog([], {
    at: "2026-08-14T00:00:00.000Z",
    id: "call-1",
    label: "링크 읽는 중",
    status: "running",
  });
  const done = upsertOrgAgentThinkingLog(running, {
    at: "2026-08-14T00:00:01.000Z",
    id: "call-1",
    label: "링크 확인 완료",
    status: "done",
  });

  assert.deepEqual(done, [
    {
      at: "2026-08-14T00:00:00.000Z",
      id: "call-1",
      label: "링크 확인 완료",
      status: "done",
    },
  ]);
});

test("keeps separate tool calls even when their labels match", () => {
  const first = upsertOrgAgentThinkingLog([], {
    at: "2026-08-14T00:00:00.000Z",
    id: "call-1",
    label: "링크 읽는 중",
    status: "running",
  });
  const second = upsertOrgAgentThinkingLog(first, {
    at: "2026-08-14T00:00:01.000Z",
    id: "call-2",
    label: "링크 읽는 중",
    status: "running",
  });

  assert.equal(second.length, 2);
  assert.deepEqual(
    second.map((log) => log.id),
    ["call-1", "call-2"]
  );
});

test("compacts legacy adjacent running and terminal rows by label", () => {
  const compacted = compactOrgAgentThinkingLogs([
    {
      at: "2026-08-14T00:00:00.000Z",
      label: "링크 읽는 중",
      status: "running",
    },
    {
      at: "2026-08-14T00:00:01.000Z",
      label: "링크 읽는 중",
      status: "done",
    },
    {
      at: "2026-08-14T00:00:02.000Z",
      label: "링크 읽는 중",
      status: "running",
    },
    {
      at: "2026-08-14T00:00:03.000Z",
      label: "링크 읽는 중",
      status: "error",
    },
  ]);

  assert.equal(compacted.length, 2);
  assert.deepEqual(
    compacted.map((log) => log.status),
    ["done", "error"]
  );
});
