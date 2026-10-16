import assert from "node:assert/strict";
import test from "node:test";
import { splitSlackMrkdwn } from "./slackTextChunks";

test("a single oversized link retains the visible name without emitting an invalid Slack block", () => {
  const link = `<https://example.com/${"x".repeat(3100)}|Alex Example>`;
  assert.deepEqual(splitSlackMrkdwn(link + " next", 3000), ["Alex Example next"]);
  assert.deepEqual(splitSlackMrkdwn("before " + link, 3000), ["before", "Alex Example"]);
});
