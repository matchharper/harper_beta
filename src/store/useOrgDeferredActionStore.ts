import { create } from "zustand";

// Candidate decisions wait a short moment before reaching the server so the
// company can undo them from the result toast. While waiting, review lists
// treat the candidates as already handled.
export const ORG_UNDO_WINDOW_MS = 5_000;

type PendingAction = {
  recommendationIds: string[];
  /** Sent to the server; too late to undo, but closing the tab would cut it. */
  running: boolean;
  timer: number;
};

const pendingActions = new Map<string, PendingAction>();

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!pendingActions.size) return;
  event.preventDefault();
  event.returnValue = "";
}

function trackPending(id: string, action: PendingAction | null) {
  if (action) pendingActions.set(id, action);
  else pendingActions.delete(id);
  if (typeof window === "undefined") return;
  if (pendingActions.size) {
    window.addEventListener("beforeunload", warnBeforeUnload);
  } else {
    window.removeEventListener("beforeunload", warnBeforeUnload);
  }
}

type OrgDeferredActionStore = {
  /** recommendationId → stage it is moving to (null when it only leaves the list). */
  deferredStages: ReadonlyMap<string, string | null>;
  schedule: (args: {
    delayMs?: number;
    recommendationIds: string[];
    run: () => Promise<unknown>;
    stage?: string | null;
  }) => string;
  cancel: (id: string) => boolean;
};

export const useOrgDeferredActionStore = create<OrgDeferredActionStore>()((
  set
) => {
  const update = (ids: string[], stage: string | null | undefined) =>
    set((state) => {
      const next = new Map(state.deferredStages);
      for (const id of ids) {
        if (stage === undefined) next.delete(id);
        else next.set(id, stage);
      }
      return { deferredStages: next };
    });

  return {
    deferredStages: new Map<string, string | null>(),
    schedule: ({
      delayMs = ORG_UNDO_WINDOW_MS,
      recommendationIds,
      run,
      stage = null,
    }) => {
      const id = crypto.randomUUID();
      update(recommendationIds, stage);
      const timer = window.setTimeout(() => {
        // The leave-page warning stays until every decision has gone out.
        trackPending(id, { recommendationIds, running: true, timer: 0 });
        void Promise.resolve()
          .then(run)
          .catch(() => undefined)
          .finally(() => {
            trackPending(id, null);
            update(recommendationIds, undefined);
          });
      }, delayMs);
      trackPending(id, { recommendationIds, running: false, timer });
      return id;
    },
    cancel: (id) => {
      const action = pendingActions.get(id);
      if (!action || action.running) return false;
      window.clearTimeout(action.timer);
      trackPending(id, null);
      update(action.recommendationIds, undefined);
      return true;
    },
  };
});
