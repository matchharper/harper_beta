import assert from "node:assert/strict";
import test from "node:test";
import { OrgAgentToolInputError } from "@/lib/org/agent/toolAvailability";
import { resolveOrgAgentUpdateDataMode } from "@/lib/org/agent/updateDataMode";

test("complete proposal confirmation takes precedence over repeated draft fields", () => {
  assert.equal(
    resolveOrgAgentUpdateDataMode({
      changes: [
        {
          key: "workspace_memory",
          kind: "append",
          value: "모델이 반복한 변경 내용",
        },
      ],
      proposalAction: "apply",
      proposalId: "proposal-1",
      summary: "모델이 반복한 요약",
    }),
    "proposal"
  );
});

test("incomplete proposal confirmation remains retryable input error", () => {
  assert.throws(
    () =>
      resolveOrgAgentUpdateDataMode({
        changes: [{ key: "workspace_memory", kind: "append", value: "내용" }],
        proposalId: "proposal-1",
      }),
    (error: unknown) =>
      error instanceof OrgAgentToolInputError &&
      error.message ===
        "proposalId and proposalAction must be provided together"
  );
});
