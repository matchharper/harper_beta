import assert from "node:assert/strict";
import test from "node:test";
import {
  filterUnclaimedSlackChannels,
  shouldRevokeSlackBotToken,
} from "./slackWorkspaceRouting";

test("filters channels claimed by any Harper workspace in the Slack team", () => {
  const channels = [
    { channelId: "C-AVAILABLE", channelName: "available" },
    { channelId: "C-CURRENT", channelName: "current" },
    { channelId: "C-OTHER", channelName: "other-workspace" },
  ];

  assert.deepEqual(
    filterUnclaimedSlackChannels(channels, ["C-CURRENT", "C-OTHER"]),
    [{ channelId: "C-AVAILABLE", channelName: "available" }]
  );
});

test("keeps the Slack bot token while another Harper workspace is connected", () => {
  assert.equal(shouldRevokeSlackBotToken(1), false);
  assert.equal(shouldRevokeSlackBotToken(2), false);
  assert.equal(shouldRevokeSlackBotToken(0), true);
});
