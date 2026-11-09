import {
  orgAgentDraftFromQueuedMessage,
  shouldHandBackOrgAgentQueue,
  type OrgAgentQueuedMessage,
  type OrgAgentSendResult,
  type OrgAgentTurnResult,
} from "@/lib/org/agent/chatQueue";
import { useOrgAgentLiveChatStore } from "@/store/useOrgAgentLiveChatStore";

/**
 * One company chat sends one turn at a time. A message sent while Harper is
 * still answering waits here and goes out as soon as that reply ends, in the
 * order the team wrote them. Kept outside React so the line keeps moving when
 * the screen that started it is gone.
 */

export type OrgAgentTurnControl = {
  /** Called once, when the turn itself is over (before its follow-up refreshes). */
  onEnded: (result: OrgAgentTurnResult) => void;
  signal: AbortSignal;
};

export type OrgAgentTurnRunner = (
  item: OrgAgentQueuedMessage,
  control: OrgAgentTurnControl
) => Promise<OrgAgentTurnResult>;

const activeTurns = new Map<string, AbortController>();
const waiters = new Map<
  string,
  {
    onComplete?: () => void;
    resolve: (result: OrgAgentSendResult) => void;
  }
>();

function settle(id: string, result: OrgAgentSendResult) {
  const waiter = waiters.get(id);
  waiters.delete(id);
  waiter?.resolve(result);
  if (result.outcome === "completed") waiter?.onComplete?.();
}

export function isOrgAgentTurnActive(key: string) {
  return activeTurns.has(key);
}

export function sendOrgAgentQueued(
  key: string,
  item: OrgAgentQueuedMessage,
  run: OrgAgentTurnRunner,
  options: { onComplete?: () => void } = {}
): Promise<OrgAgentSendResult> {
  return new Promise((resolve) => {
    waiters.set(item.id, { onComplete: options.onComplete, resolve });
    useOrgAgentLiveChatStore.getState().enqueue(key, item);
    drainOrgAgentQueue(key, run);
  });
}

export function drainOrgAgentQueue(key: string, run: OrgAgentTurnRunner) {
  if (activeTurns.has(key)) return;
  const store = useOrgAgentLiveChatStore.getState();
  const next = store.dequeue(key);
  if (!next) return;
  const controller = new AbortController();
  activeTurns.set(key, controller);

  let ended = false;
  const onEnded = (result: OrgAgentTurnResult) => {
    if (ended) return;
    ended = true;
    if (activeTurns.get(key) === controller) activeTurns.delete(key);
    const liveStore = useOrgAgentLiveChatStore.getState();
    if (result.outcome === "stopped") {
      liveStore.setNotice(key, {
        afterMessageId: result.lastMessageId ?? null,
        kind: "stopped",
      });
    }
    if (shouldHandBackOrgAgentQueue(result)) {
      // It never reached the conversation: give it and everything after it
      // back to the input, so nothing goes out of order.
      const rest = liveStore.takeQueue(key);
      liveStore.pushRestores(
        key,
        [next, ...rest].map(orgAgentDraftFromQueuedMessage)
      );
      for (const item of rest) {
        settle(item.id, { outcome: "returned", userMessageSaved: false });
      }
      return;
    }
    drainOrgAgentQueue(key, run);
  };

  void run(next, { onEnded, signal: controller.signal })
    .catch(
      (): OrgAgentTurnResult => ({
        outcome: controller.signal.aborted ? "stopped" : "failed_unsaved",
        userMessageSaved: false,
      })
    )
    .then((result) => {
      onEnded(result);
      settle(next.id, result);
    });
}

/** Stops the reply that is running now; the next waiting message, if any, goes out after it. */
export function stopOrgAgentTurn(key: string) {
  const controller = activeTurns.get(key);
  if (!controller || controller.signal.aborted) return false;
  useOrgAgentLiveChatStore.getState().patch(key, { stopping: true });
  controller.abort();
  return true;
}

/** Takes a waiting message back into the input instead of sending it. */
export function takeBackOrgAgentQueued(key: string, id: string) {
  const store = useOrgAgentLiveChatStore.getState();
  const removed = store.removeQueued(key, id);
  if (!removed) return false;
  store.pushRestores(key, [orgAgentDraftFromQueuedMessage(removed)]);
  settle(id, { outcome: "returned", userMessageSaved: false });
  return true;
}
