import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getSlackChannelNameError,
  normalizeSlackChannelName,
  SLACK_CHANNEL_CREATION_SCOPES,
  SLACK_CHANNEL_NAME_MAX_LENGTH,
} from "./slackChannelCreation";

test("normalizes a pasted Slack channel marker", () => {
  assert.equal(normalizeSlackChannelName("  #hiring-team  "), "hiring-team");
});

test("accepts Slack API channel names", () => {
  assert.equal(getSlackChannelNameError("hiring-team_2026"), null);
  assert.equal(
    getSlackChannelNameError("a".repeat(SLACK_CHANNEL_NAME_MAX_LENGTH)),
    null
  );
});

test("rejects empty, long, uppercase, spaced, and non-latin channel names", () => {
  assert.match(getSlackChannelNameError("") ?? "", /입력/);
  assert.match(
    getSlackChannelNameError("a".repeat(SLACK_CHANNEL_NAME_MAX_LENGTH + 1)) ??
      "",
    /80자/
  );
  assert.match(getSlackChannelNameError("Hiring") ?? "", /영문 소문자/);
  assert.match(getSlackChannelNameError("hiring team") ?? "", /영문 소문자/);
  assert.match(getSlackChannelNameError("채용") ?? "", /영문 소문자/);
});

test("requests both public and private channel creation scopes", () => {
  assert.deepEqual(SLACK_CHANNEL_CREATION_SCOPES, [
    "channels:manage",
    "groups:write",
  ]);

  for (const manifestPath of [
    "../../../slack/harper-manifest.yaml",
    "../../../slack/harper-local-manifest.yaml",
  ]) {
    const manifest = readFileSync(
      new URL(manifestPath, import.meta.url),
      "utf8"
    );
    for (const scope of SLACK_CHANNEL_CREATION_SCOPES) {
      assert.match(manifest, new RegExp(`\\n\\s+- ${scope}(?:\\n|$)`));
    }
  }
});
