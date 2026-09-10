import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOrgAgentSlackToolTrace,
  shouldShowLocalSlackToolTrace,
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
      requestContext: "private candidate question",
      nested: { filters: ["python", "seoul"] },
    })
  );

  assert.deepEqual(summary, {
    query: "backend engineer",
    roleId: "role-123",
    apiKey: "[redacted]",
    message: "[redacted]",
    requestContext: "[redacted]",
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

test("local Slack tool trace requires both development and verbose mode", () => {
  assert.equal(
    shouldShowLocalSlackToolTrace({ nodeEnv: "development", verbose: true }),
    true
  );
  assert.equal(
    shouldShowLocalSlackToolTrace({ nodeEnv: "production", verbose: true }),
    false
  );
  assert.equal(
    shouldShowLocalSlackToolTrace({ nodeEnv: "development", verbose: false }),
    false
  );
});

test("formatOrgAgentSlackToolTrace renders compact Slack-safe tool details", () => {
  const trace = formatOrgAgentSlackToolTrace([
    {
      callId: "call-1",
      durationMs: 12.34,
      input: { roleId: "role-1", requestContext: "[redacted]" },
      loop: 1,
      name: "list_contacts",
      resultStatus: "success",
      status: "completed",
      summary: "2개 결과 <확인>",
    },
  ]);

  assert.match(trace, /\*Local tool trace\*/);
  assert.match(trace, /`list_contacts` · completed · 12\.3ms/);
  assert.match(trace, /"requestContext":"\[redacted\]"/);
  assert.match(trace, /2개 결과 &lt;확인&gt;/);
});
