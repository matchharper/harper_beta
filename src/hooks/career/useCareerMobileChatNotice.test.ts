import assert from "node:assert/strict";
import test from "node:test";
import { MobileChatNoticeStore } from "./useCareerMobileChatNotice";

const update = (
  store: MobileChatNoticeStore,
  args: Partial<Parameters<MobileChatNoticeStore["updateLatest"]>[0]> = {}
) => {
  store.updateLatest({
    conversationKey: "conversation-1",
    latestKey: null,
    open: false,
    pending: false,
    ready: true,
    visibleMs: 4_800,
    ...args,
  });
};

test("treats asynchronously hydrated history as the initial baseline", () => {
  const store = new MobileChatNoticeStore();

  update(store, {
    conversationKey: null,
    ready: false,
  });
  update(store, {
    latestKey: "existing-assistant-message",
    ready: false,
  });
  update(store, {
    latestKey: "existing-assistant-message",
    ready: true,
  });

  assert.deepEqual(store.getSnapshot(), {
    conversationKey: "conversation-1",
    initialized: true,
    lastSeenKey: "existing-assistant-message",
    promptKey: null,
    promptVisibleUntil: null,
    unreadKey: null,
  });
});

test("shows a notice for an assistant message added after hydration", () => {
  const store = new MobileChatNoticeStore();

  update(store, {
    latestKey: "existing-assistant-message",
  });
  update(store, {
    latestKey: "new-assistant-message",
  });

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.lastSeenKey, "new-assistant-message");
  assert.equal(snapshot.promptKey, "new-assistant-message");
  assert.equal(snapshot.unreadKey, "new-assistant-message");
  assert.equal(typeof snapshot.promptVisibleUntil, "number");
});

test("shows the first assistant reply for a conversation that started empty", () => {
  const store = new MobileChatNoticeStore();

  update(store);
  update(store, {
    latestKey: "first-assistant-message",
  });

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.promptKey, "first-assistant-message");
  assert.equal(snapshot.unreadKey, "first-assistant-message");
});

test("waits for the whole assistant response to settle before showing a notice", () => {
  const store = new MobileChatNoticeStore();

  update(store, {
    latestKey: "existing-assistant-message",
  });
  update(store, {
    latestKey: "streamed-assistant-message",
    pending: true,
  });

  assert.deepEqual(store.getSnapshot(), {
    conversationKey: "conversation-1",
    initialized: true,
    lastSeenKey: "existing-assistant-message",
    promptKey: null,
    promptVisibleUntil: null,
    unreadKey: null,
  });

  update(store, {
    latestKey: "streamed-assistant-message",
    pending: false,
  });

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.lastSeenKey, "streamed-assistant-message");
  assert.equal(snapshot.promptKey, "streamed-assistant-message");
  assert.equal(snapshot.unreadKey, "streamed-assistant-message");
});

test("does not notify after a pending response was already seen while open", () => {
  const store = new MobileChatNoticeStore();

  update(store, {
    latestKey: "existing-assistant-message",
  });
  update(store, {
    latestKey: "streamed-assistant-message",
    open: true,
    pending: true,
  });
  update(store, {
    latestKey: "streamed-assistant-message",
    pending: false,
  });

  assert.deepEqual(store.getSnapshot(), {
    conversationKey: "conversation-1",
    initialized: true,
    lastSeenKey: "streamed-assistant-message",
    promptKey: null,
    promptVisibleUntil: null,
    unreadKey: null,
  });
});

test("re-baselines without a notice when the conversation changes", () => {
  const store = new MobileChatNoticeStore();

  update(store, {
    latestKey: "conversation-1-message",
  });
  update(store, {
    conversationKey: "conversation-2",
    latestKey: "conversation-2-existing-message",
  });

  assert.deepEqual(store.getSnapshot(), {
    conversationKey: "conversation-2",
    initialized: true,
    lastSeenKey: "conversation-2-existing-message",
    promptKey: null,
    promptVisibleUntil: null,
    unreadKey: null,
  });
});
