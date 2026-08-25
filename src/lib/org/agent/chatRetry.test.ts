import assert from "node:assert/strict";
import test from "node:test";
import { shouldRetryOrgAgentTerminalInputError } from "@/lib/org/agent/terminalInputRetry";

test("malformed terminal tool input can be corrected within the same turn", () => {
  assert.equal(
    shouldRetryOrgAgentTerminalInputError({
      isToolInputError: true,
      terminalMutationUsed: false,
      toolName: "contact_talent",
    }),
    true
  );
  assert.equal(
    shouldRetryOrgAgentTerminalInputError({
      isToolInputError: true,
      terminalMutationUsed: true,
      toolName: "contact_talent",
    }),
    false
  );
  assert.equal(
    shouldRetryOrgAgentTerminalInputError({
      isToolInputError: true,
      terminalMutationUsed: false,
      toolName: "read_talent",
    }),
    false
  );
});
