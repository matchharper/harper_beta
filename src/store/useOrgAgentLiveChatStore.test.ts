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
    isCreatingRole: false,
    optimisticUserMessage,
    stopping: false,
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

test("waiting messages, handed-back drafts and the stop note outlive the finished turn", () => {
  const key = getOrgAgentLiveChatKey({ mode: "role", roleId: "role-2", workspaceId: "workspace-1" });
  const store = useOrgAgentLiveChatStore;
  const item = (id: string) => ({
    attachments: [],
    createdAt: "2026-11-06T13:00:00.000Z",
    draft: null,
    id,
    mentions: [],
    message: id,
    model: null,
  });
  store.getState().start(key, optimisticUserMessage);
  store.getState().enqueue(key, item("a"));
  store.getState().enqueue(key, item("b"));
  store.getState().pushRestores(key, [{ attachments: [], text: "돌아온 말", tokens: [] }]);
  store.getState().setNotice(key, { afterMessageId: 7, kind: "stopped" });
  store.getState().finish(key);

  assert.equal(store.getState().chats[key], undefined);
  assert.equal(store.getState().dequeue(key)?.id, "a");
  assert.equal(store.getState().removeQueued(key, "missing"), undefined);
  assert.equal(store.getState().removeQueued(key, "b")?.id, "b");
  assert.equal(store.getState().queues[key], undefined, "an empty line is removed");
  assert.deepEqual(store.getState().takeRestores(key).map((draft) => draft.text), ["돌아온 말"]);
  assert.deepEqual(store.getState().takeRestores(key), []);
  assert.deepEqual(store.getState().notices[key], { afterMessageId: 7, kind: "stopped" });
  store.getState().setNotice(key, null);
  assert.equal(store.getState().notices[key], undefined);
});
