export type XaiCompletedTranscript = {
  itemId: string;
  text: string;
  turnId: number;
};

export type XaiTranscriptTurnState = {
  assistantOutputStarted: boolean;
  deliveredTurnId: number;
  pendingTranscript: XaiCompletedTranscript | null;
  responseCompleted: boolean;
  turnId: number;
};

export type XaiTranscriptTransition = {
  deliveredTranscript: XaiCompletedTranscript | null;
  discardedItemId: string;
  state: XaiTranscriptTurnState;
};

export function createXaiTranscriptTurnState(): XaiTranscriptTurnState {
  return {
    assistantOutputStarted: false,
    deliveredTurnId: 0,
    pendingTranscript: null,
    responseCompleted: false,
    turnId: 0,
  };
}

function transition(
  state: XaiTranscriptTurnState,
  options?: {
    deliveredTranscript?: XaiCompletedTranscript | null;
    discardedItemId?: string;
  }
): XaiTranscriptTransition {
  return {
    deliveredTranscript: options?.deliveredTranscript ?? null,
    discardedItemId: options?.discardedItemId ?? "",
    state,
  };
}

function flushPendingTranscript(
  state: XaiTranscriptTurnState
): XaiTranscriptTransition {
  const pendingTranscript = state.pendingTranscript;
  if (
    !pendingTranscript ||
    pendingTranscript.turnId === state.deliveredTurnId
  ) {
    return transition({
      ...state,
      pendingTranscript: null,
    });
  }

  return transition(
    {
      ...state,
      deliveredTurnId: pendingTranscript.turnId,
      pendingTranscript: null,
    },
    { deliveredTranscript: pendingTranscript }
  );
}

export function queueXaiCompletedTranscript(
  state: XaiTranscriptTurnState,
  args: {
    itemId: string;
    text: string;
  }
): XaiTranscriptTransition {
  const text = args.text.trim();
  if (!text) return transition(state);

  const turnId = state.turnId || 1;
  const stateWithTurn = state.turnId === turnId ? state : { ...state, turnId };
  if (stateWithTurn.deliveredTurnId === turnId) {
    return transition(stateWithTurn, { discardedItemId: args.itemId });
  }

  const queuedState = {
    ...stateWithTurn,
    pendingTranscript: {
      itemId: args.itemId,
      text,
      turnId,
    },
  };

  return queuedState.responseCompleted
    ? flushPendingTranscript(queuedState)
    : transition(queuedState);
}

export function markXaiAssistantOutputStarted(
  state: XaiTranscriptTurnState
): XaiTranscriptTurnState {
  return state.assistantOutputStarted
    ? state
    : { ...state, assistantOutputStarted: true };
}

export function markXaiResponseCreated(
  state: XaiTranscriptTurnState
): XaiTranscriptTurnState {
  return state.responseCompleted
    ? { ...state, responseCompleted: false }
    : state;
}

export function completeXaiResponse(
  state: XaiTranscriptTurnState,
  status: string
): XaiTranscriptTransition {
  if (status === "cancelled") return transition(state);

  return flushPendingTranscript({
    ...state,
    responseCompleted: true,
  });
}

export function beginXaiSpeech(state: XaiTranscriptTurnState): {
  continuesCurrentUserTurn: boolean;
  transition: XaiTranscriptTransition;
} {
  const currentTurnId = state.turnId;
  const previousTurnCompleted =
    state.assistantOutputStarted ||
    state.responseCompleted ||
    state.deliveredTurnId === currentTurnId;
  const flushed = state.assistantOutputStarted
    ? flushPendingTranscript(state)
    : transition(state);
  const continuesCurrentUserTurn = currentTurnId > 0 && !previousTurnCompleted;

  return {
    continuesCurrentUserTurn,
    transition: {
      ...flushed,
      state: {
        ...flushed.state,
        assistantOutputStarted: false,
        responseCompleted: false,
        turnId:
          currentTurnId === 0 || previousTurnCompleted
            ? currentTurnId + 1
            : currentTurnId,
      },
    },
  };
}
