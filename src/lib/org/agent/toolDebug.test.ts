import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeOrgAgentToolInput,
  summarizeOrgAgentToolResult,
} from "./toolDebug";

test("summarizeOrgAgentToolInput keeps useful arguments and redacts sensitive fields", () => {
  const summary = summarizeOrgAgentToolInput(
    JSON.stringify({
      query: "backend engineer",
      roleId: "role-123",
      apiKey: "secret-key",
      message: "private Slack message",
      nested: { filters: ["python", "seoul"] },
    })
  );

  assert.deepEqual(summary, {
    query: "backend engineer",
    roleId: "role-123",
    apiKey: "[redacted]",
    message: "[redacted]",
    nested: { filters: ["python", "seoul"] },
  });
});

test("summarizeOrgAgentToolInput does not expose malformed raw arguments", () => {
  assert.deepEqual(summarizeOrgAgentToolInput('{"token":"secret"'), {
    invalidJson: true,
    length: 17,
  });
});

test("summarizeOrgAgentToolResult reports shape instead of returned records", () => {
  assert.deepEqual(
    summarizeOrgAgentToolResult({
      candidates: [{ name: "private candidate" }, { name: "another" }],
      cursor: "cursor-value",
    }),
    {
      keys: ["candidates", "cursor"],
      collectionSizes: { candidates: 2 },
    }
  );
});
