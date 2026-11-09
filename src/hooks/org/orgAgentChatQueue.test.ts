import assert from "node:assert/strict";
import test from "node:test";
import type {
  OrgAgentQueuedMessage,
  OrgAgentTurnResult,
} from "@/lib/org/agent/chatQueue";
import { useOrgAgentLiveChatStore } from "@/store/useOrgAgentLiveChatStore";
import {
  isOrgAgentTurnActive,
  sendOrgAgentQueued,
  stopOrgAgentTurn,
  takeBackOrgAgentQueued,
  type OrgAgentTurnControl,
} from "./orgAgentChatQueue";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function message(id: string, text = id): OrgAgentQueuedMessage {
  return {
    attachments: [],
    createdAt: new Date().toISOString(),
    draft: { attachments: [], text, tokens: [] },
    id,
    mentions: [],
    message: text,
    model: null,
  };
}

/** A stand-in for a turn: the test decides when it ends and how. */
function fakeTurns() {
  const turns: Array<{
    control: OrgAgentTurnControl;
    finish: (result: OrgAgentTurnResult, options?: { tail?: boolean }) => void;
    item: OrgAgentQueuedMessage;
  }> = [];
  const run = (item: OrgAgentQueuedMessage, control: OrgAgentTurnControl) =>
    new Promise<OrgAgentTurnResult>((resolve) => {
      turns.push({
        control,
        finish: (result, options) => {
          control.onEnded(result);
          // A real turn refreshes the screen after it ends; `tail` keeps it open.
          if (!options?.tail) resolve(result);
        },
        item,
      });
    });
  return { run, turns };
}

function reset(key: string) {
  useOrgAgentLiveChatStore.setState((state) => ({
    queues: { ...state.queues, [key]: [] },
    restores: { ...state.restores, [key]: [] },
    notices: {},
  }));
}

test("a message sent while Harper answers waits and goes out when that reply ends, one at a time", async () => {
  const key = "role:workspace:queue-order";
  reset(key);
  const { run, turns } = fakeTurns();
  const order: string[] = [];
  const first = sendOrgAgentQueued(key, message("first"), run).then(() => order.push("first"));
  const second = sendOrgAgentQueued(key, message("second"), run).then(() => order.push("second"));
  const third = sendOrgAgentQueued(key, message("third"), run).then(() => order.push("third"));
  await tick();
  assert.equal(turns.length, 1, "only one turn runs");
  assert.deepEqual(useOrgAgentLiveChatStore.getState().queues[key]?.map((item) => item.id), ["second", "third"]);

  // The turn is over while its refresh still runs: the next one may start.
  turns[0].finish({ outcome: "completed", userMessageSaved: true }, { tail: true });
  await tick();
  assert.equal(turns.length, 2);
  assert.equal(turns[1].item.id, "second");
  assert.equal(isOrgAgentTurnActive(key), true);

  turns[1].finish({ outcome: "completed", userMessageSaved: true });
  await tick();
  turns[2].finish({ outcome: "completed", userMessageSaved: true });
  await Promise.all([second, third]);
  assert.equal(isOrgAgentTurnActive(key), false);
  assert.deepEqual(order, ["second", "third"]);
  void first;
});

test("a send that never reached the conversation comes back to the input with everything after it, in order", async () => {
  const key = "role:workspace:queue-handback";
  reset(key);
  const { run, turns } = fakeTurns();
  const results: string[] = [];
  const first = sendOrgAgentQueued(key, message("a", "첫 메시지"), run).then((result) => results.push(`a:${result.outcome}`));
  const second = sendOrgAgentQueued(key, message("b", "둘째"), run).then((result) => results.push(`b:${result.outcome}`));
  const third = sendOrgAgentQueued(key, message("c", "셋째"), run).then((result) => results.push(`c:${result.outcome}`));
  await tick();
  turns[0].finish({ outcome: "failed_unsaved", userMessageSaved: false });
  await Promise.all([first, second, third]);
  assert.equal(turns.length, 1, "nothing else was sent");
  assert.deepEqual(
    useOrgAgentLiveChatStore.getState().takeRestores(key).map((draft) => draft.text),
    ["첫 메시지", "둘째", "셋째"]
  );
  assert.deepEqual(results.sort(), ["a:failed_unsaved", "b:returned", "c:returned"]);
  assert.deepEqual(useOrgAgentLiveChatStore.getState().queues[key] ?? [], []);
});

test("stop cancels the running reply; once the message is saved, the next waiting one goes out", async () => {
  const key = "role:workspace:queue-stop";
  reset(key);
  const { run, turns } = fakeTurns();
  void sendOrgAgentQueued(key, message("long"), run);
  const next = sendOrgAgentQueued(key, message("redirect", "그거 말고 백엔드로"), run);
  await tick();
  assert.equal(stopOrgAgentTurn(key), true);
  assert.equal(turns[0].control.signal.aborted, true);
  assert.equal(useOrgAgentLiveChatStore.getState().chats[key]?.stopping, true);
  turns[0].finish({ lastMessageId: 41, outcome: "stopped", userMessageSaved: true });
  await tick();
  assert.deepEqual(useOrgAgentLiveChatStore.getState().notices[key], { afterMessageId: 41, kind: "stopped" });
  assert.equal(turns[1]?.item.id, "redirect");
  assert.deepEqual(
    useOrgAgentLiveChatStore.getState().notices[key],
    { afterMessageId: 41, kind: "stopped" },
    "the note stays after the stopped turn while the next one runs"
  );
  turns[1].finish({ outcome: "completed", userMessageSaved: true });
  await next;
  assert.equal(stopOrgAgentTurn(key), false, "nothing left to stop");
  useOrgAgentLiveChatStore.getState().finish(key);
});

test("stopped before the message was saved: it comes back to the input instead", async () => {
  const key = "role:workspace:queue-stop-early";
  reset(key);
  const { run, turns } = fakeTurns();
  const sent = sendOrgAgentQueued(key, message("early", "방금 보낸 말"), run);
  await tick();
  stopOrgAgentTurn(key);
  turns[0].finish({ outcome: "stopped", userMessageSaved: false });
  await sent;
  assert.deepEqual(
    useOrgAgentLiveChatStore.getState().takeRestores(key).map((draft) => draft.text),
    ["방금 보낸 말"]
  );
  useOrgAgentLiveChatStore.getState().finish(key);
});

test("a waiting message can be taken back into the input before it goes out", async () => {
  const key = "role:workspace:queue-takeback";
  reset(key);
  const { run, turns } = fakeTurns();
  void sendOrgAgentQueued(key, message("running"), run);
  const waiting = sendOrgAgentQueued(key, message("waiting", "보내지 말 것"), run);
  await tick();
  assert.equal(takeBackOrgAgentQueued(key, "waiting"), true);
  assert.deepEqual((await waiting).outcome, "returned");
  assert.deepEqual(
    useOrgAgentLiveChatStore.getState().takeRestores(key).map((draft) => draft.text),
    ["보내지 말 것"]
  );
  turns[0].finish({ outcome: "completed", userMessageSaved: true });
  await tick();
  assert.equal(turns.length, 1, "the taken-back message was not sent");
  assert.equal(takeBackOrgAgentQueued(key, "waiting"), false);
});

test("onComplete runs only for a turn that completed", async () => {
  const key = "role:workspace:queue-complete";
  reset(key);
  const { run, turns } = fakeTurns();
  let completed = 0;
  const ok = sendOrgAgentQueued(key, message("ok"), run, { onComplete: () => completed++ });
  const failed = sendOrgAgentQueued(key, message("failed"), run, { onComplete: () => completed++ });
  await tick();
  turns[0].finish({ outcome: "completed", userMessageSaved: true });
  await tick();
  turns[1].finish({ outcome: "failed_saved", userMessageSaved: true });
  await Promise.all([ok, failed]);
  assert.equal(completed, 1);
});
