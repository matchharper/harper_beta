import assert from "node:assert/strict";
import test from "node:test";
import type { OrgAgentMessage } from "@/lib/org/agent/types";
import {
  getOrgAgentLiveChatKey,
  useOrgAgentLiveChatStore,
} from "@/store/useOrgAgentLiveChatStore";

const optimisticUserMessage: OrgAgentMessage = {
  authorUserId: "user-1",
  content: "JD 링크로 만들어줘",
  createdAt: "2026-08-18T00:00:00.000Z",
  id: -1,
  mentions: [],
  metadata: {},
  model: null,
  role: "user",
  sourceSurface: "web",
  status: "pending",
  thinkingLogs: [],
};

test("keeps role-creation progress while the new role receives its id", () => {
  const workspaceId = "workspace-1";
  const newRoleKey = getOrgAgentLiveChatKey({
    mode: "role_creation",
    workspaceId,
  });
  const createdRoleKey = getOrgAgentLiveChatKey({
    mode: "role_creation",
    roleId: "role-1",
    workspaceId,
  });
  const store = useOrgAgentLiveChatStore;

  store.setState({ chats: {} });
  store.getState().start(newRoleKey, optimisticUserMessage);
  store.getState().patch(newRoleKey, {
    thinkingLogs: [
      {
        at: "2026-08-18T00:00:01.000Z",
        label: "JD 내용을 읽는 중",
        status: "running",
      },
    ],
  });
  store.getState().move(newRoleKey, createdRoleKey);

  assert.equal(store.getState().chats[newRoleKey], undefined);
  assert.deepEqual(store.getState().chats[createdRoleKey], {
    assistantStatus: "pending",
    error: null,
    isStreaming: true,
    optimisticUserMessage,
    streamingText: "",
    thinkingLogs: [
      {
        at: "2026-08-18T00:00:01.000Z",
        label: "JD 내용을 읽는 중",
        status: "running",
      },
    ],
  });

  store.getState().finish(createdRoleKey);
  assert.equal(store.getState().chats[createdRoleKey], undefined);
});
