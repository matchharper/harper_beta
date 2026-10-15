import assert from "node:assert/strict";
import test from "node:test";
import { logTalentToolCall, logTalentToolResult } from "./toolLogging";

test("application resume verification content stays out of tool logs", () => {
  const lines: string[] = [];
  const warn = console.warn;
  console.warn = (line) => { lines.push(String(line)); };
  try {
    logTalentToolCall({ source: "test", name: "ready_for_role", input: { content: "private resume input" } });
    logTalentToolResult({ source: "test", name: "ready_for_role", durationMs: 1, result: { savedResumeText: "private resume output" } });
    assert.equal(lines.length, 2);
    assert.doesNotMatch(lines.join("\n"), /private resume/);
    assert.ok(lines.every((line) => line.includes("redacted")));
  } finally {
    console.warn = warn;
  }
});
