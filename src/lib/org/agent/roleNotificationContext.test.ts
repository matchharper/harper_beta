import assert from "node:assert/strict";
import test from "node:test";
import { buildRoleCreationUserPrompt } from "./roleCreationPrompt";
import { serializeOrgAgentToolResult } from "./promptFormat";

test("draft prompt identifies the live channel rather than the original creation channel", () => {
  const prompt = buildRoleCreationUserPrompt({
    attachments: [], history: [], mentions: [], userMessage: "여기로 해줘",
    slackContext: { channelId: "current-channel", channelName: "current" },
    state: { assigneeUserIds: [], channels: [
      { channelId: "original-channel", channelName: "original", enabled: true },
      { channelId: "current-channel", channelName: "current", enabled: true },
    ], currentUser: { userId: "actor", name: "Alex" }, members: [],
      metadata: { slackRoleCreationThread: { threadPermalink: "https://example.invalid/original" } },
      role: { name: "Engineer", criteria: [] }, workspace: { companyName: "Example" },
    } as any,
  });
  const state = JSON.parse(prompt.split("<ROLE_CREATION_STATE>\n")[1].split("\n</ROLE_CREATION_STATE>")[0]);
  assert.deepEqual(state.currentSlackChannel, { channelId: "current-channel", channelName: "current" });
  assert.equal(state.currentUser.userId, "actor");
});

test("general read keeps exact setup targets and write returns verified unchanged lifecycle", () => {
  const notification = { confirmedChannelIds: [], confirmedAssigneeUserId: null,
    channels: [{ channelId: "C_CURRENT", current: true, enabled: true }],
    availableAssignees: [{ userId: "actor", name: "Alex", current: true }], assigneeUserIds: [] };
  const read = serializeOrgAgentToolResult("read_role", { role: { roleId: "draft", name: "Engineer" }, notification });
  assert.ok(read.includes(JSON.stringify(notification)));
  const saved = { status: "saved", roleId: "draft", roleStatus: "draft", assignees: [{ userId: "actor", name: "Alex" }], channels: [{ channelId: "C_CURRENT" }], hiringStatusChanged: false };
  assert.deepEqual(JSON.parse(serializeOrgAgentToolResult("set_role_notification", saved)), saved);
});
